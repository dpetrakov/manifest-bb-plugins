// Отправка писем в плагине (W-20, EP-099, docs/outreach/sending.md §2–§4, ADR-050).
// Отправляет, отменяет и останавливает только человек кнопкой — всегда через карточку
// подтверждения: что, кому, от кого, песочница или бой. Агенту Manifest эти вызовы не
// даёт. Статусы живые: сервер плагина раз в 45 с спрашивает Manifest, что изменилось,
// и рассылает сигналы; виджеты перечитывают свой объект.
import { AttachmentList } from "./attachments";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRealtime } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { errorText, useCompanyChanged, useStatus, useTool } from "../hooks";
import { formatDateTime } from "../labels";
import { Badge, ConfirmCard, ModeBadge, Progress, Status, type Tone } from "../manifest";
import type { Letter, Mailing } from "./common";

export const LETTER_CHANGED = "manifest-letter-changed";
export const INBOUND_CHANGED = "manifest-inbound-changed";

export interface MessageReply {
  id: string;
  kind: string;
  received_at: string;
  from: string;
  from_name: string;
  subject: string;
  snippet: string;
}

/** A sent letter (mail_message). */
export interface SentLetter {
  id: string;
  company_id: string | null;
  company_name: string;
  legal_entity: string;
  sandbox: boolean;
  from: string;
  from_name: string;
  to: string;
  subject: string;
  text: string;
  template: string;
  mailing_id: string | null;
  mailing_name: string;
  reply_to_inbound_id: string | null;
  status: string;
  status_text: string;
  tone: Tone;
  final: boolean;
  cancellable: boolean;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  created_by: string;
  replies: MessageReply[];
  /** EP-113: the files the letter carried. */
  attachments?: import("./attachments").AttachmentSheet[];
}

/** Refetch on «letter changed» (send, cancel, a status from the gateway). */
export function useLetterChanged(handler: (id: string, companyId: string | null) => void) {
  useRealtime(LETTER_CHANGED, (payload) => {
    const p = payload as { id?: unknown; companyId?: unknown } | null;
    if (typeof p?.id === "string") handler(p.id, typeof p.companyId === "string" ? p.companyId : null);
  });
}

/** One sent letter, live. */
export function useSentLetter(id: string) {
  const tool = useTool();
  const [letter, setLetter] = useState<SentLetter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!id) return;
    tool<SentLetter>("mail_message_get", { id }).then(
      (m) => {
        setLetter(m);
        setError(null);
      },
      (e: unknown) => setError(errorText(e)),
    );
  }, [id, tool]);
  useEffect(load, [load]);
  useLetterChanged((changed) => {
    if (changed === id) load();
  });
  useRealtime(INBOUND_CHANGED, () => load());
  return { letter, error, reload: load, setLetter };
}

/** Letters sent to an organisation, newest first, live. */
export function useSentLetters(companyId: string) {
  const tool = useTool();
  const { status } = useStatus();
  const [items, setItems] = useState<SentLetter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const load = useCallback(() => {
    if (!companyId || !status?.connected || !status.canMail) return;
    const my = ++seq.current;
    tool<{ items: SentLetter[] }>("mail_messages", { company_id: companyId, limit: 50 }).then(
      (r) => {
        if (my !== seq.current) return;
        setItems(r?.items ?? []);
        setError(null);
      },
      (e: unknown) => my === seq.current && setError(errorText(e)),
    );
  }, [companyId, status?.canMail, status?.connected, tool]);
  useEffect(load, [load]);
  useCompanyChanged((id) => {
    if (id === companyId) load();
  });
  useLetterChanged((_, c) => {
    if (c === companyId) load();
  });
  return { items, error, reload: load };
}

/** Plain button of a confirmation: primary or quiet. */
function Act({ primary, danger, disabled, onClick, children, title }: { primary?: boolean; danger?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-7 rounded-md px-2.5 font-semibold disabled:cursor-not-allowed disabled:opacity-45 [@media(pointer:coarse)]:h-10",
        primary ? "bg-foreground text-background" : danger ? "border border-[rgba(255,79,58,0.5)] bg-background text-destructive" : "hover:bg-state-hover",
      )}
    >
      {children}
    </button>
  );
}

/** Why a send button is inactive, or null. */
export function useSendBlock(): string | null {
  const { status } = useStatus();
  if (!status?.connected) return "нет подключения к Manifest";
  if (!status.canSend) return "нет права «Аутрич: отправка писем» (outreach.send)";
  return null;
}

/** «Отправить» for the open draft of an organisation, with the confirmation. */
export function SendLetterButton({ letter, companyId, onSent, compact }: { letter: Letter; companyId: string; onSent?: (m: SentLetter) => void; compact?: boolean }) {
  const tool = useTool();
  const block = useSendBlock();
  // The confirmation holds the letter as it was when opened: if the letter changes
  // meanwhile (an agent edit, another sender), it closes — the person looks again.
  const [confirmed, setConfirmed] = useState<Letter | null>(null);
  const confirm = confirmed !== null;
  const setConfirm = (on: boolean) => setConfirmed(on ? letter : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (confirmed && !busy && confirmed.fingerprint !== letter.fingerprint) {
      setConfirmed(null);
      setError("Письмо изменилось — посмотрите его ещё раз и отправьте.");
    }
  }, [busy, confirmed, letter.fingerprint]);
  const shown = confirmed ?? letter;
  const p = shown.preview;
  const ready = letter.preview.problems.length === 0;
  const sandbox = !!p.sender?.legal_entity?.sandbox;
  const send = async () => {
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const m = await tool<SentLetter>("mail_send", {
        company_id: companyId,
        expect_updated_at: confirmed.draft.updated_at,
        fingerprint: confirmed.fingerprint ?? "",
      });
      setConfirm(false);
      onSent?.(m);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const why = block ?? (ready ? null : `не уйдёт: ${letter.preview.problems[0]}`);
  return (
    <div className="flex flex-col gap-1.5">
      {!confirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <Act primary disabled={!!why} title={why ?? undefined} onClick={() => setConfirm(true)}>
            Отправить
          </Act>
          {sandbox ? <ModeBadge sandbox /> : null}
          {why && !compact ? <span className="text-[11px] text-muted-foreground">{why}</span> : null}
        </div>
      ) : (
        <ConfirmCard
          title="Отправить письмо?"
          actions={
            <>
              <Act primary disabled={busy} onClick={() => void send()}>
                {busy ? "Отправляем…" : "Отправить"}
              </Act>
              <Act disabled={busy} onClick={() => setConfirm(false)}>
                Отмена
              </Act>
            </>
          }
        >
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt className="text-muted-foreground">Кому</dt>
            <dd className="break-all">{p.to}</dd>
            <dt className="text-muted-foreground">Тема</dt>
            <dd className="font-medium">{p.subject}</dd>
            <dt className="text-muted-foreground">От кого</dt>
            <dd className="break-all">
              {p.from_name} · {p.from}
            </dd>
            <dt className="text-muted-foreground">Куда</dt>
            <dd>
              {sandbox ? (
                <>
                  <ModeBadge sandbox /> настоящему адресу не уйдёт
                </>
              ) : (
                "настоящему адресату"
              )}
            </dd>
            <dt className="text-muted-foreground">Когда</dt>
            <dd>в порядке очереди юрлица</dd>
          </dl>
        </ConfirmCard>
      )}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}

/** «Отменить» for a letter in the queue. */
export function CancelLetterButton({ letter, onDone }: { letter: SentLetter; onDone?: (m: SentLetter) => void }) {
  const tool = useTool();
  const block = useSendBlock();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!letter.cancellable) return null;
  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      const m = await tool<SentLetter>("mail_message_cancel", { id: letter.id });
      onDone?.(m);
      setConfirm(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      {confirm ? (
        <ConfirmCard
          title="Отменить письмо?"
          actions={
            <>
              <Act danger disabled={busy} onClick={() => void cancel()}>
                {busy ? "Отменяем…" : "Отменить письмо"}
              </Act>
              <Act disabled={busy} onClick={() => setConfirm(false)}>
                Не отменять
              </Act>
            </>
          }
        >
          <span>
            {letter.to} — письмо снимется из очереди. Если оно уже уходит, отменить не получится.
          </span>
        </ConfirmCard>
      ) : (
        <Act disabled={!!block} title={block ?? undefined} onClick={() => setConfirm(true)}>
          Отменить
        </Act>
      )}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}

/** Status of a sent letter: dot + words + when. */
export function LetterStatus({ letter, className }: { letter: SentLetter; className?: string }) {
  const when = letter.sent_at ? ` ${formatDateTime(letter.sent_at)}` : letter.scheduled_at && !letter.final ? ` · уйдёт ~${formatDateTime(letter.scheduled_at)}` : "";
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <Status tone={letter.tone}>
        {letter.status_text}
        {when}
      </Status>
      {letter.replies.length > 0 ? <Badge tone="volt">ответ{letter.replies.length > 1 ? `ов ${letter.replies.length}` : ""}</Badge> : null}
      {letter.sandbox ? <ModeBadge sandbox /> : null}
    </span>
  );
}

/** A sent letter as it went: header, status, actions, text, replies. */
export function SentLetterView({ id, onReply }: { id: string; onReply?: (inboundId: string) => void }) {
  const { letter, error, setLetter } = useSentLetter(id);
  if (error) return <p className="text-destructive">{error}</p>;
  if (!letter) return <p className="text-muted-foreground">Загружаем письмо…</p>;
  const lastReply = letter.replies.filter((r) => r.kind === "reply").at(-1);
  return (
    <div className="mf-card flex flex-col gap-2 overflow-hidden p-0 text-xs">
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-b border-[var(--mf-line-200)] bg-[#fbfcfb] px-3 py-2">
        <dt className="text-muted-foreground">От</dt>
        <dd className="truncate">
          {letter.from_name} &lt;{letter.from}&gt; · {letter.legal_entity}
        </dd>
        <dt className="text-muted-foreground">Кому</dt>
        <dd className="truncate">{letter.to}</dd>
        <dt className="text-muted-foreground">Тема</dt>
        <dd className="font-medium">{letter.subject}</dd>
        <dt className="text-muted-foreground">Статус</dt>
        <dd>
          <LetterStatus letter={letter} />
        </dd>
      </dl>
      <div className="flex flex-col gap-2 px-3 pb-3">
        <p className="text-[11px] text-muted-foreground">
          Отправил {letter.created_by} · {formatDateTime(letter.created_at)}
          {letter.mailing_name ? ` · рассылка «${letter.mailing_name}»` : ""}
        </p>
        <CancelLetterButton letter={letter} onDone={setLetter} />
        <AttachmentList sheets={letter.attachments ?? []} messageId={letter.id} />
        {letter.replies.map((r) => (
          <div key={r.id} title="Текст поставщика как пришёл" className="flex flex-col gap-1 rounded-md border border-[var(--mf-line-300)] bg-background p-2">
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge tone={r.kind === "reply" ? "volt" : "muted"}>{r.kind === "reply" ? "ответ" : r.kind === "auto_reply" ? "автоответ" : r.kind}</Badge>
              <span className="text-muted-foreground">
                {formatDateTime(r.received_at)} · {r.from_name || r.from}
              </span>
            </span>
            <span className="whitespace-pre-wrap">{r.snippet}</span>
          </div>
        ))}
        {lastReply && onReply ? (
          <div>
            <Act primary onClick={() => onReply(lastReply.id)}>
              Ответить
            </Act>
          </div>
        ) : null}
        <pre className="max-h-[360px] overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-sans">{letter.text}</pre>
      </div>
    </div>
  );
}

/** Letters sent to an organisation: list, open one in place. */
export function SentLetters({ companyId, onReply, focusId }: { companyId: string; onReply?: (inboundId: string) => void; focusId?: string }) {
  const { items, error } = useSentLetters(companyId);
  const [open, setOpen] = useState<string | null>(focusId ?? null);
  useEffect(() => {
    if (focusId) setOpen(focusId);
  }, [focusId]);
  if (error) return <p className="text-destructive">{error}</p>;
  if (!items) return null;
  if (items.length === 0) return <p className="text-muted-foreground">Писем ещё не отправляли.</p>;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((m) => (
        <li key={m.id} className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setOpen(open === m.id ? null : m.id)}
            className={cn("flex min-w-0 flex-col gap-0.5 rounded-md border border-[var(--mf-line-300)] bg-background px-2 py-1.5 text-left hover:bg-state-hover", open === m.id && "shadow-[inset_2px_0_0_var(--foreground)]")}
          >
            <span className="truncate font-medium">{m.subject}</span>
            <LetterStatus letter={m} className="text-[11px]" />
          </button>
          {open === m.id ? <SentLetterView id={m.id} onReply={onReply} /> : null}
        </li>
      ))}
    </ul>
  );
}

// ---- mailing ----

export interface SenderCount {
  from: string;
  from_name: string;
  letters: number;
}

export interface MailingProgress {
  letters: number;
  in_channel: number;
  sent: number;
  failed: number;
  suppressed: number;
  cancelled: number;
  replies: number;
  auto_replies: number;
  unsubscribes: number;
  senders: SenderCount[];
  estimated_done_at: string | null;
  sandbox: boolean;
  sent_at: string | null;
  sent_by: string;
  stopped_at: string | null;
  stopped_by: string;
}

/** Status line of a mailing for chips and the widget header. */
export function mailingLine(m: Mailing): { tone: Tone; text: string } {
  const p = m.progress;
  if (m.state === "draft" || !p) {
    return { tone: m.skipped ? "warning" : m.ready ? "ok" : "muted", text: `уйдёт ${m.ready} из ${m.total}${m.skipped ? ` · не уйдёт ${m.skipped}` : ""}` };
  }
  const parts = [`отправлено ${p.sent} из ${p.letters}`];
  if (p.in_channel) parts.push(`в очереди ${p.in_channel}`);
  if (p.failed) parts.push(`недоставка ${p.failed}`);
  if (p.cancelled) parts.push(`снято ${p.cancelled}`);
  if (p.unsubscribes) parts.push(`отписка ${p.unsubscribes}`);
  if (m.state === "sending" && p.estimated_done_at) parts.push(`закончится ~${formatDateTime(p.estimated_done_at)}`);
  if (m.state === "stopped") parts.push("остановлена");
  return { tone: m.state === "sending" ? "info" : p.failed ? "warning" : "ok", text: parts.join(" · ") };
}

export function MailingProgressBar({ m, className }: { m: Mailing; className?: string }) {
  const p = m.progress;
  if (!p) return null;
  return (
    <Progress
      className={className}
      parts={[
        { tone: "ok", value: p.sent },
        { tone: "info", value: p.in_channel },
        { tone: "error", value: p.failed },
        { tone: "warning", value: p.cancelled + p.suppressed },
      ]}
    />
  );
}

/** Send / stop of a mailing with the confirmation (sending.md §2.2). */
export function MailingSendBar({ mailing: live, onChanged }: { mailing: Mailing; onChanged?: (m: Mailing) => void }) {
  const tool = useTool();
  const block = useSendBlock();
  const [confirm, setConfirmState] = useState<"send" | "stop" | null>(null);
  // «Отправить N» holds the mailing as it was when the confirmation opened.
  const [frozen, setFrozen] = useState<Mailing | null>(null);
  const setConfirm = (c: "send" | "stop" | null) => {
    setConfirmState(c);
    setFrozen(c === "send" ? live : null);
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (frozen && !busy && (frozen.fingerprint !== live.fingerprint || frozen.ready !== live.ready || live.state !== "draft")) {
      setConfirmState(null);
      setFrozen(null);
      if (live.state === "draft") setError("Рассылка изменилась — посмотрите её ещё раз и отправьте.");
    }
  }, [busy, frozen, live.fingerprint, live.ready, live.state]);
  const mailing = frozen ?? live;
  const run = async (name: "mail_mailing_send" | "mail_mailing_stop", args: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      // Call first: `onChanged?.(await …)` would skip the call when there is no handler.
      const m = await tool<Mailing>(name, args);
      onChanged?.(m);
      setConfirm(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const sandbox = mailing.mode === "sandbox";
  if (mailing.state === "draft") {
    const why = block ?? (mailing.ready === 0 ? "ни одно письмо не уйдёт" : null);
    return (
      <div className="flex flex-col gap-1.5">
        {confirm === "send" ? (
          <ConfirmCard
            title={`Отправить ${mailing.ready} ${plural(mailing.ready, "письмо", "письма", "писем")}?`}
            actions={
              <>
                <Act primary disabled={busy} onClick={() => void run("mail_mailing_send", { id: mailing.id, expect: mailing.ready, fingerprint: mailing.fingerprint ?? "" })}>
                  {busy ? "Отправляем…" : `Отправить ${mailing.ready}`}
                </Act>
                <Act disabled={busy} onClick={() => setConfirm(null)}>
                  Отмена
                </Act>
              </>
            }
          >
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <dt className="text-muted-foreground">Тема</dt>
              <dd className="font-medium">{mailing.subject}</dd>
              <dt className="text-muted-foreground">Куда</dt>
              <dd>
                {mailing.mode === "mixed" ? (
                  <>
                    часть писем — <ModeBadge sandbox />, часть — настоящим адресатам (разные юрлица)
                  </>
                ) : (
                  <>
                    {sandbox ? (
                      <>
                        <ModeBadge sandbox /> настоящим адресатам не уйдёт
                      </>
                    ) : (
                      "настоящим адресатам"
                    )}
                  </>
                )}
              </dd>
              <dt className="text-muted-foreground">От кого</dt>
              <dd>{(mailing.senders ?? []).map((s) => `${s.from_name || s.from} — ${s.letters}`).join(" · ") || "—"}</dd>
              <dt className="text-muted-foreground">Темп</dt>
              <dd>{sandbox ? "песочница: секунды" : "по очереди юрлица, до 20 писем в день на старте"}</dd>
              {mailing.skipped ? (
                <>
                  <dt className="text-muted-foreground">Не уйдут</dt>
                  <dd>
                    <Status tone="warning">{mailing.skipped}</Status>
                  </dd>
                </>
              ) : null}
            </dl>
          </ConfirmCard>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Act primary disabled={!!why} title={why ?? undefined} onClick={() => setConfirm("send")}>
              Отправить {mailing.ready}
            </Act>
            {mailing.mode ? <ModeBadge sandbox={sandbox || mailing.mode === "mixed"} /> : null}
          </div>
        )}
        {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      </div>
    );
  }
  const p = mailing.progress;
  return (
    <div className="flex flex-col gap-1.5">
      <MailingProgressBar m={mailing} />
      {p ? (
        <span className="text-[11px] text-muted-foreground">
          Отправил {p.sent_by} · {p.sent_at ? formatDateTime(p.sent_at) : ""}
          {p.stopped_at ? ` · остановил ${p.stopped_by} ${formatDateTime(p.stopped_at)}` : ""}
          {(p.senders ?? []).length ? ` · ${p.senders.map((s) => `${s.from_name || s.from} — ${s.letters}`).join(", ")}` : ""}
        </span>
      ) : null}
      {mailing.state === "sending" ? (
        confirm === "stop" ? (
          <ConfirmCard
            title="Остановить рассылку?"
            actions={
              <>
                <Act danger disabled={busy} onClick={() => void run("mail_mailing_stop", { id: mailing.id })}>
                  {busy ? "Останавливаем…" : "Остановить"}
                </Act>
                <Act disabled={busy} onClick={() => setConfirm(null)}>
                  Не останавливать
                </Act>
              </>
            }
          >
            <span>Письма, которые ещё не ушли ({p?.in_channel ?? 0}), снимутся. Ушедшие не вернуть.</span>
          </ConfirmCard>
        ) : (
          <div>
            <Act disabled={!!block} title={block ?? undefined} onClick={() => setConfirm("stop")}>
              Остановить
            </Act>
          </div>
        )
      ) : null}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

