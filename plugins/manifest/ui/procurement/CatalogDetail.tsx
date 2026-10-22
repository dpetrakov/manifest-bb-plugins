// The contents of an organisation's catalog in «Источники» (EP-112): what it gives the
// sheet (the matching, with decisions) and what it has beyond the sheet. A draft is
// confirmed or rejected in the sticky bar of this view — and only there: elsewhere a draft
// links to this place.
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { errorText, useTool } from "../hooks";
import { Note } from "../RegistryList";
import { ChoiceTable, type ChoiceRow } from "./ChoiceTable";
import { money, th } from "./grid";
import { useAssortmentChanged } from "./Matching";

interface Item {
  product_name: string;
  variant_name: string;
  sku: string;
  model_key: string;
  kit: boolean;
  price: number | null;
  currency: string;
  url: string;
}

/** What a draft gave the sheet (positions it covers) and what it has beyond the sheet. */
export function CatalogDetail({ d, canDecide }: { d: { source_id: string; snapshot_id: string }; canDecide: boolean }) {
  const tool = useTool();
  const [rows, setRows] = useState<ChoiceRow[] | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    Promise.all([
      tool<{ items: ChoiceRow[] }>("assortment_source_choices", { source_id: d.source_id }),
      tool<{ items: Item[] }>("assortment_snapshot_items", { id: d.snapshot_id, limit: 3000 }),
    ]).then(
      ([c, i]) => {
        setRows(c.items ?? []);
        setItems(i.items ?? []);
      },
      (e: unknown) => setError(errorText(e)),
    );
  }, [d.source_id, d.snapshot_id, tool]);
  useEffect(load, [load]);
  useAssortmentChanged(load);
  if (error && !rows) return <Note>Не удалось загрузить: {error}</Note>;
  if (!rows || !items) return <Note>Загружаем каталог…</Note>;
  const matched = rows.filter((r) => r.level > 0 || r.decided);
  const used = new Set(matched.map((r) => (r.name ?? "").toLowerCase()));
  const rest = items.filter((it) => !used.has((it.variant_name || it.product_name).toLowerCase()));
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-2 px-3 pt-2 text-xs">
        <b>Совпало с листом</b>
        <span className="tabular-nums text-muted-foreground">{matched.length}</span>
      </div>
      {matched.length ? (
        <ChoiceTable rows={matched} canDecide={canDecide} productLabel="Товар каталога" />
      ) : (
        <p className="px-3 py-2 text-xs text-muted-foreground">Ни одна позиция листа не нашлась в каталоге.</p>
      )}
      <div className="flex items-baseline gap-2 px-3 pt-3 text-xs">
        <b>Нет в листе</b>
        <span className="tabular-nums text-muted-foreground">{rest.length}</span>
        <span className="text-[11px] text-muted-foreground">товары каталога, которые листу не нужны или не распознаны</span>
      </div>
      {rest.length ? (
        <table className="mb-2 w-full table-fixed border-collapse bg-[var(--mf-surface)] text-xs">
          <thead className="sticky top-[var(--mf-sticky,0px)] z-10 bg-[var(--mf-surface)] shadow-[inset_0_-1px_0_var(--mf-line-300)]">
            <tr>
              <th className={cn(th, "pl-3 text-left")}>Товар</th>
              <th className={cn(th, "hidden w-[7.5rem] text-left @[26rem]:table-cell")}>Модель</th>
              <th className={cn(th, "w-24 pr-3 text-right")}>Цена</th>
            </tr>
          </thead>
          <tbody>
            {rest.map((it, i) => {
              const name = it.variant_name || it.product_name;
              return (
                <tr key={`${name}-${i}`} className="border-t border-[var(--mf-line-200)]">
                  <td className="max-w-0 py-1 pl-3 pr-2">
                    {it.url ? (
                      <a href={it.url} target="_blank" rel="noreferrer" className="block truncate hover:underline" title={name}>
                        {name}
                      </a>
                    ) : (
                      <span className="block truncate" title={name}>{name}</span>
                    )}
                  </td>
                  <td className="hidden truncate px-2 py-1 text-muted-foreground @[26rem]:table-cell">{it.model_key || "не распознана"}</td>
                  <td className="py-1 pl-2 pr-3 text-right tabular-nums text-muted-foreground">{money(it.price, it.currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
