// «Ассортимент стран» (EP-107, ADR-051): national STIHL sites as sources. A person
// loads a country (a background job of Manifest, minutes) and applies the snapshot;
// the progress refreshes while a load runs. A country row opens its assortment.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { errorText, useStatus, useTool } from "../hooks";
import { countryName, formatDateTime } from "../labels";
import { Note } from "../RegistryList";
import { Badge, Progress } from "../manifest";

interface Snapshot {
  id: string;
  status: "running" | "ready" | "applied" | "failed" | "superseded" | "discarded";
  pages_total: number;
  pages_done: number;
  pages_failed: number;
  products: number;
  variants: number;
  models: number;
  error: string;
  started_at: string;
  finished_at: string | null;
  applied_at: string | null;
}
interface Source {
  id: string;
  kind: string;
  country_code: string;
  title: string;
  base_url: string;
  current: Snapshot | null;
  latest: Snapshot | null;
}
interface Item {
  global_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  model_key: string;
  kit: boolean;
  price: number | null;
  currency: string;
  url: string;
}

const th = "py-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

export function Countries() {
  const { status } = useStatus();
  const tool = useTool();
  const [sources, setSources] = useState<Source[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => {
    tool<{ items: Source[] }>("assortment_sources", {}).then(
      (r) => {
        setSources((r.items ?? []).filter((s) => s.kind === "stihl_country"));
        setError(null);
      },
      (e: unknown) => setError(errorText(e)),
    );
  }, [tool]);
  useEffect(load, [load]);
  const running = sources?.some((s) => s.latest?.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load, running]);
  const act = async (name: string, args: Record<string, unknown>, key: string) => {
    setBusy(key);
    setError(null);
    try {
      await tool(name, args);
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  if (!status?.canAssortment) return <Note>Ассортимент стран появится после обновления Manifest.</Note>;
  const canManage = !!status.canManage;
  return (
    <div className="flex flex-col">
      {error ? <p role="alert" className="px-3 py-2 text-xs text-destructive">{error}</p> : null}
      <table className="w-full border-collapse bg-[var(--mf-surface)] text-xs">
        <thead className="sticky top-0 z-10 bg-[var(--mf-surface)] shadow-[inset_0_-1px_0_var(--mf-line-300)]">
          <tr>
            <th className={cn(th, "pl-3 text-left")}>Страна</th>
            <th className={cn(th, "text-right")}>Моделей</th>
            <th className={cn(th, "hidden text-left @[26rem]:table-cell")}>Снимок</th>
            <th className={cn(th, "pr-3 text-right")} />
          </tr>
        </thead>
        <tbody>
          {(sources ?? []).map((s) => {
            const cur = s.current;
            const last = s.latest;
            const isOpen = open === s.country_code;
            const pending = last && last.status === "ready" && last.id !== cur?.id ? last : null;
            return (
              <CountryRows key={s.id} source={s} isOpen={isOpen} onToggle={() => setOpen(isOpen ? null : s.country_code)}>
                <td className="py-1.5 pl-3 pr-2">
                  <span className="font-medium">{countryName(s.country_code)}</span>
                  {last?.status === "running" ? (
                    <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Progress className="w-24" parts={[{ tone: "info", value: last.pages_done }, { tone: "warning", value: Math.max(0, last.pages_total - last.pages_done) }]} />
                      {last.pages_total ? `${last.pages_done} из ${last.pages_total}` : "карта сайта…"}
                    </span>
                  ) : null}
                  {last?.status === "failed" ? <span className="block text-[11px] text-destructive">{last.error}</span> : null}
                  {pending ? (
                    <span className="block text-[11px] text-[var(--mf-amber)]">
                      готов новый снимок: {pending.models} моделей, {pending.variants} вар.{pending.pages_failed ? `, ошибок ${pending.pages_failed}` : ""}
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{cur ? cur.models : <span className="text-muted-foreground">нет данных</span>}</td>
                <td className="hidden px-2 py-1.5 text-muted-foreground @[26rem]:table-cell">{cur?.applied_at ? formatDateTime(cur.applied_at) : "—"}</td>
                <td className="py-1.5 pl-2 pr-3 text-right" onClick={(e) => e.stopPropagation()}>
                  {canManage && pending ? (
                    <Button size="sm" className="h-7 px-2" disabled={busy !== null} onClick={() => void act("assortment_apply", { id: pending.id }, s.id)}>
                      Применить
                    </Button>
                  ) : canManage && last?.status !== "running" ? (
                    <Button size="sm" variant="outline" className="h-7 px-2" disabled={busy !== null} onClick={() => void act("assortment_refresh", { country: s.country_code }, s.id)}>
                      {cur ? "Обновить" : "Загрузить"}
                    </Button>
                  ) : null}
                </td>
              </CountryRows>
            );
          })}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[11px] text-muted-foreground">
        Сайт STIHL на общей платформе есть не во всех странах: для остальных ассортимент даст прайс или сайт дистрибьютора.
      </p>
    </div>
  );
}

function CountryRows({ source, isOpen, onToggle, children }: { source: Source; isOpen: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <>
      <tr className={cn("cursor-pointer border-b border-[var(--mf-line-200)] align-top hover:bg-state-hover", isOpen && "bg-state-active")} onClick={onToggle} aria-expanded={isOpen}>
        {children}
      </tr>
      {isOpen ? (
        <tr className="border-b border-[var(--mf-line-300)]">
          <td colSpan={4} className="bg-[var(--mf-paper)] p-0">
            {source.current ? <CountryItems country={source.country_code} /> : <Note>Ассортимент страны ещё не загружен.</Note>}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function CountryItems({ country }: { country: string }) {
  const tool = useTool();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      tool<{ items: Item[] }>("assortment_items", { country, q: q || undefined, limit: 500 }).then(
        (r) => setItems(r.items ?? []),
        () => setItems([]),
      );
    }, 250);
    return () => clearTimeout(t);
  }, [country, q, tool]);
  return (
    <div className="flex flex-col gap-1 p-2">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Модель, артикул…" aria-label={`Поиск по ассортименту ${country}`} className="h-7 text-xs" />
      <table className="w-full border-collapse text-[11px]">
        <tbody>
          {(items ?? []).map((it) => (
            <tr key={`${it.global_id}-${it.sku}`} className="border-b border-[var(--mf-line-200)]">
              <td className="max-w-0 py-0.5 pr-2">
                <a href={it.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1.5 hover:underline" title={it.variant_name || it.product_name}>
                  <span className="truncate font-medium">{it.model_key || it.variant_name || it.product_name}</span>
                  {it.kit ? <Badge tone="info">набор</Badge> : null}
                </a>
              </td>
              <td className="hidden py-0.5 pr-2 font-mono text-muted-foreground @[22rem]:table-cell">{it.sku}</td>
              <td className="py-0.5 text-right tabular-nums text-muted-foreground">
                {it.price !== null ? `${Math.round(it.price).toLocaleString("ru-RU")} ${it.currency}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items && items.length === 0 ? <Note>Ничего не найдено.</Note> : null}
    </div>
  );
}
