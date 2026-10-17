// Agent tools of the plugin = Manifest MCP tools, contract v1 (EP-071).
//
// The schemas describe the tools to the model; Manifest validates every call
// again and checks the user's rights, so these are a description, not a guard.
import { z } from "zod";

const id = z.string().describe("id из Manifest");
const opt = <T extends z.ZodTypeAny>(s: T, d: string) => s.optional().describe(d);

/** Registry filter, the same JSON as Manifest's FilterArgs. */
export const filterSchema = z.object({
  q: opt(z.string(), "поиск"),
  region: opt(z.string(), "регион"),
  country: opt(z.string(), "ISO-код страны"),
  priorities: opt(z.array(z.number().int().min(1).max(5)), "приоритеты"),
  statuses: opt(z.array(z.string()), "любой из статусов"),
  tags: opt(z.array(z.string()), "любая из меток"),
  owner: opt(z.string(), "email, me или none"),
  attention: opt(z.string(), "waiting_reply, overdue, due_today, ready_untouched, no_next_action"),
  stale_days: opt(z.number().int().min(1), "без касаний не меньше N дней"),
  never_touched: opt(z.boolean(), "без касаний"),
  has_phone: opt(z.boolean(), "есть телефон"),
  has_email: opt(z.boolean(), "есть email"),
  has_person: opt(z.boolean(), "есть контактное лицо"),
  brand: opt(z.string(), "only или exclude"),
  brand_only: opt(z.boolean(), "true — только email бренда, false — без них (как в ответах Manifest)"),
  segment_id: opt(z.string(), "сохранённый сегмент"),
  ids: opt(z.array(z.string()), "конкретные организации"),
});
export type Filter = z.infer<typeof filterSchema>;

const nextActionSchema = z.object({
  action: opt(z.string(), "follow_up, call, send_offer, wait_reply, recycle, other"),
  note: opt(z.string(), "что сделать"),
  due_on: z.string().describe("срок ГГГГ-ММ-ДД"),
  owner: opt(z.string(), "email или me"),
});

const touchSchema = z.object({
  channel: z.string().describe("email, whatsapp, telegram, phone, meeting, linkedin, other"),
  direction: z.string().describe("out — мы им, in — они нам"),
  kind: opt(z.string(), "message, call, meeting, auto_reply, bounce, note"),
  outcome: opt(z.string(), "sent, no_answer, replied, interested, terms_received, declined, territory, referral, wrong_contact, out_of_office, bounced"),
  occurred_at: opt(z.string(), "когда (RFC 3339), по умолчанию сейчас"),
  summary: opt(z.string(), "кратко о чём"),
  person_id: opt(z.string(), "контактное лицо"),
  contact_id: opt(z.string(), "канал связи"),
});

export type ToolScope = "company" | "dashboard";

export const AGENT_TOOLS = {
  outreach_list_companies: {
    write: false,
    scopes: ["company", "dashboard"],
    description:
      "Список потенциальных поставщиков Manifest с фильтрами (страна, регион, приоритет, статусы, метки, ответственный, внимание, давность касания, поиск).",
    parameters: filterSchema.extend({
      status: opt(z.string(), "один статус воронки"),
      sort: opt(z.string(), "priority, name, country, region, status, updated, last_touch, last_inbound, next_action"),
      desc: opt(z.boolean(), "по убыванию"),
      limit: opt(z.number().int().min(1).max(200), "размер страницы"),
      offset: opt(z.number().int().min(0), "смещение"),
    }),
  },
  outreach_get_company: {
    write: false,
    scopes: ["company", "dashboard"],
    description: "Карточка организации: реквизиты, страны, каналы связи, контактные лица, комментарии, история правок.",
    parameters: z.object({ id }),
  },
  outreach_update_company: {
    write: true,
    scopes: ["company"],
    description:
      "Изменить поля организации, статус (для rejected/do_not_contact нужна status_reason), метки, «не связываться» или ручной приоритет.",
    parameters: z.object({
      id,
      display_name: opt(z.string(), "название"),
      legal_name: opt(z.string(), "юридическое название"),
      kind: opt(z.string(), "brand_subsidiary, importer, dealer, service_center, unknown"),
      country_code: opt(z.string(), "ISO-код страны"),
      address_raw: opt(z.string(), "адрес целиком"),
      city: opt(z.string(), "город"),
      status: opt(z.string(), "new, to_qualify, ready, contacted, replied, qualified, handed_over, rejected, do_not_contact"),
      status_reason: opt(z.string(), "причина статуса"),
      tags: opt(z.array(z.string()), "метки"),
      do_not_contact: opt(z.boolean(), "не связываться"),
      do_not_contact_reason: opt(z.string(), "причина"),
      status_reason_code: opt(z.string(), "причина отказа: not_profile, territory, no_assortment, no_response, asked_not_to_contact, other"),
      owner: opt(z.string(), "ответственный: email, me или пусто — снять"),
      priority_manual: opt(z.number().int().min(1).max(5), "ручной приоритет"),
      clear_priority_manual: opt(z.boolean(), "вернуть автоматический приоритет"),
      expected_updated_at: opt(z.string(), "updated_at из карточки — защита от затирания чужой правки"),
    }),
  },
  outreach_save_contact: {
    write: true,
    scopes: ["company"],
    description: "Добавить канал связи (без contact_id) или изменить существующий.",
    parameters: z.object({
      company_id: id,
      contact_id: opt(z.string(), "id канала для правки"),
      type: z.string().describe("phone, mobile, whatsapp, telegram, fax, email, website, other"),
      value_raw: z.string().describe("значение"),
      label: opt(z.string(), "подпись"),
      person_id: opt(z.string(), "id контактного лица"),
      is_primary: opt(z.boolean(), "основной канал"),
      verification: opt(z.string(), "unknown, valid, invalid, bounced"),
    }),
  },
  outreach_delete_contact: {
    write: true,
    scopes: ["company"],
    description: "Удалить канал связи.",
    parameters: z.object({ company_id: id, contact_id: id }),
  },
  outreach_save_person: {
    write: true,
    scopes: ["company"],
    description: "Добавить контактное лицо (без person_id) или изменить существующее.",
    parameters: z.object({
      company_id: id,
      person_id: opt(z.string(), "id лица для правки"),
      full_name: z.string(),
      salutation: opt(z.string(), "обращение"),
      position: opt(z.string(), "должность"),
      languages: opt(z.array(z.string()), "языки"),
      is_decision_maker: opt(z.boolean(), "принимает решения"),
      note: opt(z.string(), "заметка"),
    }),
  },
  outreach_delete_person: {
    write: true,
    scopes: ["company"],
    description: "Удалить контактное лицо.",
    parameters: z.object({ company_id: id, person_id: id }),
  },
  outreach_add_comment: {
    write: true,
    scopes: ["company"],
    description: "Добавить комментарий к организации.",
    parameters: z.object({ company_id: id, body: z.string(), pinned: opt(z.boolean(), "закрепить") }),
  },
  // ---- W-15: work layer (Manifest capability "outreach.work") ----
  outreach_queue: {
    write: false,
    scopes: ["company", "dashboard"],
    description:
      "Очередь «Сегодня»: «ждут нашего ответа», «просрочено», «на сегодня», «готовы, не тронуты», у каждой строки причина. Ответ на «кому пора напомнить». Числа бери отсюда.",
    parameters: z.object({ filter: opt(filterSchema, "сузить очередь"), per_group: opt(z.number().int().min(1).max(200), "строк в группе") }),
  },
  outreach_metrics: {
    write: false,
    scopes: ["company", "dashboard"],
    description:
      "Метрики по организациям фильтра на момент as_of: проверки процесса, воронка и отток по причинам, регионы, матрица застоя, качество данных, касания. Проценты — только при знаменателе от 20.",
    parameters: z.object({ filter: opt(filterSchema, "посчитать по фильтру") }),
  },
  outreach_feed: {
    write: false,
    scopes: ["company", "dashboard"],
    description: "Что изменилось с момента since (RFC 3339, по умолчанию 7 дней): правки, касания, шаги.",
    parameters: z.object({ since: opt(z.string(), "RFC 3339"), filter: opt(filterSchema, "фильтр"), limit: opt(z.number().int().min(1).max(200), "до 200") }),
  },
  outreach_segments: {
    write: false,
    scopes: ["company", "dashboard"],
    description: "Сохранённые сегменты команды с текущим числом организаций.",
    parameters: z.object({}),
  },
  outreach_batch_get: {
    write: false,
    scopes: ["dashboard"],
    description: "Пачка массовой правки: состояние (preview/applied/reverted/expired), предпросмотр, результат.",
    parameters: z.object({ id }),
  },
  outreach_log_touch: {
    write: true,
    scopes: ["company"],
    description:
      "Записать касание организации: письмо, сообщение, звонок, встречу, автоответ, недоставку. Шаблон каденса сам предложит следующий шаг.",
    parameters: touchSchema.extend({ company_id: id }),
  },
  outreach_set_next_action: {
    write: true,
    scopes: ["company"],
    description: "Задать следующий шаг организации (заменяет открытый).",
    parameters: nextActionSchema.extend({ company_id: id }),
  },
  outreach_complete_next_action: {
    write: true,
    scopes: ["company"],
    description: "Закрыть открытый следующий шаг с пометкой, чем он закончился.",
    parameters: z.object({ company_id: id, note: opt(z.string(), "итог") }),
  },
  outreach_batch_preview: {
    write: false,
    scopes: ["dashboard"],
    description:
      "Подготовить пачку правок по id или фильтру (до 200 организаций). Ничего не меняет: возвращает предпросмотр и id пачки. Покажи её директивой ::manifest-batch{id=\"…\"} — применяет человек кнопкой.",
    parameters: z.object({
      company_ids: opt(z.array(z.string()), "организации по id"),
      filter: opt(filterSchema, "или по фильтру"),
      op: z.object({
        kind: z.string().describe("set_status, set_owner, add_tags, remove_tags, set_next_action, complete_next_action, log_touch"),
        status: opt(z.string(), "для set_status"),
        reason_code: opt(z.string(), "для rejected/do_not_contact: not_profile, territory, no_assortment, no_response, asked_not_to_contact, other"),
        reason: opt(z.string(), "текст причины"),
        owner: opt(z.string(), "для set_owner: email, me или пусто"),
        tags: opt(z.array(z.string()), "для add_tags/remove_tags"),
        next_action: opt(nextActionSchema, "для set_next_action"),
        touch: opt(touchSchema, "для log_touch"),
        note: opt(z.string(), "для complete_next_action"),
      }),
    }),
  },
  outreach_save_segment: {
    write: false,
    scopes: ["dashboard"],
    description: "Сохранить фильтр как новый общий сегмент команды (по просьбе пользователя). Чужие сегменты агент не меняет.",
    parameters: z.object({ name: z.string(), filter: filterSchema }),
  },
} as const satisfies Record<string, { write: boolean; scopes: readonly ToolScope[]; description: string; parameters: z.ZodTypeAny }>;

export type AgentToolName = keyof typeof AGENT_TOOLS;
export const AGENT_TOOL_NAMES = Object.keys(AGENT_TOOLS) as AgentToolName[];

/** Tools that need Manifest's work layer (capability "outreach.work"). */
export const WORK_TOOLS = new Set<string>([
  "outreach_queue", "outreach_metrics", "outreach_feed", "outreach_segments", "outreach_batch_get",
  "outreach_log_touch", "outreach_set_next_action", "outreach_complete_next_action",
  "outreach_batch_preview", "outreach_save_segment",
]);

/** Agent tools of a thread kind; work tools only when Manifest has them. */
export function toolsFor(scope: ToolScope, work: boolean): AgentToolName[] {
  return AGENT_TOOL_NAMES.filter(
    (n) => (AGENT_TOOLS[n].scopes as readonly ToolScope[]).includes(scope) && (work || !WORK_TOOLS.has(n)),
  );
}

/** Tools that only read: no «changed» signal after them. */
export const READ_TOOLS = new Set([
  "manifest_whoami", "outreach_facets", "outreach_list_companies", "outreach_get_company", "outreach_queue",
  "outreach_metrics", "outreach_feed", "outreach_segments", "outreach_cadence", "outreach_batch_get",
  "outreach_batches", "outreach_batch_preview",
]);

/** Tools the panels may call through the plugin backend (contract v1). */
export const PANEL_TOOLS = new Set([
  "manifest_whoami",
  "outreach_facets",
  "outreach_list_companies",
  "outreach_get_company",
  "outreach_update_company",
  "outreach_save_contact",
  "outreach_delete_contact",
  "outreach_save_person",
  "outreach_delete_person",
  "outreach_add_comment",
  "outreach_update_comment",
  "outreach_delete_comment",
  // W-15
  "outreach_queue",
  "outreach_metrics",
  "outreach_feed",
  "outreach_segments",
  "outreach_cadence",
  "outreach_batch_get",
  "outreach_batches",
  "outreach_log_touch",
  "outreach_update_touch",
  "outreach_delete_touch",
  "outreach_set_next_action",
  "outreach_complete_next_action",
  "outreach_save_segment",
  "outreach_delete_segment",
  "outreach_batch_preview",
  "outreach_batch_apply",
  "outreach_batch_revert",
]);

/** Company id touched by a tool call, for the «card changed» signal. */
export function companyOf(args: Record<string, unknown>): string | null {
  const v = args.company_id ?? args.id;
  return typeof v === "string" ? v : null;
}

/** Bounded tool output for the agent (BB caps tool output; keep it readable). */
export function agentText(structured: unknown, text: string, max = 60_000): string {
  const out = structured === null || structured === undefined ? text : JSON.stringify(structured);
  return out.length > max ? `${out.slice(0, max)}\n…(обрезано)` : out;
}

/** Escapes a value put into agent instructions (thread metadata is untrusted). */
export function quote(value: unknown, max = 200): string {
  const s = typeof value === "string" ? value : "";
  return JSON.stringify(s.replace(/[\r\n]+/g, " ").slice(0, max));
}
