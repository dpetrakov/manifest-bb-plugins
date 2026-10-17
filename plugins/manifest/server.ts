// bb-plugin-manifest — backend (EP-069..EP-071, ADR-046, docs/outreach/bb-plugin.md).
//
// The plugin is the BB workplace of Manifest. Manifest stays the only store of
// data and rights; this backend is its MCP client:
//   - panels call Manifest tools through RPC (the token never reaches the browser);
//   - the agent of an organisation's chat gets the same tools as native BB tools;
//   - sign-in exchanges email + password for a token once; the password is not kept.
import { hostname } from "node:os";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  CONTRACT_VERSION,
  ManifestError,
  callTool,
  login,
  logout,
  normalizeBaseUrl,
  type ActorKind,
} from "./lib/mcp-client";
import {
  AGENT_TOOLS,
  AGENT_TOOL_NAMES,
  PANEL_TOOLS,
  READ_TOOLS,
  agentText,
  companyOf,
  filterSchema,
  quote,
  toolsFor,
  type Filter,
  type ToolScope,
} from "./lib/tools";

/** Realtime channel: a company changed (panel or agent); payload { companyId }. */
export const COMPANY_CHANGED = "manifest-company-changed";
/** Realtime channel: connection status changed (sign-in / sign-out). */
export const STATUS_CHANGED = "manifest-status-changed";
/** Realtime channel: something in the registry changed (refresh the dashboard). */
export const REGISTRY_CHANGED = "manifest-registry-changed";
/** Realtime channel: the filter of a dashboard topic changed; payload { threadId, filter }. */
export const TOPIC_FILTER = "manifest-topic-filter";
/** Realtime channel: the list of dashboard topics changed. */
export const TOPICS_CHANGED = "manifest-topics-changed";
/** Capability of Manifest's work layer (W-15). */
export const CAPABILITY_WORK = "outreach.work";
/** Name of the bb thread section that holds the dashboard topics. */
export const SECTION_NAME = "Аутрич";

const statusSchema = z.object({
  connected: z.boolean(),
  url: z.string(),
  email: z.string(),
  canView: z.boolean(),
  canManage: z.boolean(),
  /** Manifest has the work layer: dashboard, touches, batches. */
  canWork: z.boolean(),
  /** unauthorized | unavailable | contract | null */
  problem: z.string().nullable(),
  message: z.string(),
});
export type Status = z.infer<typeof statusSchema>;

const topicSchema = z.object({ threadId: z.string(), title: z.string(), createdAt: z.string() });
export type Topic = z.infer<typeof topicSchema>;

export const rpcContract = defineRpcContract({
  status: { input: z.null(), output: statusSchema },
  login: {
    input: z.object({ url: z.string().min(1).max(300), email: z.string().min(3).max(200), password: z.string().min(1).max(500) }),
    output: statusSchema,
  },
  logout: { input: z.null(), output: statusSchema },
  tool: {
    input: z.object({ name: z.string(), args: z.record(z.string(), z.unknown()) }),
    output: z.object({ result: z.unknown() }),
  },
  chat_get: { input: z.object({ companyId: z.string().min(1).max(64) }), output: z.object({ threadId: z.string().nullable() }) },
  chat_link: {
    input: z.object({ companyId: z.string().min(1).max(64), threadId: z.string().min(1).max(64) }),
    output: z.object({ ok: z.boolean() }),
  },
  // ---- dashboard topics (W-15) ----
  section_ensure: { input: z.null(), output: z.object({ sectionId: z.string().nullable() }) },
  topics_list: { input: z.null(), output: z.object({ topics: z.array(topicSchema) }) },
  topic_add: { input: z.object({ threadId: z.string().min(1).max(64), title: z.string().max(200) }), output: z.object({ ok: z.boolean() }) },
  topic_filter_get: { input: z.object({ threadId: z.string().min(1).max(64) }), output: z.object({ filter: filterSchema }) },
  topic_filter_set: {
    input: z.object({ threadId: z.string().min(1).max(64), filter: filterSchema }),
    output: z.object({ filter: filterSchema }),
  },
  seen_get: { input: z.null(), output: z.object({ at: z.string().nullable() }) },
  seen_set: { input: z.object({ at: z.string().max(40) }), output: z.object({ ok: z.boolean() }) },
});

const threadKey = (companyId: string) => `thread:${companyId}`;

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    manifestUrl: {
      type: "string",
      label: "Адрес Manifest",
      description: "Например, https://manifest.example.com. Задаётся при входе в разделе «Подключение к Manifest».",
    },
    email: { type: "string", label: "Email", description: "Email сотрудника в Manifest." },
    token: {
      type: "string",
      label: "Токен доступа",
      description: "Выдаётся Manifest при входе. Пароль плагин не хранит.",
      secret: true,
    },
  });

  // The token belongs to the address it was issued for: if the address is
  // changed in the settings without a new sign-in, the token is not sent to
  // the new host.
  const TOKEN_URL = "token-url";
  async function connection() {
    const s = await settings.get();
    let url = "";
    try {
      url = normalizeBaseUrl(s.manifestUrl ?? "");
    } catch {
      url = "";
    }
    const issuedFor = await bb.storage.kv.get<string>(TOKEN_URL);
    const token = url && issuedFor === url ? (s.token ?? "") : "";
    return { url, email: s.email ?? "", token };
  }

  // Whether Manifest has the work layer; agent configuration is synchronous,
  // so the last known answer is kept here and in the plugin storage.
  const WORK_CAP = "work-capability";
  let workCapability = (await bb.storage.kv.get<boolean>(WORK_CAP)) ?? false;

  const TOPICS = "topics";
  const SECTION = "section-id";
  const SEEN = "seen-at";

  async function topics(): Promise<Topic[]> {
    return (await bb.storage.kv.get<Topic[]>(TOPICS)) ?? [];
  }

  /** Publishes the «changed» signals after a mutating tool. */
  function changed(name: string, args: Record<string, unknown>, structured: unknown) {
    if (READ_TOOLS.has(name)) return;
    const ids = new Set<string>();
    // Batch and segment tools carry their own id, not a company id.
    const own = name.startsWith("outreach_batch_") || name.includes("segment") || name === "outreach_set_cadence";
    const one = own ? null : companyOf(args);
    if (one) ids.add(one);
    // Batch apply / revert: every company of the batch.
    const items = (structured as { items?: { company_id?: unknown }[] } | null)?.items;
    if (name.startsWith("outreach_batch_") && Array.isArray(items)) {
      for (const it of items) if (typeof it.company_id === "string") ids.add(it.company_id);
    }
    for (const companyId of ids) bb.realtime.publish(COMPANY_CHANGED, { companyId });
    bb.realtime.publish(REGISTRY_CHANGED, {});
  }

  async function call(name: string, args: Record<string, unknown>, actor: ActorKind, signal?: AbortSignal) {
    const c = await connection();
    return callTool(c.url, c.token, name, args, actor, fetch, signal);
  }

  async function status(): Promise<Status> {
    const c = await connection();
    const base: Status = { connected: false, url: c.url, email: c.email, canView: false, canManage: false, canWork: false, problem: null, message: "" };
    if (!c.url || !c.token) return { ...base, problem: "unauthorized", message: "Плагин не подключён: войдите в настройках плагина." };
    try {
      const { structured } = await call("manifest_whoami", {}, "panel");
      const who = structured as {
        email?: string;
        contract?: number;
        can_view_outreach?: boolean;
        can_manage_outreach?: boolean;
        capabilities?: string[];
      };
      if (who.contract !== CONTRACT_VERSION) {
        return { ...base, problem: "contract", message: `Версия Manifest не совпадает с плагином (контракт ${who.contract ?? "?"}, нужен ${CONTRACT_VERSION}). Обновите плагин.` };
      }
      const canWork = Array.isArray(who.capabilities) && who.capabilities.includes(CAPABILITY_WORK);
      if (canWork !== workCapability) {
        workCapability = canWork;
        await bb.storage.kv.set(WORK_CAP, canWork);
      }
      return {
        ...base,
        connected: true,
        email: who.email ?? c.email,
        canView: !!who.can_view_outreach,
        canManage: !!who.can_manage_outreach,
        canWork,
      };
    } catch (error) {
      if (error instanceof ManifestError) return { ...base, problem: error.code === "unauthorized" ? "unauthorized" : "unavailable", message: error.message };
      throw error;
    }
  }

  bb.rpc.register(rpcContract, {
    status: () => status(),
    login: async ({ url, email, password }) => {
      const base = normalizeBaseUrl(url);
      const old = await connection();
      const res = await login(base, email.trim(), password, `BB · ${hostname()}`);
      if (old.token && old.url) await logout(old.url, old.token);
      await settings.experimental_set({ manifestUrl: base, email: res.email, token: res.token });
      await bb.storage.kv.set(TOKEN_URL, base);
      bb.realtime.publish(STATUS_CHANGED, {});
      bb.log.info(`signed in to ${base} as ${res.email}`);
      return status();
    },
    logout: async () => {
      const c = await connection();
      workCapability = false;
      await bb.storage.kv.delete(WORK_CAP);
      await logout(c.url, c.token);
      await settings.experimental_set({ token: null });
      await bb.storage.kv.delete(TOKEN_URL);
      bb.realtime.publish(STATUS_CHANGED, {});
      return status();
    },
    tool: async ({ name, args }) => {
      if (!PANEL_TOOLS.has(name)) throw new Error(`Инструмент ${name} недоступен панелям`);
      const { structured } = await call(name, args, "panel");
      changed(name, args, structured);
      return { result: structured };
    },
    chat_get: async ({ companyId }) => {
      const threadId = await bb.storage.kv.get<string>(threadKey(companyId));
      if (!threadId) return { threadId: null };
      try {
        await bb.sdk.threads.get({ threadId });
        return { threadId };
      } catch {
        await bb.storage.kv.delete(threadKey(companyId));
        return { threadId: null };
      }
    },
    chat_link: async ({ companyId, threadId }) => {
      await bb.storage.kv.set(threadKey(companyId), threadId);
      return { ok: true };
    },

    section_ensure: async () => {
      const known = await bb.storage.kv.get<string>(SECTION);
      try {
        const sections = await bb.sdk.threadSections.list();
        const found = sections.find((x) => x.id === known) ?? sections.find((x) => x.name === SECTION_NAME);
        if (found) {
          if (found.id !== known) await bb.storage.kv.set(SECTION, found.id);
          return { sectionId: found.id };
        }
        const created = await bb.sdk.threadSections.create({ name: SECTION_NAME });
        await bb.storage.kv.set(SECTION, created.id);
        return { sectionId: created.id };
      } catch (error) {
        bb.log.warn(`thread section unavailable: ${error instanceof Error ? error.message : String(error)}`);
        return { sectionId: null };
      }
    },
    topics_list: async () => {
      const all = await topics();
      const alive: Topic[] = [];
      for (const t of all) {
        try {
          const thread = (await bb.sdk.threads.get({ threadId: t.threadId })) as { title?: string | null; archived?: boolean; archivedAt?: unknown };
          if (thread.archived || thread.archivedAt) continue;
          alive.push({ ...t, title: thread.title || t.title });
        } catch {
          // deleted thread: dropped from the index
        }
      }
      if (alive.length !== all.length) await bb.storage.kv.set(TOPICS, alive);
      return { topics: alive };
    },
    topic_add: async ({ threadId, title }) => {
      const meta = (await bb.sdk.threads.getPluginMetadata({ threadId })) as { kind?: unknown };
      if (meta?.kind !== "dashboard") throw new Error("Это не тема дашборда");
      const all = (await topics()).filter((t) => t.threadId !== threadId);
      all.push({ threadId, title, createdAt: new Date().toISOString() });
      await bb.storage.kv.set(TOPICS, all);
      bb.realtime.publish(TOPICS_CHANGED, {});
      return { ok: true };
    },
    topic_filter_get: async ({ threadId }) => ({ filter: await topicFilter(threadId) }),
    topic_filter_set: async ({ threadId, filter }) => ({ filter: await setTopicFilter(threadId, filter) }),
    seen_get: async () => ({ at: (await bb.storage.kv.get<string>(SEEN)) ?? null }),
    seen_set: async ({ at }) => {
      await bb.storage.kv.set(SEEN, at);
      return { ok: true };
    },
  });

  async function topicFilter(threadId: string): Promise<Filter> {
    const meta = (await bb.sdk.threads.getPluginMetadata({ threadId })) as { kind?: unknown; filter?: unknown };
    if (meta?.kind !== "dashboard") throw new Error("Это не тема дашборда");
    const parsed = filterSchema.safeParse(meta.filter ?? {});
    return parsed.success ? parsed.data : {};
  }

  async function setTopicFilter(threadId: string, filter: Filter): Promise<Filter> {
    await topicFilter(threadId); // the thread must be a topic
    const clean = filterSchema.parse(JSON.parse(JSON.stringify(filter)));
    await bb.sdk.threads.updatePluginMetadata({ threadId, set: { filter: clean } });
    bb.realtime.publish(TOPIC_FILTER, { threadId, filter: clean });
    return clean;
  }

  // ---- agent: Manifest tools in the chats of organisations ----

  /**
   * A company chat is trusted only if the plugin itself linked this thread to
   * the company (chat_link): thread metadata can be written by the thread's
   * own agent, so metadata alone must not grant write tools for a company.
   */
  async function verifiedScope(threadId: string) {
    const kind = scopeOf((await bb.sdk.threads.getPluginMetadata({ threadId })) as Record<string, unknown>);
    if (kind?.scope === "company" && kind.companyId) {
      const linked = await bb.storage.kv.get<string>(threadKey(kind.companyId));
      if (linked !== threadId) return null;
    }
    return kind;
  }

  /** Kind of a thread from its plugin metadata (untrusted: only routes tools). */
  function scopeOf(meta: Record<string, unknown> | null | undefined): { scope: ToolScope; companyId: string | null } | null {
    if (typeof meta?.companyId === "string") return { scope: "company", companyId: meta.companyId };
    if (meta?.kind === "dashboard") return { scope: "dashboard", companyId: null };
    return null;
  }

  const fail = (text: string) => ({ content: [{ type: "text" as const, text: `Manifest: ${text}` }], isError: true });

  for (const name of AGENT_TOOL_NAMES) {
    const def = AGENT_TOOLS[name];
    bb.agents.registerTool({
      name,
      description: def.description,
      parameters: def.parameters,
      presentation: { label: { pending: `Manifest: ${name}`, completed: `Manifest: ${name}` }, icon: { glyph: "Database" } },
      async execute(params, ctx) {
        const args = params as Record<string, unknown>;
        try {
          const kind = await verifiedScope(ctx.threadId);
          if (!kind || !(def.scopes as readonly ToolScope[]).includes(kind.scope)) {
            return fail("этот инструмент недоступен в этом чате.");
          }
          // Writes are bound to the organisation of the thread: text inside a
          // card (source text, comments) can't steer the agent into editing
          // other organisations. In dashboard topics there are no direct
          // writes at all — only batch previews a person applies.
          if (def.write && (kind.scope !== "company" || companyOf(args) !== kind.companyId)) {
            return fail("в этом чате можно менять только организацию, к которой он привязан.");
          }
          const { structured, text } = await call(name, args, "agent", ctx.signal);
          changed(name, args, structured);
          return agentText(structured, text);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return fail(message);
        }
      },
    });
  }

  // Dashboard topics: the agent sets the filter the dashboard shows.
  bb.agents.registerTool({
    name: "manifest_dashboard_show",
    description:
      "Показать на дашборде темы организации по фильтру: дашборд и очередь перерисуются, фильтр сохранится в теме. Возвращает число организаций.",
    parameters: z.object({ filter: filterSchema }),
    presentation: { label: { pending: "Дашборд: фильтр", completed: "Дашборд: фильтр" }, icon: { glyph: "LayoutDashboard" } },
    async execute(params, ctx) {
      try {
        const kind = scopeOf((await bb.sdk.threads.getPluginMetadata({ threadId: ctx.threadId })) as Record<string, unknown>);
        if (kind?.scope !== "dashboard") return fail("фильтр дашборда меняется только в теме дашборда.");
        const filter = await setTopicFilter(ctx.threadId, (params as { filter: Filter }).filter ?? {});
        const { structured } = await call("outreach_list_companies", { ...filter, limit: 1 }, "agent", ctx.signal);
        const total = (structured as { total?: number } | null)?.total ?? 0;
        return { content: [{ type: "text" as const, text: `Фильтр темы применён: ${total} организаций. ${JSON.stringify(filter)}` }] };
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
  });

  bb.agents.configure((ctx) => {
    const kind = scopeOf(ctx.pluginMetadata as Record<string, unknown>);
    if (!kind) return { tools: [], skills: [] };
    const tools: string[] = toolsFor(kind.scope, workCapability);
    if (kind.scope === "company") {
      return {
        tools,
        skills: ["manifest-outreach"],
        instructions: [
          `Этот чат привязан к карточке потенциального поставщика в Manifest: id ${quote(kind.companyId, 64)}, ` +
            `название ${quote(ctx.pluginMetadata.companyName)}.`,
          "Данные организации читай инструментом outreach_get_company, меняй инструментами outreach_*. " +
            "Права проверяет Manifest: если действие отклонено, сообщи об этом пользователю, не пытайся обойти.",
          "Каждое твоё изменение попадает в историю правок карточки с пометкой «агент BB» и сразу видно пользователю справа.",
          "Перед изменением статуса на rejected или do_not_contact уточни причину у пользователя. Переписку с поставщиком ты не ведёшь.",
          workCapability
            ? "Когда пользователь говорит, что написал, позвонил или получил ответ, запиши касание outreach_log_touch; следующий шаг предложит шаблон каденса."
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }
    if (!workCapability) {
      return {
        tools: toolsFor("dashboard", false),
        skills: ["manifest-outreach"],
        instructions: "Дашборд аутрича недоступен: Manifest ещё не обновлён. Можно только искать организации.",
      };
    }
    return {
      tools: [...tools, "manifest_dashboard_show"],
      skills: ["manifest-outreach"],
      instructions: [
        `Это тема дашборда аутрича Manifest${ctx.thread.title ? ` ${quote(ctx.thread.title, 120)}` : ""}. Слева от чата пользователь видит дашборд по фильтру темы.`,
        "Числа бери только из инструментов (outreach_metrics, outreach_queue, outreach_list_companies) и называй фильтр и время as_of. Не считай и не выдумывай сам.",
        "Чтобы показать выборку на дашборде, вызови manifest_dashboard_show с фильтром. «Кому напомнить» — это outreach_queue.",
        "Список организаций в ответе выводи директивой отдельной строкой, а не таблицей: ::manifest-companies{attention=\"overdue\" country=\"IN\"} " +
          "(атрибуты как у фильтра: q, region, country, statuses, tags, owner, attention, stale_days, priorities, segment_id, ids — списки через запятую). Добавь title=\"…\".",
        "Прямых правок в теме нет. Любое изменение (статус, шаг, касание, метки, ответственный) — через outreach_batch_preview, " +
          "затем покажи пачку директивой ::manifest-batch{id=\"<id пачки>\"}: применяет человек кнопкой «Применить». Сам не применяй и не утверждай, что применил.",
        "Перед статусами rejected и do_not_contact уточни причину. Переписку с поставщиками ты не ведёшь.",
      ].join("\n"),
    };
  });

  // Refresh the capability cache in the background: agent configuration is
  // synchronous and must not wait for a panel to ask for the status.
  void status().catch(() => undefined);

  bb.onDispose(() => bb.log.info("disposed"));
}
