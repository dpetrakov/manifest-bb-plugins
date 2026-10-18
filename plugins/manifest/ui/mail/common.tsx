// Общие части почтовых экранов плагина (W-16, docs/outreach/mail.md).
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { errorText, useTool } from "../hooks";
import { countryName } from "../labels";
import type { ListResult } from "../types";

export const MAIL_PATH = "mail";
export const MAIL_ID = "mail";

export const AUDIENCE_LABEL: Record<string, string> = {
  potential_supplier: "Потенциальные поставщики",
  supplier: "Поставщики",
  potential_client: "Потенциальные клиенты",
  client: "Клиенты",
};
export const KIND_LABEL: Record<string, string> = {
  first: "Первое письмо",
  follow_up: "Повторное",
  reply: "Ответ",
  other: "Другое",
};
export const INBOUND_KIND_LABEL: Record<string, string> = {
  reply: "Ответ",
  auto_reply: "Автоответ",
  bounce: "Недоставка",
  unsubscribe: "Отписка",
  other: "Прочее",
};

export interface Sender {
  id: string;
  legal_entity_id: string;
  address: string;
  display_name: string;
  registered_at: string | null;
  register_error: string;
}

export interface Quota {
  daily_limit: number;
  sent_today: number;
  remaining_today: number;
  queue_depth: number;
  estimated_drain_at: string | null;
  paused: boolean;
  pause_reason: string;
  warmup_stage: number;
}

export interface LegalEntity {
  id: string;
  code: string;
  name: string;
  full_name: string;
  details: string;
  address: string;
  website: string;
  phone: string;
  subdomain: string;
  sandbox: boolean;
  language: string;
  signature: string;
  footer: string;
  token_set: boolean;
  health_ok: boolean | null;
  health_checked_at: string | null;
  health_error: string;
  quota: Quota | null;
  ready: boolean;
  ready_problems: string[];
  senders: Sender[];
}

export interface Template {
  id: string;
  name: string;
  audience: string;
  language: string;
  kind: string;
  current_version: number;
  subject: string;
  body: string;
  placeholders: string[];
  updated_at: string;
  updated_by: string;
  versions?: { version: number; subject: string; body: string; created_at: string; created_by: string }[];
}

export interface Preview {
  subject: string;
  text: string;
  html: string;
  missing: string[];
  unknown: string[];
  to: string;
  from: string;
  from_name: string;
  problems: string[];
  sample: boolean;
}

export interface Inbound {
  id: string;
  received_at: string;
  kind: string;
  from_address: string;
  from_name: string;
  subject: string;
  reply_text: string;
  body_text: string;
  attachments: { filename: string; size: number }[];
  company_id: string | null;
  company_name: string;
  triage: string;
}

/** Letter draft of an organisation and how it will go out (W-17). */
export interface Letter {
  draft: {
    id: string;
    company_id: string;
    template_id: string | null;
    template_version: number | null;
    template_name: string;
    person_id: string | null;
    contact_id: string | null;
    subject: string;
    body: string;
    edited: boolean;
    updated_at: string;
    updated_by: string;
  };
  preview: Preview;
}

export interface MailingRecipient {
  company_id: string;
  company_name: string;
  country_code: string;
  person_id: string | null;
  contact_id: string | null;
  to: string;
  from: string;
  ready: boolean;
  problems: string[];
}

/** One letter for many recipients (W-17). */
export interface Mailing {
  id: string;
  name: string;
  template_id: string | null;
  template_version: number | null;
  template_name: string;
  audience: string;
  subject: string;
  body: string;
  edited: boolean;
  state: string;
  total: number;
  ready: number;
  skipped: number;
  reasons: Record<string, number>;
  recipients: MailingRecipient[];
  updated_at: string;
  updated_by: string;
}

export interface MailingLetter {
  recipient: MailingRecipient;
  index: number;
  total: number;
  preview: Preview;
}

export interface CompanySender {
  legal_entity: LegalEntity | null;
  sender: Sender | null;
  source: string;
  problem: string;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export const selectCls = "h-8 rounded-md border border-input bg-transparent px-2 text-xs";
export const areaCls = "min-h-24 rounded-md border border-input bg-transparent px-2 py-1.5 text-xs font-mono";

/** HTML письма — только в изолированном iframe (никаких скриптов и ссылок наружу из окна bb). */
export function HtmlFrame({ html, className, style }: { html: string; className?: string; style?: React.CSSProperties }) {
  return (
    <iframe title="Предпросмотр письма" sandbox="" srcDoc={html} style={style} className={cn("w-full rounded-md border border-border bg-white", className)} />
  );
}

/** Выбор организации поиском по реестру. */
export function CompanyPicker({ value, onChange, placeholder }: { value: { id: string; name: string } | null; onChange: (v: { id: string; name: string } | null) => void; placeholder?: string }) {
  const tool = useTool();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ListResult["items"]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const t = setTimeout(() => {
      tool<ListResult>("outreach_list_companies", { q: q.trim(), limit: 8 }).then(
        (r) => setItems(r.items),
        (e: unknown) => setError(errorText(e)),
      );
    }, 250);
    return () => clearTimeout(t);
  }, [q, tool]);
  if (value) {
    return (
      <span className="flex items-center gap-2 text-xs">
        <span className="font-medium">{value.name}</span>
        <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => onChange(null)}>
          сменить
        </button>
      </span>
    );
  }
  return (
    <div className="relative">
      <Input className="h-8 text-xs" placeholder={placeholder ?? "Найти организацию…"} value={q} onChange={(e) => setQ(e.target.value)} />
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      {items.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover text-xs shadow">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                className="flex w-full justify-between gap-2 px-2 py-1 text-left hover:bg-state-hover"
                onClick={() => {
                  onChange({ id: it.id, name: it.display_name });
                  setQ("");
                  setItems([]);
                }}
              >
                <span className="truncate">{it.display_name}</span>
                <span className="text-muted-foreground">{countryName(it.country_code)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
