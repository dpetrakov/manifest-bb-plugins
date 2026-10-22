// The matching table (EP-108, EP-110): the sheet's positions against a source — a
// country's STIHL site or an organisation's catalog. The automatic choice counts at
// once; a person confirms, halves, rejects or picks another product. A decision by the
// STIHL global id applies in every country, by article — in every source with it, by
// name (a product without an article) — only in its catalog.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errorText, useTool } from "../hooks";
import { countryName } from "../labels";
import { StatusDot, type Tone } from "../manifest";
import { KitMark, th } from "./grid";

/** A source the matching runs on (assortment_coverage.sources, a choice's source). */
export interface SourceInfo {
  source_id: string;
  source_kind: string; // stihl_country | pricelist | distributor_site
  country: string;
  company_id?: string;
  company_name?: string;
  title: string;
  snapshot_id: string;
  draft: boolean;
}
export interface Alternative {
  global_id: string;
  sku: string;
  name: string;
  model_key: string;
  kit: boolean;
  url: string;
}
export interface ChoiceRow {
  need_id: string;
  level: number;
  reason?: string;
  via?: string;
  sku?: string;
  global_id?: string;
  name?: string;
  review: boolean;
  decided: boolean;
  decision_id?: string;
  country: string;
  position_no: number;
  model_key: string;
  kit: boolean;
  qty: number;
  category: string;
  url?: string;
  alternatives?: Alternative[];
  source?: SourceInfo;
}

/** Fired after a decision or a draft changed: tabs and badges reload. */
export const ASSORTMENT_CHANGED = "manifest:assortment-changed";
export const assortmentChanged = () => window.dispatchEvent(new Event(ASSORTMENT_CHANGED));

const REASON: Record<string, string> = {
  kit: "набор ↔ без АКБ",
  generation: "другое поколение",
  mains: "зарядное не для сети ЕС",
  trim: "исполнение не указано",
};

export function levelView(c: ChoiceRow): { tone: Tone; text: string } {
  if (c.level >= 1) return { tone: "ok", text: c.reason === "trim" ? "есть · исполнение не указано" : "есть" };
  if (c.level > 0) return { tone: "warning", text: `частично · ${REASON[c.reason ?? ""] ?? c.reason ?? ""}` };
  return { tone: "muted", text: "нет" };
}

/** A source in a few words: «Индонезия · Indokita (сайт)», «Германия · сайт STIHL». */
export function sourceLabel(s?: SourceInfo): string {
  if (!s) return "";
  if (s.source_kind === "stihl_country") return `${countryName(s.country)} · сайт STIHL`;
  return `${s.company_name || s.title} · ${s.source_kind === "pricelist" ? "прайс" : "сайт"}`;
}

/** The key a decision on a product uses: global id, article, else its name in its catalog. */
function decisionKey(p: { global_id?: string; sku?: string; name?: string }, source?: SourceInfo): Record<string, unknown> {
  if (p.global_id) return { key_kind: "global_id", key: p.global_id };
  if (p.sku) return { key_kind: "sku", key: p.sku };
  return { key_kind: "name", key: p.name ?? "", source_id: source?.source_id };
}

export function ChoiceTable({
  rows,
  canDecide,
  showSource = false,
  productLabel = "Товар источника",
}: {
  rows: ChoiceRow[];
  canDecide: boolean;
  showSource?: boolean;
  productLabel?: string;
}) {
  const tool = useTool();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (name: string, args: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await tool(name, args);
      assortmentChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const decide = (c: ChoiceRow, level: number, alt?: Alternative) =>
    run("assortment_decide", { need_id: c.need_id, level, reason: level === 0.5 ? c.reason ?? "" : "", ...decisionKey(alt ?? c, c.source) });
  return (
    <>
      {error ? <p role="alert" className="px-3 py-2 text-xs text-destructive">{error}</p> : null}
      <table className="w-full table-fixed border-collapse bg-[var(--mf-surface)] text-xs">
        <thead className="sticky top-[var(--mf-sticky,0px)] z-10 bg-[var(--mf-surface)] shadow-[inset_0_-1px_0_var(--mf-line-300)]">
          <tr>
            <th className={cn(th, "w-10 pl-3 text-right")}>№</th>
            <th className={cn(th, "text-left @[34rem]:w-[32%]")}>Позиция</th>
            <th className={cn(th, "hidden text-left @[34rem]:table-cell")}>{productLabel}</th>
            <th className={cn(th, "w-[8.5rem] pr-3 text-left @[34rem]:w-[13.5rem]")}>Итог</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const k = `${c.source?.source_id ?? c.country}|${c.need_id}|${c.global_id ?? c.sku ?? c.name ?? ""}`;
            const isOpen = open === k;
            const lv = levelView(c);
            return (
              <Rows
                key={k}
                isOpen={isOpen}
                onToggle={() => setOpen(isOpen ? null : k)}
                cells={
                  <>
                    <td className="py-1 pl-3 pr-2 text-right tabular-nums text-muted-foreground">{c.position_no}</td>
                    <td className="max-w-0 px-2 py-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-medium">{c.model_key}</span>
                        {c.kit ? <KitMark /> : null}
                      </span>
                      {/* A narrow panel: the product under the position, not a column of one letter. */}
                      {c.name ? (
                        <span className="block truncate text-[11px] text-muted-foreground @[34rem]:hidden" title={c.name}>
                          {c.name}
                          {showSource && c.source ? ` · ${sourceLabel(c.source)}` : ""}
                        </span>
                      ) : null}
                    </td>
                    <td className="hidden max-w-0 px-2 py-1 @[34rem]:table-cell" title={c.name}>
                      <span className="block truncate">{c.name ?? "—"}</span>
                      {showSource && c.source ? <span className="block truncate text-[10px] text-muted-foreground">{sourceLabel(c.source)}</span> : null}
                    </td>
                    <td className="py-1 pl-2 pr-3">
                      <span className="flex min-w-0 items-start gap-1.5">
                        <StatusDot tone={lv.tone} className="mt-1 flex-none" />
                        <span className="min-w-0 leading-snug">{lv.text}</span>
                        {c.review && !c.decided ? <span className="text-[var(--mf-amber)]" title="Проверить">●</span> : null}
                        {c.decided ? <span className="text-[10px] text-muted-foreground" title="Решение человека">✓</span> : null}
                      </span>
                    </td>
                  </>
                }
                detail={
                  <div className="flex flex-col gap-2 text-xs">
                    <div>
                      {c.name ? (
                        <>
                          Выбрано: <b>{c.name}</b>
                          {c.sku ? <span className="font-mono"> · {c.sku}</span> : null}
                          {c.url ? (
                            <a className="ml-1 underline" href={c.url} target="_blank" rel="noreferrer">
                              страница
                            </a>
                          ) : null}
                          {c.decided ? " · решение человека" : c.via === "article" ? " · по артикулу" : c.via === "model" ? " · по модели" : " · по семейству"}
                          {c.source ? <span className="text-muted-foreground"> · {sourceLabel(c.source)}</span> : null}
                        </>
                      ) : (
                        <span className="text-muted-foreground">В этом источнике подходящего товара не нашлось.</span>
                      )}
                    </div>
                    {canDecide && c.name ? (
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" className="h-7 px-2" disabled={busy} onClick={() => void decide(c, 1)}>
                          Тот же товар
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2" disabled={busy} onClick={() => void decide(c, 0.5)}>
                          Частично
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" disabled={busy} onClick={() => void decide(c, 0)}>
                          Не то
                        </Button>
                        {c.decided && c.decision_id ? (
                          <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy} onClick={() => void run("assortment_decision_revoke", { id: c.decision_id })}>
                            Вернуть автоматический
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    {canDecide && c.alternatives?.length ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Другие товары этой модели</span>
                        {c.alternatives.map((a) => (
                          <div key={`${a.global_id}|${a.sku}|${a.name}`} className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate" title={a.name}>
                              {a.name} <span className="font-mono text-muted-foreground">{a.sku}</span>
                              {a.kit ? " · набор" : ""}
                            </span>
                            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={busy} onClick={() => void decide(c, 1, a)}>
                              Выбрать
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                }
              />
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function Rows({ isOpen, onToggle, cells, detail }: { isOpen: boolean; onToggle: () => void; cells: React.ReactNode; detail: React.ReactNode }) {
  return (
    <>
      <tr className={cn("cursor-pointer border-b border-[var(--mf-line-200)] hover:bg-state-hover", isOpen && "bg-state-active")} onClick={onToggle} aria-expanded={isOpen}>
        {cells}
      </tr>
      {isOpen ? (
        <tr className="border-b border-[var(--mf-line-300)]">
          <td colSpan={4} className="bg-[var(--mf-paper)] p-2.5">
            {detail}
          </td>
        </tr>
      ) : null}
    </>
  );
}
