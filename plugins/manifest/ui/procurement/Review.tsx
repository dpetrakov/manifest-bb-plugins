// «Проверить» (EP-110, README §6г): everything waiting for a person's decision.
// 1) Drafts of organisations' catalogs — already in the rating; «Посмотреть» shows what the
//    catalog gave the sheet and what it has beyond it, then «Подтвердить» / «Отклонить».
// 2) Doubtful automatic choices, grouped by position of the sheet: the position as the
//    sheet needs it on top, under it the candidate products. One STIHL product in many
//    countries is one row (a decision by its global id settles it everywhere).
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errorText, useStatus, useTool } from "../hooks";
import { countryName } from "../labels";
import { Note } from "../RegistryList";
import { StatusDot } from "../manifest";
import type { Need } from "../types";
import { assortmentChanged, levelView, sourceLabel, type Alternative, type ChoiceRow, type SourceInfo } from "./ChoiceTable";
import { KitMark, money, th } from "./grid";
import { useAssortmentChanged, type SourceCoverage } from "./Matching";
import { useOpenSource } from "./nav";

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

/** A product the way decisions see it: global id, article, else its name in its catalog. */
function productKey(c: ChoiceRow): string {
  if (c.global_id) return `g:${c.global_id}`;
  if (c.sku) return `s:${c.sku}`;
  return `n:${c.source?.source_id}:${(c.name ?? "").toLowerCase().replace(/\s+/g, " ")}`;
}

function decisionKey(p: { global_id?: string; sku?: string; name?: string }, source?: SourceInfo): Record<string, unknown> {
  if (p.global_id) return { key_kind: "global_id", key: p.global_id };
  if (p.sku) return { key_kind: "sku", key: p.sku };
  return { key_kind: "name", key: p.name ?? "", source_id: source?.source_id };
}

const REASON_SHORT: Record<string, string> = {
  trim: "исполнение не указано",
  generation: "другое поколение",
  kit: "набор ↔ без АКБ",
  mains: "зарядное не для сети ЕС",
};

interface Candidate {
  key: string;
  rows: ChoiceRow[]; // the same product in several sources
}
interface PositionGroup {
  needId: string;
  first: ChoiceRow;
  candidates: Candidate[];
}

function groupQueue(queue: ChoiceRow[]): PositionGroup[] {
  const byNeed = new Map<string, PositionGroup>();
  for (const r of queue) {
    let g = byNeed.get(r.need_id);
    if (!g) byNeed.set(r.need_id, (g = { needId: r.need_id, first: r, candidates: [] }));
    const k = productKey(r);
    const c = g.candidates.find((x) => x.key === k);
    if (c) c.rows.push(r);
    else g.candidates.push({ key: k, rows: [r] });
  }
  return [...byNeed.values()].sort((a, b) => a.first.position_no - b.first.position_no);
}

export function Review() {
  const { status } = useStatus();
  const tool = useTool();
  const { data, error } = useReview();
  const [needs, setNeeds] = useState<Map<string, Need>>(new Map());
  useEffect(() => {
    tool<{ items: Need[] }>("procurement_needs", {}).then(
      (r) => setNeeds(new Map((r.items ?? []).map((n) => [n.id, n]))),
      () => setNeeds(new Map()),
    );
  }, [tool]);
  const groups = useMemo(() => (data ? groupQueue(data.queue) : []), [data]);
  if (!status?.canAssortment) return <Note>Проверка появится после обновления Manifest.</Note>;
  if (error) return <Note>Не удалось загрузить: {error}</Note>;
  if (!data) return <Note>Загружаем…</Note>;
  const canDecide = !!status.canManage;
  const products = groups.reduce((n, g) => n + g.candidates.length, 0);
  return (
    <div className="@container flex flex-col">
      <Section title="Черновики каталогов" count={data.drafts.length} hint="Уже в рейтинге организаций. Состав каталога, «Подтвердить» и «Отклонить» — в «Источниках».">
        {data.drafts.length ? <Drafts drafts={data.drafts} /> : <Empty>Черновиков нет.</Empty>}
      </Section>
      <Section
        title="Сомнительные выборы"
        count={products}
        hint={
          groups.length
            ? `${groups.length} поз. листа. Решение по товару STIHL действует во всех странах, по артикулу — во всех источниках, по названию — в своём каталоге.`
            : ""
        }
      >
        {groups.length ? (
          // Auto layout: a position row spans every column, a narrow panel shows one.
          <table className="w-full border-collapse bg-[var(--mf-surface)] text-xs">
            <thead className="sticky top-0 z-10 bg-[var(--mf-surface)] shadow-[inset_0_-1px_0_var(--mf-line-300)]">
              <tr>
                <th className={cn(th, "pl-3 text-left")}>Товар источника</th>
                <th className={cn(th, "hidden w-[24%] text-left @[36rem]:table-cell")}>Где</th>
                <th className={cn(th, "hidden w-[11rem] text-left @[44rem]:table-cell")}>Сомнение</th>
                <th className={cn(th, "hidden w-[10rem] pr-3 text-right @[30rem]:table-cell")}>Решение</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.needId}>
                  <PositionRow row={g.first} need={needs.get(g.needId)} />
                  {g.candidates.map((c) => (
                    <CandidateRows key={c.key} c={c} canDecide={canDecide} />
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>Проверять нечего: все сомнительные выборы решены.</Empty>
        )}
      </Section>
    </div>
  );
}

function Section({ title, count, hint, children }: { title: string; count: number; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border">
      <div className="mf-surface flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2">
        <h3 className="text-[13px] font-bold">
          {title} <span className="font-normal tabular-nums text-muted-foreground">{count}</span>
        </h3>
        {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-2 text-xs text-muted-foreground">{children}</p>;
}

/** The position as the sheet needs it: what every candidate below is compared with. */
function PositionRow({ row, need }: { row: ChoiceRow; need?: Need }) {
  const arts = need?.article_aliases ?? [];
  return (
    <tr className="border-t border-[var(--mf-line-300)] bg-[var(--mf-surface-strong)]">
      <td colSpan={4} className="px-3 py-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="tabular-nums text-muted-foreground">№{row.position_no}</span>
          <span className="font-semibold">{row.model_key}</span>
          {row.kit ? <KitMark /> : null}
          <span className="text-[11px] text-muted-foreground">
            {[row.category, `${row.qty} шт`, arts.length ? `арт. ${arts.slice(0, 2).join(", ")}${arts.length > 2 ? ` +${arts.length - 2}` : ""}` : "", need?.ref_price ? `ориентир ${money(need.ref_price, need.ref_currency)}` : ""]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        {need?.description_en && need.description_en !== row.model_key ? (
          <div className="truncate text-[11px] text-muted-foreground" title={need.description_en}>
            В листе: {need.description_en}
          </div>
        ) : null}
      </td>
    </tr>
  );
}

/** One candidate product (in one or many sources) with the decision buttons. */
function CandidateRows({ c, canDecide }: { c: Candidate; canDecide: boolean }) {
  const tool = useTool();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = c.rows[0];
  const lv = levelView(r);
  // What makes it doubtful, in a few words; the dot says full or half.
  const reason = REASON_SHORT[r.reason ?? ""] ?? lv.text;
  const where = c.rows.map((x) => (x.source?.source_kind === "stihl_country" ? countryName(x.source.country) : sourceLabel(x.source)));
  const decide = async (level: number, alt?: Alternative) => {
    setBusy(true);
    setError(null);
    try {
      await tool("assortment_decide", { need_id: r.need_id, level, reason: level === 0.5 ? r.reason ?? "" : "", ...decisionKey(alt ?? r, r.source) });
      assortmentChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const btn = "h-6 whitespace-nowrap rounded-md border px-1.5 text-[11px] disabled:opacity-50";
  const buttons = (
    <>
      {canDecide ? (
            <span className="inline-flex flex-nowrap gap-1" role="group" aria-label={`Решение: ${r.name}`}>
              <button type="button" className={cn(btn, "border-foreground bg-foreground text-background")} disabled={busy} onClick={() => void decide(1)} title="Тот же товар, что нужен листу">
                Тот же
              </button>
              <button type="button" className={cn(btn, "border-border hover:bg-state-hover")} disabled={busy} onClick={() => void decide(0.5)} title="Частично: подходит с оговоркой">
                ½
              </button>
              <button type="button" className={cn(btn, "border-border text-destructive hover:bg-state-hover")} disabled={busy} onClick={() => void decide(0)} title="Не тот товар">
                Не то
              </button>
            </span>
          ) : null}
    </>
  );
  return (
    <>
      <tr className="border-t border-[var(--mf-line-200)] align-top">
        <td className="py-1.5 pl-3 pr-2">
          <div className="flex min-w-0 items-start gap-1.5">
            <div className="min-w-0">
              <div className="break-words font-medium leading-snug">{r.name}</div>
              <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                {r.sku ? <span className="font-mono">{r.sku}</span> : null}
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer" className="underline">
                    страница
                  </a>
                ) : null}
                <span className="@[36rem]:hidden">· {where.slice(0, 2).join(", ")}{where.length > 2 ? ` +${where.length - 2}` : ""}</span>
                {r.alternatives?.length ? (
                  <button type="button" className="underline" onClick={() => setOpen(!open)} aria-expanded={open}>
                    другие товары модели ({r.alternatives.length})
                  </button>
                ) : null}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] @[44rem]:hidden">
                <StatusDot tone={lv.tone} />
                <span>{reason}</span>
              </div>
              {/* A narrow panel: the decision under the product, the whole width to the name. */}
              <div className="mt-1 @[30rem]:hidden">
                {buttons}
                {error ? <div role="alert" className="mt-0.5 text-[11px] text-destructive">{error}</div> : null}
              </div>
            </div>
          </div>
        </td>
        <td className="hidden w-[24%] px-2 py-1.5 text-[11px] text-muted-foreground @[36rem]:table-cell" title={where.join(", ")}>
          <span className="line-clamp-2">
            {where.slice(0, 4).join(", ")}
            {where.length > 4 ? ` и ещё ${where.length - 4}` : ""}
          </span>
        </td>
        <td className="hidden px-2 py-1.5 @[44rem]:table-cell">
          <span className="flex min-w-0 items-start gap-1.5">
            <StatusDot tone={lv.tone} className="mt-1" />
            <span title={lv.text}>{reason}</span>
          </span>
        </td>
        <td className="hidden py-1.5 pl-2 pr-3 text-right @[30rem]:table-cell">
          {buttons}
          {error ? <div role="alert" className="mt-0.5 text-[11px] text-destructive">{error}</div> : null}
        </td>
      </tr>
      {open && r.alternatives?.length ? (
        <tr className="bg-[var(--mf-paper)]">
          <td colSpan={4} className="px-3 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Другие товары этой модели · {sourceLabel(r.source)}</div>
            {r.alternatives.map((a) => (
              <div key={`${a.global_id}|${a.sku}|${a.name}`} className="flex items-center gap-2 py-0.5 text-xs">
                <span className="min-w-0 flex-1 truncate" title={a.name}>
                  {a.name} <span className="font-mono text-muted-foreground">{a.sku}</span>
                  {a.kit ? " · набор" : ""}
                </span>
                {canDecide ? (
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={busy} onClick={() => void decide(1, a)}>
                    Выбрать
                  </Button>
                ) : null}
              </div>
            ))}
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** Drafts of catalogs: already in the rating; checked and decided in «Источники». */
function Drafts({ drafts }: { drafts: SourceCoverage[] }) {
  const openSource = useOpenSource();
  return (
    <table className="w-full table-fixed border-collapse bg-[var(--mf-surface)] text-xs">
      <thead className="sticky top-0 z-10 bg-[var(--mf-surface)] shadow-[inset_0_-1px_0_var(--mf-line-300)]">
        <tr>
          <th className={cn(th, "pl-3 text-left")}>Организация</th>
          <th className={cn(th, "w-20 text-right")}>Покрытие</th>
          <th className={cn(th, "hidden w-24 text-right @[30rem]:table-cell")}>Позиций</th>
          <th className={cn(th, "w-[6.5rem] pr-3 text-right @[30rem]:w-[11rem]")} />
        </tr>
      </thead>
      <tbody>
        {drafts.map((d) => (
          <tr key={d.source_id} className="border-t border-[var(--mf-line-200)]">
            <td className="max-w-0 py-1.5 pl-3 pr-2">
              <div className="truncate font-medium" title={d.company_name || d.title}>
                {d.company_name || d.title}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {countryName(d.country)} · {d.source_kind === "pricelist" ? "прайс" : "сайт"}
              </div>
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums">{Math.round(d.by_volume)}%</td>
            <td className="hidden px-2 py-1.5 text-right tabular-nums text-muted-foreground @[30rem]:table-cell">
              {d.full + d.partial} из {d.positions}
            </td>
            <td className="py-1.5 pl-2 pr-3 text-right">
              <Button size="sm" variant="outline" className="h-7 whitespace-nowrap border-[var(--mf-amber)] px-2 text-[11px]" aria-label="Проверить в источниках" onClick={() => openSource(d.source_id)}>
                <span className="@[30rem]:hidden">Проверить</span>
                <span className="hidden @[30rem]:inline">Проверить в источниках</span>
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
