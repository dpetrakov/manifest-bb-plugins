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
import { AGENT_TOOLS, AGENT_TOOL_NAMES, PANEL_TOOLS, agentText, companyOf, quote } from "./lib/tools";

/** Realtime channel: a company changed (panel or agent); payload { companyId }. */
export const COMPANY_CHANGED = "manifest-company-changed";
/** Realtime channel: connection status changed (sign-in / sign-out). */
export const STATUS_CHANGED = "manifest-status-changed";

const statusSchema = z.object({
  connected: z.boolean(),
  url: z.string(),
  email: z.string(),
  canView: z.boolean(),
  canManage: z.boolean(),
  /** unauthorized | unavailable | contract | null */
  problem: z.string().nullable(),
  message: z.string(),
});
export type Status = z.infer<typeof statusSchema>;

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

  async function call(name: string, args: Record<string, unknown>, actor: ActorKind, signal?: AbortSignal) {
    const c = await connection();
    return callTool(c.url, c.token, name, args, actor, fetch, signal);
  }

  async function status(): Promise<Status> {
    const c = await connection();
    const base: Status = { connected: false, url: c.url, email: c.email, canView: false, canManage: false, problem: null, message: "" };
    if (!c.url || !c.token) return { ...base, problem: "unauthorized", message: "Плагин не подключён: войдите в настройках плагина." };
    try {
      const { structured } = await call("manifest_whoami", {}, "panel");
      const who = structured as { email?: string; contract?: number; can_view_outreach?: boolean; can_manage_outreach?: boolean };
      if (who.contract !== CONTRACT_VERSION) {
        return { ...base, problem: "contract", message: `Версия Manifest не совпадает с плагином (контракт ${who.contract ?? "?"}, нужен ${CONTRACT_VERSION}). Обновите плагин.` };
      }
      return { ...base, connected: true, email: who.email ?? c.email, canView: !!who.can_view_outreach, canManage: !!who.can_manage_outreach };
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
      await logout(c.url, c.token);
      await settings.experimental_set({ token: null });
      await bb.storage.kv.delete(TOKEN_URL);
      bb.realtime.publish(STATUS_CHANGED, {});
      return status();
    },
    tool: async ({ name, args }) => {
      if (!PANEL_TOOLS.has(name)) throw new Error(`Инструмент ${name} недоступен панелям`);
      const { structured } = await call(name, args, "panel");
      const companyId = companyOf(args);
      if (companyId && !name.includes("_get_") && !name.includes("_list_") && name !== "outreach_facets") {
        bb.realtime.publish(COMPANY_CHANGED, { companyId });
      }
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
  });

  // ---- agent: Manifest tools in the chats of organisations ----

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
          // Writes are bound to the organisation of the thread: text inside a
          // card (source text, comments) can't steer the agent into editing
          // other organisations. Reads (list, other cards) stay open.
          if (def.write) {
            const meta = (await bb.sdk.threads.getPluginMetadata({ threadId: ctx.threadId })) as { companyId?: unknown };
            const own = typeof meta?.companyId === "string" ? meta.companyId : null;
            if (!own || companyOf(args) !== own) {
              return {
                content: [{ type: "text", text: "Manifest: в этом чате можно менять только организацию, к которой он привязан." }],
                isError: true,
              };
            }
          }
          const { structured, text } = await call(name, args, "agent", ctx.signal);
          if (def.write) {
            const companyId = companyOf(args);
            if (companyId) bb.realtime.publish(COMPANY_CHANGED, { companyId });
          }
          return agentText(structured, text);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text", text: `Manifest: ${message}` }], isError: true };
        }
      },
    });
  }

  bb.agents.configure((ctx) => {
    const companyId = ctx.pluginMetadata.companyId;
    if (typeof companyId !== "string") return { tools: [], skills: [] };
    return {
      tools: [...AGENT_TOOL_NAMES],
      skills: ["manifest-outreach"],
      instructions: [
        `Этот чат привязан к карточке потенциального поставщика в Manifest: id ${quote(companyId, 64)}, ` +
          `название ${quote(ctx.pluginMetadata.companyName)}.`,
        "Данные организации читай инструментом outreach_get_company, меняй инструментами outreach_*. " +
          "Права проверяет Manifest: если действие отклонено, сообщи об этом пользователю, не пытайся обойти.",
        "Каждое твоё изменение попадает в историю правок карточки с пометкой «агент BB» и сразу видно пользователю справа.",
        "Перед изменением статуса на rejected или do_not_contact уточни причину у пользователя. Переписку с поставщиком ты не ведёшь.",
      ].join("\n"),
    };
  });

  bb.onDispose(() => bb.log.info("disposed"));
}
