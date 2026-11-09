// Every linked inbound message, including unsolicited quotes without an outgoing letter.
import { useEffect, useState } from "react";
import { useRealtime } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { errorText, useCompanyChanged, useTool } from "../hooks";
import { formatDateTime } from "../labels";
import type { Inbound } from "./common";
import { InboundAttachmentList } from "./attachments";
import { INBOUND_CHANGED } from "./send";

const PAGE_SIZE = 50;

export function CompanyInboundFiles({ companyId }: { companyId: string }) {
  const tool = useTool();
  const [items, setItems] = useState<Inbound[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => { setOffset(0); setRevision((n) => n + 1); };
  useCompanyChanged((id) => { if (id === companyId) refresh(); });
  useRealtime(INBOUND_CHANGED, refresh);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError(null);
    tool<{ items: Inbound[]; total: number }>("mail_inbound_list", { company_id: companyId, limit: PAGE_SIZE, offset }).then(
      (result) => {
        if (!active) return;
        if (!result || !Array.isArray(result.items)) throw new Error("Manifest вернул некорректный список входящих. Повторите загрузку.");
        const next = result.items;
        setItems((old) => offset === 0 ? next : [...old.slice(0, offset), ...next]);
        setTotal(result.total ?? next.length);
        setBusy(false);
      },
    ).catch((e: unknown) => { if (active) { setError(errorText(e)); setBusy(false); } });
    return () => { active = false; };
  }, [companyId, offset, revision, tool]);
  const letters = items.filter((x) => x.attachments?.length);
  const more = items.length < total;
  return (
    <section className="mt-2 flex min-w-0 flex-col gap-2 border-t border-[var(--mf-line-200)] pt-2" aria-label="Вложения из входящих" aria-busy={busy}>
      <p className="font-semibold">Вложения из входящих</p>
      {letters.map((x) => (
        <div key={x.id} className="flex min-w-0 flex-col gap-1">
          <p className="break-words text-muted-foreground [overflow-wrap:anywhere]">{formatDateTime(x.received_at)} · {x.from_address}</p>
          <p className="break-words [overflow-wrap:anywhere]">{x.subject}</p>
          <InboundAttachmentList inboundId={x.id} attachments={x.attachments} />
        </div>
      ))}
      {!busy && !error && letters.length === 0 ? <p className="text-muted-foreground">{more ? "В просмотренных письмах вложений нет." : "Во входящих письмах вложений нет."}</p> : null}
      {letters.length > 0 ? <p className="text-[11px] text-muted-foreground">Файлы доступны в течение срока хранения почтового шлюза (30 дней).</p> : null}
      {busy ? <p role="status" className="text-muted-foreground">Загружаем вложения…</p> : null}
      {error ? <div role="alert" className="flex flex-wrap items-center gap-2 text-destructive">{error}<Button type="button" size="sm" variant="outline" className="h-10" onClick={() => setRevision((n) => n + 1)}>Повторить</Button></div> : null}
      {more && !error ? <Button type="button" size="sm" variant="outline" className="h-10 self-start" disabled={busy} onClick={() => setOffset(items.length)}>Показать ещё письма</Button> : null}
    </section>
  );
}
