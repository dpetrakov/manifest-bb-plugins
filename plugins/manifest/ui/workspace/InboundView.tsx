// Входящее письмо как объект (W-18, В-4): текст как есть, привязка к организации,
// «Спам», «Игнорировать». Содержимое — недоверенные данные: только текст, без HTML.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { errorText, useStatus, useTool } from "../hooks";
import { formatDateTime } from "../labels";
import { CompanyPicker, INBOUND_KIND_LABEL, type Inbound } from "../mail/common";
import { Badge, Card, KindLabel, Status } from "../manifest";

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
    <div className="@container mf-island flex flex-col gap-2 p-2 text-xs">
      <Card>
      <div className="flex flex-wrap items-center gap-2">
        <KindLabel>Входящее письмо</KindLabel>
        {x.kind === "reply" ? <Badge tone="volt">ответ</Badge> : null}
      </div>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-muted-foreground">От</dt>
        <dd className="break-all">{x.from_name ? `${x.from_name} <${x.from_address}>` : x.from_address}</dd>
        <dt className="text-muted-foreground">Тема</dt>
        <dd className="font-medium">{x.subject}</dd>
        <dt className="text-muted-foreground">Получено</dt>
        <dd>
          {formatDateTime(x.received_at)} · {INBOUND_KIND_LABEL[x.kind] ?? x.kind}
        </dd>
        <dt className="text-muted-foreground">Разбор</dt>
        <dd>
          {x.company_id ? (
            <Status tone="ok">привязано: {x.company_name}</Status>
          ) : x.triage === "spam" ? (
            <Status tone="muted">спам</Status>
          ) : x.triage === "ignored" ? (
            <Status tone="muted">игнорируется</Status>
          ) : (
            <Status tone="warning">не разобрано</Status>
          )}
        </dd>
      </dl>
      </Card>
      <p className="text-[11px] text-muted-foreground">Внешнее письмо: текст показан как есть, ссылки и вложения не открываются автоматически.</p>
      <pre className="mf-card max-h-[60vh] overflow-y-auto whitespace-pre-wrap p-3 font-sans">{x.reply_text || x.body_text}</pre>
      {x.attachments.length ? <p className="text-muted-foreground">Вложения: {x.attachments.map((a) => a.filename).join(", ")}</p> : null}
      {error ? <p className="text-destructive">{error}</p> : null}
      {x.company_id && (x.answers ?? []).length > 0 ? (
        <Status tone="ok">Ответ отправлен: {(x.answers ?? []).map((a) => a.status_text).join(", ")}</Status>
      ) : null}
      {status?.canManage && x.company_id && (x.kind === "reply" || x.kind === "other") ? (
        <div className="mf-card flex flex-wrap items-center gap-2 p-3">
          <span className="min-w-0 flex-1">Ответ готовится в карточке «{x.company_name}»: черновик «Re: …», текст — с агентом в чате.</span>
          <Button
            size="sm"
            className="h-9"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await tool("mail_reply_draft_create", { inbound_id: id });
                setError(null);
                onLinked?.({ id: x.company_id!, name: x.company_name });
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Ответить
          </Button>
        </div>
      ) : null}
      {status?.canManage && !x.company_id ? (
        <div className="mf-card flex flex-col gap-2 p-3 @md:flex-row @md:items-center">
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
