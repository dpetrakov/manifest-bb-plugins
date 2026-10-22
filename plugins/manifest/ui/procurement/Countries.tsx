// «Ассортимент стран» (EP-107, ADR-051): national STIHL sites as sources. A person
// loads a country (a background job of Manifest, minutes) and applies the snapshot;
// the progress refreshes while a load runs. A country row opens its assortment.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { errorText, useStatus, useTool } from "../hooks";
import { countryName, formatDateTime } from "../labels";
import { Note } from "../RegistryList";
import { Badge, Progress } from "../manifest";
import { useOpenObject, useOpenPinned } from "../workspace/state";
import { CatalogDetail } from "./CatalogDetail";
import { useAssortmentChanged, type SourceCoverage } from "./Matching";
import { GroupRow, KitMark, money, th } from "./grid";

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
  confirmed_at?: string | null;
}
interface Source {
  id: string;
  kind: string;
  country_code: string;
  title: string;
  base_url: string;
  company_id?: string | null;
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
  category?: string; // Manifest before the field: the list is flat
}

const plural = (n: number, one: string, few: string, many: string) => {
  const t = n % 100;
  const u = n % 10;
  return t >= 11 && t <= 14 ? many : u === 1 ? one : u >= 2 && u <= 4 ? few : many;
};

export function Countries({ focus = null }: { focus?: string | null }) {
  const { status } = useStatus();
  const tool = useTool();
  const [all, setAll] = useState<Source[] | null>(null);
  const [seg, setSeg] = useState<"countries" | "orgs">("countries");
  const sources = useMemo(() => (all ? all.filter((s) => s.kind === "stihl_country") : null), [all]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => {
    tool<{ items: Source[] }>("assortment_sources", {}).then(
      (r) => {
        setAll(r.items ?? []);
        setError(null);
      },
      (e: unknown) => setError(errorText(e)),
    );
  }, [tool]);
  useEffect(load, [load]);
  useAssortmentChanged(load);
  // A source asked for from elsewhere: its segment, and a country's row open.
  useEffect(() => {
    const src = focus && all?.find((x) => x.id === focus);
    if (!src) return;
    if (src.company_id) setSeg("orgs");
    else {
      setSeg("countries");
      setOpen(src.country_code);
    }
  }, [focus, all]);
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
  if (!status?.canAssortment) return <Note>Источники появятся после обновления Manifest.</Note>;
  const canManage = !!status.canManage;
  const own = (all ?? []).filter((s) => s.company_id && (s.current || s.latest));
  const segBtn = (k: "countries" | "orgs", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={seg === k}
      onClick={() => setSeg(k)}
      className={cn("rounded-md border px-2 py-0.5 text-[11px]", seg === k ? "border-foreground bg-foreground text-background" : "border-border hover:bg-state-hover")}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-col">
      <div className="mf-surface flex items-center gap-1.5 border-b border-border px-3 py-2" role="tablist" aria-label="Источники">
        {segBtn("countries", `Сайты STIHL стран${sources ? ` (${sources.filter((x) => x.current).length})` : ""}`)}
        {segBtn("orgs", `Каталоги организаций (${own.length})`)}
      </div>
      {error ? <p role="alert" className="px-3 py-2 text-xs text-destructive">{error}</p> : null}
      {seg === "orgs" ? <OrgSources sources={own} canManage={canManage} focus={focus} /> : (
      <>
      <table className="w-full border-collapse bg-[var(--mf-surface)] text-xs">
        <thead className="sticky top-0 z-10 bg-[var(--mf-surface)] shadow-[inset_0_-1px_0_var(--mf-line-300)]">
          <tr>
            <th className={cn(th, "pl-3 text-left")}>Страна</th>
            <th className={cn(th, "text-right")} title="Моделей и товаров (вариантов с отдельным артикулом) на сайте STIHL страны">На сайте</th>
            <th className={cn(th, "hidden text-left @[26rem]:table-cell")}>Загружено</th>
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
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                  {cur ? (
                    <>
                      {cur.models} {plural(cur.models, "модель", "модели", "моделей")}
                      <span className="text-muted-foreground"> · {cur.variants} тов.</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">нет данных</span>
                  )}
                </td>
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
      </>
      )}
    </div>
  );
}

/**
 * Organisations' own catalogs (EP-112): a site read by the agent or a price list; a draft
 * already counts in the rating and waits for «Подтвердить» / «Отклонить».
 */
function OrgSources({ sources, canManage, focus }: { sources: Source[]; canManage: boolean; focus: string | null }) {
  const tool = useTool();
  const openPinned = useOpenPinned();
  const openObject = useOpenObject();
  const [covs, setCovs] = useState<Map<string, SourceCoverage>>(new Map());
  const [open, setOpen] = useState<string | null>(focus);
  // Asked for from elsewhere («Проверить в источниках»): open it and bring it into view.
  useEffect(() => {
    if (!focus) return;
    setOpen(focus);
    const t = setTimeout(() => document.getElementById(`mf-source-${focus}`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 50);
    return () => clearTimeout(t);
  }, [focus]);
  const loadCovs = useCallback(() => {
    tool<{ sources?: SourceCoverage[] }>("assortment_coverage", {}).then(
      (r) => setCovs(new Map((r.sources ?? []).map((x) => [x.source_id, x]))),
      () => setCovs(new Map()),
    );
  }, [tool]);
  useEffect(loadCovs, [loadCovs]);
  useAssortmentChanged(loadCovs);
  if (!sources.length) {
    return <Note>Каталогов организаций пока нет: загрузите прайс в карточке организации или попросите агента в её чате разобрать её сайт.</Note>;
  }
  const rows = [...sources].sort((a, b) => (covs.get(b.id)?.by_volume ?? -1) - (covs.get(a.id)?.by_volume ?? -1));
  return (
    <>
      <table className="w-full border-collapse bg-[var(--mf-surface)] text-xs">
        <thead className="sticky top-0 z-10 bg-[var(--mf-surface)] shadow-[inset_0_-1px_0_var(--mf-line-300)]">
          <tr>
            <th className={cn(th, "pl-3 text-left")}>Организация</th>
            <th className={cn(th, "hidden text-left @[26rem]:table-cell")}>Источник</th>
            <th className={cn(th, "text-right")}>Покрытие</th>
            <th className={cn(th, "pr-3 text-right")} />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const cur = s.current;
            const draft = !!cur && !cur.confirmed_at;
            const cov = covs.get(s.id);
            const isOpen = open === s.id;
            const name = s.title.replace(/^(Сайт|Прайс) · /, "");
            const ref = s.company_id ? { kind: "company" as const, id: s.company_id, title: name } : null;
            return (
              <Fragment key={s.id}>
                <tr id={`mf-source-${s.id}`} className={cn("cursor-pointer border-b border-[var(--mf-line-200)] align-top hover:bg-state-hover", isOpen && "bg-state-active")} onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen}>
                  <td className="max-w-0 py-1.5 pl-3 pr-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium" title={name}>{name}</span>
                      {draft ? <Badge tone="warn">черновик</Badge> : null}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {countryName(s.country_code)} · {cur ? `${cur.products} тов.` : "нет снимка"}
                    </span>
                  </td>
                  <td className="hidden max-w-0 truncate px-2 py-1.5 text-muted-foreground @[26rem]:table-cell" title={s.base_url}>
                    {s.kind === "pricelist" ? "прайс" : "сайт"}
                    {s.base_url ? ` · ${s.base_url.replace(/^https?:\/\//, "")}` : ""}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{cov ? `${Math.round(cov.by_volume)}%` : "—"}</td>
                  <td className="py-1.5 pl-2 pr-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <span className="flex justify-end gap-1">
                      {ref ? (
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { if (!openPinned(ref)) void openObject(ref); }}>
                          Рядом
                        </Button>
                      ) : null}
                      {cur ? (
                        <Button
                          size="sm"
                          variant={isOpen ? "secondary" : "outline"}
                          className={cn("h-7 px-2", draft && !isOpen && "border-[var(--mf-amber)]")}
                          onClick={() => setOpen(isOpen ? null : s.id)}
                          aria-expanded={isOpen}
                        >
                          {isOpen ? "Свернуть" : draft ? "Проверить" : "Состав"}
                        </Button>
                      ) : null}
                    </span>
                  </td>
                </tr>
                {isOpen && cur ? (
                  <tr className="border-b border-[var(--mf-line-300)]">
                    <td colSpan={4} className="bg-[var(--mf-paper)] p-0">
                      <CatalogDetail d={{ source_id: s.id, snapshot_id: cur.id }} draft={draft} canDecide={canManage} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </>
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

/** Country products grouped like the sheet: by category, model order inside a group. */
function byCategory(items: Item[]): { category: string; items: Item[] }[] | null {
  if (!items.some((it) => it.category)) return null;
  const groups = new Map<string, Item[]>();
  for (const it of items) {
    const k = it.category || "Принадлежности";
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  // Accessories go last: the sheet is about machines, batteries and chargers.
  const rank = (c: string) => (c === "Принадлежности" ? 1 : 0);
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, "ru"))
    .map(([category, list]) => ({ category, items: list }));
}

function CountryItems({ country, snapshotId }: { country?: string; snapshotId?: string }) {
  const tool = useTool();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const call = snapshotId
        ? tool<{ items: Item[] }>("assortment_snapshot_items", { id: snapshotId, q: q || undefined, limit: 3000 })
        : tool<{ items: Item[] }>("assortment_items", { country, q: q || undefined, limit: 1000 });
      call.then(
        (r) => setItems(r.items ?? []),
        () => setItems([]),
      );
    }, 250);
    return () => clearTimeout(t);
  }, [country, snapshotId, q, tool]);
  const groups = useMemo(() => (items ? byCategory(items) : null), [items]);
  const models = useMemo(() => new Set((items ?? []).map((it) => it.model_key).filter(Boolean)).size, [items]);
  const row = (it: Item) => {
    const name = it.variant_name || it.product_name;
    return (
      <tr key={`${it.global_id}-${it.sku}`} className="border-b border-[var(--mf-line-200)] hover:bg-state-hover">
        <td className="max-w-0 py-1 pl-3 pr-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium" title={name}>
              {it.model_key || <span className="font-normal">{name}</span>}
            </span>
            {it.kit ? <KitMark /> : null}
          </span>
        </td>
        <td className="hidden max-w-0 px-2 py-1 @[30rem]:table-cell">
          <a href={it.url} target="_blank" rel="noreferrer" className="block truncate text-muted-foreground hover:text-foreground hover:underline" title={name}>
            {name}
          </a>
        </td>
        <td className="hidden whitespace-nowrap px-2 py-1 font-mono text-[11px] text-muted-foreground @[22rem]:table-cell">{it.sku || "—"}</td>
        <td className="whitespace-nowrap py-1 pl-2 pr-3 text-right tabular-nums text-muted-foreground">{money(it.price, it.currency)}</td>
      </tr>
    );
  };
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Модель, название, артикул…" aria-label={`Поиск по ассортименту ${country}`} className="h-7 min-w-[9rem] flex-1 text-xs" />
        <span className="text-muted-foreground">{items ? `${models} ${plural(models, "модель", "модели", "моделей")} · ${items.length} тов.` : "…"}</span>
      </div>
      {items && items.length ? (
        <table className="w-full table-fixed border-collapse bg-[var(--mf-surface)] text-xs">
          <thead className="shadow-[inset_0_-1px_0_var(--mf-line-300)]">
            <tr>
              <th className={cn(th, "pl-3 text-left")}>Модель</th>
              <th className={cn(th, "hidden text-left @[30rem]:table-cell")}>Название на сайте</th>
              <th className={cn(th, "hidden w-[7.5rem] text-left @[22rem]:table-cell")}>Артикул</th>
              <th className={cn(th, "w-24 pr-3 text-right")}>Цена</th>
            </tr>
          </thead>
          <tbody>
            {groups
              ? groups.map((g) => (
                  <GroupRows key={g.category} title={g.category} count={g.items.length}>
                    {g.items.map(row)}
                  </GroupRows>
                ))
              : items.map(row)}
          </tbody>
        </table>
      ) : null}
      {items && items.length === 0 ? <Note>Ничего не найдено.</Note> : null}
    </div>
  );
}

function GroupRows({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <>
      <GroupRow colSpan={4} title={title} note={`${count} тов.`} />
      {children}
    </>
  );
}
