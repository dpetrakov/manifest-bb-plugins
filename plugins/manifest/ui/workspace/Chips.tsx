// Ссылки-чипы на объекты в сообщениях агента (W-18, ADR-049 §2.5): письмо и рассылка не
// рисуются в ленте целиком, а открываются справа, и тред работает с ними. Старые
// сообщения с ::manifest-letter / ::manifest-mailing тоже становятся чипами.
// W-20 (sending.md §2–§3): чип показывает живой статус и одно главное действие
// состояния — отправить, отменить, остановить — всегда через подтверждение.
import { useEffect, useState, type ReactNode } from "react";
import { useRpc, type PluginMessageDirectiveProps } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../../server";
import { errorText, useTool } from "../hooks";
import { useLetter } from "../mail/LetterView";
import { useMailing } from "../mail/MailingView";
import { CancelLetterButton, LetterStatus, MailingProgressBar, MailingSendBar, SendLetterButton, mailingLine, useSentLetter } from "../mail/send";
import { KIND_LABEL, useOpenObjectPanel, type FocusRef } from "./state";
import { Badge, ChipShell, ConfirmCard, ManifestMark, Status, type Tone } from "../manifest";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * The chip is written by the agent: opening an object makes it writable in this thread.
 * An object the thread already has opens at once; a new one only after the person
 * confirms, seeing its real name.
 */
function Chip({
  title,
  detail,
  tone,
  threadId,
  focus,
  sandbox,
  badge,
  extra,
  actions,
}: {
  title: string;
  detail: ReactNode;
  tone: Tone;
  threadId: string;
  focus: FocusRef;
  sandbox?: boolean;
  badge?: ReactNode;
  extra?: ReactNode;
  actions?: ReactNode;
}) {
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
    <ChipShell sandbox={sandbox} className="w-[min(100%,34rem)]">
      <button type="button" onClick={() => void open()} className="flex w-full min-w-0 items-center gap-2 rounded text-left hover:bg-state-hover">
        <ManifestMark />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{title}</span>
            {badge}
          </span>
          <Status tone={tone} className="max-w-full truncate text-xs text-[var(--mf-ink-700)]">
            {detail}
          </Status>
        </span>
        <span className="flex-none self-end text-muted-foreground">открыть справа →</span>
      </button>
      {extra}
      {actions}
      {confirm ? (
        <ConfirmCard
          title={`Открыть справа ${KIND_LABEL[focus.kind].toLowerCase()} «${focus.title || title}»?`}
          actions={
            <>
              <button type="button" className="h-7 rounded-md bg-foreground px-2.5 font-semibold text-background" onClick={() => void go()}>
                Открыть
              </button>
              <button type="button" className="h-7 rounded-md px-2.5 hover:bg-state-hover" onClick={() => setConfirm(false)}>
                Отмена
              </button>
            </>
          }
        >
          <span>В этом чате агент сможет её менять.</span>
        </ConfirmCard>
      ) : null}
      {error ? <span className="text-[11px] text-destructive">{error}</span> : null}
    </ChipShell>
  );
}

/** The organisation name for a chip title. */
function useCompanyName(companyId: string) {
  const tool = useTool();
  const [name, setName] = useState("");
  useEffect(() => {
    if (!UUID.test(companyId)) return;
    tool<{ company?: { display_name?: string } }>("outreach_get_company", { id: companyId }).then(
      (c) => setName(c.company?.display_name ?? ""),
      () => undefined,
    );
  }, [companyId, tool]);
  return name;
}

/**
 * ::manifest-letter{company="…"} — the draft of an organisation (send it);
 * ::manifest-letter{id="…"} — a sent letter (its status, cancel while queued).
 * The widget itself is on the right, in the organisation's card.
 */
export function LetterChip(props: PluginMessageDirectiveProps) {
  const id = (props.attributes.id ?? "").trim();
  return UUID.test(id) ? <SentLetterChip id={id} threadId={props.message.threadId} /> : <DraftLetterChip {...props} />;
}

function DraftLetterChip({ attributes, message }: PluginMessageDirectiveProps) {
  const companyId = (attributes.company ?? "").trim();
  const valid = UUID.test(companyId);
  const { letter, none, error, reload } = useLetter(valid ? companyId : "");
  const company = useCompanyName(valid ? companyId : "");
  const [sentId, setSentId] = useState<string | null>(null);
  if (!valid) return <span className="text-xs text-muted-foreground">Письмо: не указана организация.</span>;
  if (sentId) return <SentLetterChip id={sentId} threadId={message.threadId} />;
  const detail = error
    ? error
    : none
      ? "черновика нет"
      : !letter
        ? "собираем…"
        : letter.preview.problems.length
          ? `не уйдёт: ${letter.preview.problems[0]}`
          : `готово · ${letter.preview.to} · от ${letter.preview.from_name || letter.preview.from}`;
  return (
    <Chip
      title={`Письмо${company ? ` для «${company}»` : ""}${letter ? `: ${letter.preview.subject}` : ""}`}
      detail={detail}
      tone={error ? "error" : letter && !letter.preview.problems.length ? "ok" : letter ? "warning" : "muted"}
      threadId={message.threadId}
      focus={{ kind: "company", id: companyId, title: company.slice(0, 200) }}
      sandbox={!!letter?.preview.sender?.legal_entity?.sandbox}
      actions={
        letter && !letter.preview.problems.length ? (
          <SendLetterButton
            letter={letter}
            companyId={companyId}
            compact
            onSent={(m) => {
              setSentId(m.id);
              reload();
            }}
          />
        ) : null
      }
    />
  );
}

function SentLetterChip({ id, threadId }: { id: string; threadId: string }) {
  const { letter, error, setLetter } = useSentLetter(id);
  if (!letter) {
    return (
      <Chip title="Письмо" detail={error ?? "загружаем…"} tone={error ? "error" : "muted"} threadId={threadId} focus={{ kind: "company", id: "", title: "" }} />
    );
  }
  return (
    <Chip
      title={`Письмо${letter.company_name ? ` для «${letter.company_name}»` : ""}: ${letter.subject}`}
      detail={<LetterStatus letter={letter} />}
      tone={letter.tone}
      threadId={threadId}
      focus={{ kind: "company", id: letter.company_id ?? "", title: letter.company_name.slice(0, 200) }}
      sandbox={letter.sandbox}
      badge={letter.replies.length ? <Badge tone="volt">ответ</Badge> : null}
      actions={letter.cancellable ? <CancelLetterButton letter={letter} onDone={setLetter} /> : null}
    />
  );
}

/** ::manifest-mailing{id="…"} — рассылка: живой статус и главное действие; сама рассылка справа. */
export function MailingChip({ attributes, message }: PluginMessageDirectiveProps) {
  const id = (attributes.id ?? "").trim();
  const valid = UUID.test(id);
  const { mailing: m, error } = useMailing(valid ? id : "");
  if (!valid) return <span className="text-xs text-muted-foreground">Рассылка: не указан id.</span>;
  const line = m ? mailingLine(m) : null;
  return (
    <Chip
      title={m ? `Рассылка «${m.name}»` : "Рассылка"}
      detail={error ?? line?.text ?? "загружаем…"}
      tone={error ? "error" : (line?.tone ?? "muted")}
      threadId={message.threadId}
      focus={{ kind: "mailing", id, title: m?.name ?? "" }}
      sandbox={m?.mode === "sandbox" || !!m?.progress?.sandbox}
      badge={m?.progress?.replies ? <Badge tone="volt">ответов {m.progress.replies}</Badge> : null}
      extra={m && (m.state === "done" || m.state === "stopped") ? <MailingProgressBar m={m} /> : null}
      actions={m && (m.state === "draft" || m.state === "sending") ? <MailingSendBar mailing={m} /> : null}
    />
  );
}
