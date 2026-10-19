// Входящее письмо как объект (W-18, В-4): текст как есть, привязка к организации,
// «Спам», «Игнорировать». Содержимое — недоверенные данные: только текст, без HTML.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { errorText, useStatus, useTool } from "../hooks";
import { formatDateTime } from "../labels";
import { CompanyPicker, INBOUND_KIND_LABEL, type Inbound } from "../mail/common";

export function InboundView({ id, onLinked }: { id: string; onLinked?: (company: { id: string; name: string }) => void }) {
  const tool = useTool();
  const { status } = useStatus();
  const [x, setX] = useState<Inbound | null>(null);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    tool<Inbound>("mail_inbound_get", { id }).then(
      (r) => {
        setX(r);
        setError(null);
      },
      (e: unknown) => setError(errorText(e)),
    );
  }, [id, tool]);
  useEffect(load, [load]);
  const act = async (name: string, args: Record<string, unknown>) => {
    setBusy(true);
    try {
      setX(await tool<Inbound>(name, args));
      setError(null);
      if (name === "mail_inbound_link" && target) onLinked?.(target);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  if (!x) return <p className="p-3 text-xs text-muted-foreground">{error ?? "Загружаем письмо…"}</p>;
  return (
    <div className="@container flex flex-col gap-2 p-3 text-xs">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-muted-foreground">От</dt>
        <dd className="break-all">{x.from_name ? `${x.from_name} <${x.from_address}>` : x.from_address}</dd>
        <dt className="text-muted-foreground">Тема</dt>
        <dd className="font-medium">{x.subject}</dd>
        <dt className="text-muted-foreground">Получено</dt>
        <dd>
          {formatDateTime(x.received_at)} · {INBOUND_KIND_LABEL[x.kind] ?? x.kind}
        </dd>
        <dt className="text-muted-foreground">Разбор</dt>
        <dd>{x.company_id ? `привязано: ${x.company_name}` : x.triage === "spam" ? "спам" : x.triage === "ignored" ? "игнорируется" : "не разобрано"}</dd>
      </dl>
      <p className="text-[11px] text-muted-foreground">Внешнее письмо: текст показан как есть, ссылки и вложения не открываются автоматически.</p>
      <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-sans">{x.reply_text || x.body_text}</pre>
      {x.attachments.length ? <p className="text-muted-foreground">Вложения: {x.attachments.map((a) => a.filename).join(", ")}</p> : null}
      {error ? <p className="text-destructive">{error}</p> : null}
      {status?.canManage && !x.company_id ? (
        <div className="flex flex-col gap-2 @md:flex-row @md:items-center">
          <div className="min-w-0 flex-1">
            <CompanyPicker value={target} onChange={setTarget} placeholder="Привязать к организации…" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-9" disabled={busy || !target} onClick={() => void act("mail_inbound_link", { id, company_id: target?.id })}>
              Привязать
            </Button>
            <Button size="sm" variant="ghost" className="h-9" disabled={busy} onClick={() => void act("mail_inbound_mark", { id, triage: "spam" })}>
              Спам
            </Button>
            <Button size="sm" variant="ghost" className="h-9" disabled={busy} onClick={() => void act("mail_inbound_mark", { id, triage: "ignored" })}>
              Игнорировать
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
