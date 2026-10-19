// Рассылка (W-17, EP-089, docs/outreach/mail.md §8): одно письмо — много получателей.
// Сводка (сколько уйдёт, кого пропустим и почему), список получателей и письмо каждого
// «как уйдёт» с листанием ← →. Директива ::manifest-mailing{id="…"} в чате и страница
// «Почта аутрича → Рассылки». Отправка — следующая версия.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, type PluginMessageDirectiveProps } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAILING_CHANGED, errorText, useStatus, useTool } from "../hooks";
import { countryName, formatDateTime } from "../labels";
import type { Mailing, MailingLetter } from "./common";
import { PreviewCard } from "./LetterView";

const UUID = /^[0-9a-f-]{36}$/i;

export function useMailing(id: string) {
  const tool = useTool();
  const { status } = useStatus();
  const [mailing, setMailing] = useState<Mailing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const load = useCallback(() => {
    if (!id || !status?.connected) return;
    const my = ++seq.current;
    tool<Mailing>("mail_mailing_get", { id, full: true }).then(
      (m) => {
        if (my !== seq.current) return;
        setMailing(m);
        setError(null);
      },
      (e: unknown) => my === seq.current && setError(errorText(e)),
    );
  }, [id, status?.connected, tool]);
  useEffect(() => {
    setMailing(null);
    setError(null);
  }, [id]);
  useEffect(load, [load]);
  useRealtime(MAILING_CHANGED, (payload) => {
    const p = payload as { id?: unknown; deleted?: unknown } | null;
    if (p?.id !== id) return;
    if (p.deleted === true) {
      seq.current++;
      setMailing(null);
      setError("рассылка удалена");
      return;
    }
    load();
  });
  return { mailing, error, reload: load };
}

export function MailingView({ id, onOpenCompany, onDeleted }: { id: string; onOpenCompany?: (companyId: string) => void; onDeleted?: () => void }) {
  const tool = useTool();
  const { status } = useStatus();
  const { mailing, error, reload } = useMailing(id);
  const [current, setCurrent] = useState<string | null>(null);
  const [letter, setLetter] = useState<MailingLetter | null>(null);
  const [letterError, setLetterError] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canEdit = !!status?.canManage;

  const discard = async () => {
    setBusy(true);
    try {
      await tool("mail_mailing_discard", { id });
      onDeleted?.();
    } catch (e) {
      setLetterError(errorText(e));
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const recipients = mailing?.recipients ?? [];
  const shown = onlyProblems ? recipients.filter((r) => !r.ready) : recipients;
  const selected = current && shown.some((r) => r.company_id === current) ? current : (shown[0]?.company_id ?? null);
  const stamp = mailing?.updated_at ?? "";

  useEffect(() => {
    if (!selected) {
      setLetter(null);
      return;
    }
    let alive = true;
    setLetterError(null);
    tool<MailingLetter>("mail_mailing_letter", { id, company_id: selected }).then(
      (l) => {
        if (!alive) return;
        setLetter(l);
        setLetterError(null);
      },
      (e: unknown) => alive && setLetterError(errorText(e)),
    );
    return () => {
      alive = false;
    };
  }, [id, selected, stamp, tool]);

  const remove = async (companyId: string) => {
    setBusy(true);
    try {
      await tool<Mailing>("mail_mailing_remove", { id, company_ids: [companyId] });
      reload();
    } catch (e) {
      setLetterError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="text-xs text-destructive">Рассылка: {error}</p>;
  if (!mailing) return <p className="text-xs text-muted-foreground">Собираем рассылку…</p>;

  const at = shown.findIndex((r) => r.company_id === selected);
  const step = (d: number) => {
    const next = shown[at + d];
    if (next) setCurrent(next.company_id);
  };

  return (
    <div className="@container mf-root flex flex-col gap-3 rounded-lg border border-border bg-background p-3 text-xs">
      <header className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold">{mailing.name}</h3>
        <span className="text-muted-foreground">
          {mailing.template_name ? `по шаблону «${mailing.template_name}»${mailing.edited ? " · изменён" : ""}` : "без шаблона"} ·{" "}
          {formatDateTime(mailing.updated_at)}
        </span>
      </header>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-700">Уйдёт: {mailing.ready}</span>
        <span className={cn("rounded-md px-2 py-1", mailing.skipped ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
          Не уйдёт: {mailing.skipped}
        </span>
        <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">Всего: {mailing.total}</span>
      </div>
      {Object.keys(mailing.reasons).length > 0 ? (
        <ul className="text-destructive">
          {Object.entries(mailing.reasons).map(([r, n]) => (
            <li key={r}>
              {r} — {n}
            </li>
          ))}
        </ul>
      ) : null}
      {recipients.length === 0 ? (
        <p className="text-muted-foreground">Получателей пока нет. Попросите агента добавить организации — например, по фильтру темы.</p>
      ) : (
        <div className="grid gap-3 @2xl:grid-cols-[minmax(12rem,16rem)_1fr]">
          <div className="flex min-w-0 flex-col gap-1">
            <label className="flex items-center gap-1 text-muted-foreground">
              <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
              Только с проблемами
            </label>
            <ul className="max-h-[520px] overflow-y-auto rounded-md border border-border">
              {shown.map((r) => (
                <li key={r.company_id} className={cn("flex items-center gap-1 border-b border-border last:border-0", r.company_id === selected && "bg-state-active")}>
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left" onClick={() => setCurrent(r.company_id)}>
                    <span className={cn("size-2 flex-none rounded-full", r.ready ? "bg-emerald-500" : "bg-destructive")} title={r.ready ? "уйдёт" : r.problems.join("; ")} />
                    <span className="min-w-0 flex-1 truncate">{r.company_name}</span>
                    <span className="flex-none text-muted-foreground">{countryName(r.country_code)}</span>
                  </button>
                  {canEdit ? (
                    <button
                      type="button"
                      disabled={busy}
                      title="Убрать из рассылки"
                      className="px-1.5 text-muted-foreground hover:text-destructive"
                      onClick={() => void remove(r.company_id)}
                    >
                      ×
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-7" disabled={at <= 0} onClick={() => step(-1)}>
                ←
              </Button>
              <span className="text-muted-foreground">
                {at + 1} из {shown.length}
              </span>
              <Button size="sm" variant="outline" className="h-7" disabled={at < 0 || at >= shown.length - 1} onClick={() => step(1)}>
                →
              </Button>
              <span className="flex-1" />
              {selected && onOpenCompany ? (
                <button type="button" className="text-muted-foreground hover:underline" onClick={() => onOpenCompany(selected)}>
                  Карточка
                </button>
              ) : null}
            </div>
            {letterError ? <p className="text-destructive">{letterError}</p> : null}
            {letter && letter.recipient.company_id === selected ? (
              <PreviewCard preview={letter.preview} caption={letter.recipient.company_name} />
            ) : (
              <p className="text-muted-foreground">Собираем письмо…</p>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-[11px] text-muted-foreground">
          Текст правится через агента — письмо пересоберётся для каждого. Отправка — следующая версия плагина, нажимает человек.
        </p>
        {canEdit && mailing.state !== "sent" ? (
          confirmDelete ? (
            <span className="flex items-center gap-1">
              <span className="text-destructive">Удалить рассылку целиком?</span>
              <Button size="sm" variant="destructive" className="h-7" disabled={busy} onClick={() => void discard()}>
                Удалить
              </Button>
              <Button size="sm" variant="ghost" className="h-7" disabled={busy} onClick={() => setConfirmDelete(false)}>
                Отмена
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => setConfirmDelete(true)}>
              Удалить рассылку
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}

/** ::manifest-mailing{id="…"} — the mailing, live. */
export function MailingDirective({ attributes }: PluginMessageDirectiveProps) {
  const id = (attributes.id ?? "").trim();
  if (!UUID.test(id)) return <p className="text-xs text-muted-foreground">Рассылка: не указан id.</p>;
  return (
    <div className="my-2 max-w-4xl">
      <MailingView id={id} />
    </div>
  );
}
