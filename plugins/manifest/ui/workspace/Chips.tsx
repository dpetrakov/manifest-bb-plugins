// Ссылки-чипы на объекты в сообщениях агента (W-18, ADR-049 §2.5): письмо и рассылка не
// рисуются в ленте целиком, а открываются справа, и тред работает с ними. Старые
// сообщения с ::manifest-letter / ::manifest-mailing тоже становятся чипами.
import { useEffect, useState } from "react";
import { useRpc, type PluginMessageDirectiveProps } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import type { rpcContract } from "../../server";
import { errorText, useTool } from "../hooks";
import { useLetter } from "../mail/LetterView";
import type { Mailing } from "../mail/common";
import { KIND_LABEL, useOpenObjectPanel, type FocusRef } from "./state";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * The chip is written by the agent: opening an object makes it writable in this thread.
 * An object the thread already has opens at once; a new one only after the person
 * confirms, seeing its real name.
 */
function Chip({ icon, title, detail, tone, threadId, focus }: { icon: string; title: string; detail: string; tone: "ok" | "bad" | "muted"; threadId: string; focus: FocusRef }) {
  const rpc = useRpc<typeof rpcContract>();
  const openPanel = useOpenObjectPanel();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const go = async () => {
    try {
      await rpc.call("focus_set", { threadId, focus });
      openPanel(focus.title || KIND_LABEL[focus.kind]);
      setError(null);
      setConfirm(false);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const open = async () => {
    try {
      const cur = await rpc.call("focus_get", { threadId });
      const known = [...cur.trail, ...(cur.focus ? [cur.focus] : [])].some((r) => r.kind === focus.kind && r.id === focus.id);
      if (known) await go();
      else setConfirm(true);
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <span className="my-1 inline-flex max-w-full flex-col">
      <button
        type="button"
        onClick={() => void open()}
        className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-xs hover:bg-state-hover"
      >
        <span aria-hidden>{icon}</span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{title}</span>
          <span className={cn("block truncate", tone === "ok" ? "text-emerald-700" : tone === "bad" ? "text-destructive" : "text-muted-foreground")}>{detail}</span>
        </span>
        <span className="flex-none text-muted-foreground">открыть справа →</span>
      </button>
      {confirm ? (
        <span className="mt-1 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px]">
          <span>
            Открыть справа {KIND_LABEL[focus.kind].toLowerCase()} «{focus.title || title}»? В этом чате агент сможет её менять.
          </span>
          <button type="button" className="rounded bg-foreground px-2 py-1 text-background" onClick={() => void go()}>
            Открыть
          </button>
          <button type="button" className="rounded px-2 py-1 hover:bg-state-hover" onClick={() => setConfirm(false)}>
            Отмена
          </button>
        </span>
      ) : null}
      {error ? <span className="text-[11px] text-destructive">{error}</span> : null}
    </span>
  );
}

/** ::manifest-letter{company="…"} — письмо организации: чип, сам виджет справа (в карточке). */
export function LetterChip({ attributes, message }: PluginMessageDirectiveProps) {
  const companyId = (attributes.company ?? "").trim();
  const valid = UUID.test(companyId);
  const { letter, none, error } = useLetter(valid ? companyId : "");
  const tool = useTool();
  const [company, setCompany] = useState("");
  useEffect(() => {
    if (!valid) return;
    tool<{ company?: { display_name?: string } }>("outreach_get_company", { id: companyId }).then(
      (c) => setCompany(c.company?.display_name ?? ""),
      () => undefined,
    );
  }, [companyId, tool, valid]);
  if (!valid) return <span className="text-xs text-muted-foreground">Письмо: не указана организация.</span>;
  const detail = error
    ? error
    : none
      ? "черновика нет"
      : !letter
        ? "собираем…"
        : letter.preview.problems.length
          ? `не уйдёт: ${letter.preview.problems[0]}`
          : `готово · ${letter.preview.to}`;
  return (
    <Chip
      icon="✉"
      title={`Письмо${company ? ` для «${company}»` : ""}${letter ? `: ${letter.preview.subject}` : ""}`}
      detail={detail}
      tone={letter && !letter.preview.problems.length ? "ok" : letter ? "bad" : "muted"}
      threadId={message.threadId}
      focus={{ kind: "company", id: companyId, title: company.slice(0, 200) }}
    />
  );
}

/** ::manifest-mailing{id="…"} — рассылка: чип со сводкой, сама рассылка справа. */
export function MailingChip({ attributes, message }: PluginMessageDirectiveProps) {
  const id = (attributes.id ?? "").trim();
  const valid = UUID.test(id);
  const tool = useTool();
  const [m, setM] = useState<Mailing | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!valid) return;
    tool<Mailing>("mail_mailing_get", { id }).then(setM, (e: unknown) => setError(errorText(e)));
  }, [id, tool, valid]);
  if (!valid) return <span className="text-xs text-muted-foreground">Рассылка: не указан id.</span>;
  return (
    <Chip
      icon="✉"
      title={m ? `Рассылка «${m.name}»` : "Рассылка"}
      detail={error ?? (m ? `уйдёт ${m.ready} из ${m.total}${m.skipped ? ` · не уйдёт ${m.skipped}` : ""}` : "загружаем…")}
      tone={error ? "bad" : m && !m.skipped ? "ok" : "muted"}
      threadId={message.threadId}
      focus={{ kind: "mailing", id, title: m?.name ?? "" }}
    />
  );
}
