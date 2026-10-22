// «Проверить» (EP-110, README §6г): everything waiting for a person's decision — drafts of
// organisations' catalogs (already in the rating) and doubtful automatic choices of every
// source, once per position and product (a decision settles it wherever it applies).
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { errorText, useStatus, useTool } from "../hooks";
import { countryName } from "../labels";
import { Note } from "../RegistryList";
import { useOpenObject, useOpenPinned } from "../workspace/state";
import { ChoiceTable, assortmentChanged, type ChoiceRow } from "./ChoiceTable";
import { useAssortmentChanged, type SourceCoverage } from "./Matching";

interface ReviewData {
  drafts: SourceCoverage[];
  queue: ChoiceRow[];
}

/** What waits for a person: drafts and doubtful choices; reloads after any decision. */
export function useReview(): { data: ReviewData | null; error: string | null; reload: () => void } {
  const tool = useTool();
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    Promise.all([tool<{ sources?: SourceCoverage[] }>("assortment_coverage", {}), tool<{ items: ChoiceRow[] }>("assortment_queue", {})]).then(
      ([c, q]) => {
        setData({ drafts: (c.sources ?? []).filter((x) => x.draft), queue: q.items ?? [] });
        setError(null);
      },
      (e: unknown) => setError(errorText(e)),
    );
  }, [tool]);
  useEffect(reload, [reload]);
  useAssortmentChanged(reload);
  return { data, error, reload };
}

export function Review() {
  const { status } = useStatus();
  const { data, error } = useReview();
  if (!status?.canAssortment) return <Note>Проверка появится после обновления Manifest.</Note>;
  if (error) return <Note>Не удалось загрузить: {error}</Note>;
  if (!data) return <Note>Загружаем…</Note>;
  const canDecide = !!status.canManage;
  const positions = new Set(data.queue.map((r) => r.need_id)).size;
  return (
    <div className="flex flex-col">
      <Section title={`Черновики каталогов (${data.drafts.length})`} hint="Уже в рейтинге организаций; подтвердите или отклоните.">
        {data.drafts.length ? (
          <ul className="flex flex-col">
            {data.drafts.map((d) => (
              <DraftRow key={d.source_id} d={d} canDecide={canDecide} />
            ))}
          </ul>
        ) : (
          <p className="px-3 py-2 text-xs text-muted-foreground">Черновиков нет.</p>
        )}
      </Section>
      <Section
        title={`Сомнительные выборы (${data.queue.length})`}
        hint={
          data.queue.length
            ? `${positions} поз. листа. Решение по товару STIHL действует во всех странах, по артикулу — во всех источниках, по названию — в своём каталоге.`
            : ""
        }
      >
        {data.queue.length ? (
          <ChoiceTable rows={data.queue} canDecide={canDecide} showSource />
        ) : (
          <p className="px-3 py-2 text-xs text-muted-foreground">Проверять нечего: все сомнительные выборы решены.</p>
        )}
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border">
      <div className="mf-surface flex flex-wrap items-baseline gap-x-2 px-3 py-2">
        <h3 className="text-[13px] font-bold">{title}</h3>
        {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function DraftRow({ d, canDecide }: { d: SourceCoverage; canDecide: boolean }) {
  const tool = useTool();
  const openPinned = useOpenPinned();
  const openObject = useOpenObject();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      await tool(name, { id: d.snapshot_id });
      assortmentChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const ref = d.company_id ? { kind: "company" as const, id: d.company_id, title: d.company_name ?? d.title } : null;
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--mf-line-200)] px-3 py-1.5 text-xs">
      <span className="min-w-0 flex-1 truncate">
        <b>{d.company_name || d.title}</b>
        <span className="text-muted-foreground">
          {" "}
          · {countryName(d.country)} · {d.source_kind === "pricelist" ? "прайс" : "сайт"} · {Math.round(d.by_volume)}% по объёму ·{" "}
          {d.full + d.partial} из {d.positions} поз.
        </span>
      </span>
      {ref ? (
        <button
          type="button"
          className="h-6 rounded-md px-1.5 text-[11px] text-muted-foreground hover:bg-state-hover hover:text-foreground"
          onClick={() => {
            if (!openPinned(ref)) void openObject(ref);
          }}
        >
          Рядом
        </button>
      ) : null}
      {canDecide ? (
        <span className="flex gap-1.5">
          <Button size="sm" className="h-6 px-2 text-[11px]" disabled={busy} onClick={() => void act("assortment_confirm")}>
            Подтвердить
          </Button>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={busy} onClick={() => void act("assortment_discard")}>
            Отклонить
          </Button>
        </span>
      ) : null}
      {error ? <span role="alert" className="w-full text-destructive">{error}</span> : null}
    </li>
  );
}
