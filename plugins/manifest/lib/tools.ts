// Agent tools of the plugin = Manifest MCP tools, contract v1 (EP-071).
//
// The schemas describe the tools to the model; Manifest validates every call
// again and checks the user's rights, so these are a description, not a guard.
import { z } from "zod";

const id = z.string().describe("id из Manifest");
const opt = <T extends z.ZodTypeAny>(s: T, d: string) => s.optional().describe(d);

export const AGENT_TOOLS = {
  outreach_list_companies: {
    write: false,
    description: "Список потенциальных поставщиков Manifest с фильтрами (страна, регион, приоритет, статус, поиск).",
    parameters: z.object({
      q: opt(z.string(), "поиск по названию, городу, телефону, email, сайту, контактному лицу"),
      region: opt(z.string(), "africa, asia, australia-pacific, europe, middle-east, north-central-america, south-america"),
      country: opt(z.string(), "ISO-код страны, например DE"),
      priorities: opt(z.array(z.number().int().min(1).max(5)), "приоритеты 1..5"),
      status: opt(z.string(), "статус воронки"),
      has_phone: opt(z.boolean(), "есть телефон или WhatsApp"),
      has_email: opt(z.boolean(), "есть email"),
      sort: opt(z.string(), "priority, name, country, region, status, updated"),
      limit: opt(z.number().int().min(1).max(200), "размер страницы"),
      offset: opt(z.number().int().min(0), "смещение"),
    }),
  },
  outreach_get_company: {
    write: false,
    description: "Карточка организации: реквизиты, страны, каналы связи, контактные лица, комментарии, история правок.",
    parameters: z.object({ id }),
  },
  outreach_update_company: {
    write: true,
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
      priority_manual: opt(z.number().int().min(1).max(5), "ручной приоритет"),
      clear_priority_manual: opt(z.boolean(), "вернуть автоматический приоритет"),
      expected_updated_at: opt(z.string(), "updated_at из карточки — защита от затирания чужой правки"),
    }),
  },
  outreach_save_contact: {
    write: true,
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
    description: "Удалить канал связи.",
    parameters: z.object({ company_id: id, contact_id: id }),
  },
  outreach_save_person: {
    write: true,
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
    description: "Удалить контактное лицо.",
    parameters: z.object({ company_id: id, person_id: id }),
  },
  outreach_add_comment: {
    write: true,
    description: "Добавить комментарий к организации.",
    parameters: z.object({ company_id: id, body: z.string(), pinned: opt(z.boolean(), "закрепить") }),
  },
} as const;

export type AgentToolName = keyof typeof AGENT_TOOLS;
export const AGENT_TOOL_NAMES = Object.keys(AGENT_TOOLS) as AgentToolName[];

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
