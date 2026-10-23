// «Ассортимент стран» (EP-107, ADR-051): national STIHL sites as sources. A person
// loads a country (a background job of Manifest, minutes) and applies the snapshot;
// the progress refreshes while a load runs. A country or an organisation's catalog opens
// one level deep with a sticky bar: the way back and its actions stay at hand.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { errorText, useStatus, useTool } from "../hooks";
import { countryName, formatDateTime } from "../labels";
import { Note } from "../RegistryList";
import { Badge, Progress } from "../manifest";
import { useOpenObject, useOpenPinned } from "../workspace/state";
import { CatalogDetail } from "./CatalogDetail";
import { assortmentChanged } from "./ChoiceTable";
import { useAssortmentChanged, type SourceCoverage } from "./Matching";
import { DeepView, GroupRow, KitMark, money, th, useDeep } from "./grid";

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

type Deep = { kind: "country" | "org"; id: string };

export function Countries({ focus = null }: { focus?: string | null }) {
  const { status } = useStatus();
  const tool = useTool();
  const [all, setAll] = useState<Source[] | null>(null);
  const [seg, setSeg] = useState<"countries" | "orgs">("countries");
  const sources = useMemo(() => (all ? all.filter((s) => s.kind === "stihl_country") : null), [all]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  // A country's assortment and an organisation's catalog open one level deep, with the
  // way back always at hand (not as a row unfolding into a long sheet).
  const [deep, go] = useDeep<Deep>(anchor);
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
  // A source asked for from elsewhere («Проверить в источниках»): its segment, opened.
  useEffect(() => {
    const src = focus && all?.find((x) => x.id === focus);
    if (!src) return;
    setSeg(src.company_id ? "orgs" : "countries");
    go({ kind: src.company_id ? "org" : "country", id: src.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per asked source
  }, [focus, all !== null]);
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
  const opened = deep ? (all ?? []).find((s) => s.id === deep.id) : undefined;
  const errorLine = error ? <p role="alert" className="px-3 py-2 text-xs text-destructive">{error}</p> : null;
  if (deep) {
    if (!opened) return <div ref={anchor}><Note>Загружаем источник…</Note></div>;
    return (
      <div ref={anchor}>
        {deep.kind === "country" ? (
          <CountryDetail source={opened} action={canManage ? <CountryAction source={opened} busy={busy} act={act} /> : null} onBack={() => go(null)}>
            {errorLine}
          </CountryDetail>
        ) : (
          <OrgDetail source={opened} canManage={canManage} onBack={() => go(null)} />
        )}
      </div>
    );
  }
  const segBtn = (k: "countries" | "orgs", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={seg === k}
      onClick={() => setSeg(k)}
      className={cn("whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px]", seg === k ? "border-foreground bg-foreground text-background" : "border-border hover:bg-state-hover")}
    >
      {label}
    </button>
  );
  return (
    <div ref={anchor} className="flex flex-col">
      <div className="mf-surface flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2" role="tablist" aria-label="Источники">
        {segBtn("countries", `Сайты STIHL стран${sources ? ` (${sources.filter((x) => x.current).length})` : ""}`)}
        {segBtn("orgs", `Каталоги организаций (${own.length})`)}
      </div>
      {errorLine}
      {seg === "orgs" ? (
        <OrgSources sources={own} onOpen={(id) => go({ kind: "org", id })} />
      ) : (
        <>
          <table className="w-full border-collapse bg-[var(--mf-surface)] text-xs">
            <thead className="sticky top-0 z-10 bg-[var(--mf-surface)] shadow-[inset_0_-1px_0_var(--mf-line-300)]">
              <tr>
                <th className={cn(th, "pl-3 text-left")}>Страна</th>
                <th className={cn(th, "text-right")} title="Моделей и товаров (вариантов с отдельным артикулом) на сайте STIHL страны">На сайте</th>
                <th className={cn(th, "hidden text-left @[34rem]:table-cell")}>Загружено</th>
                <th className={cn(th, "pr-3 text-right")} />
              </tr>
            </thead>
            <tbody>
              {(sources ?? []).map((s) => {
                const cur = s.current;
                const last = s.latest;
                const pending = pendingOf(s);
                return (
                  <tr
                    key={s.id}
                    className="cursor-pointer border-b border-[var(--mf-line-200)] align-top hover:bg-state-hover"
                    onClick={() => go({ kind: "country", id: s.id })}
                    title="Открыть ассортимент страны"
                  >
                    <td className="py-1.5 pl-3 pr-2">
                      <span className="font-medium">{countryName(s.country_code)}</span>
                      <span className="ml-1 text-muted-foreground">›</span>
                      {last?.status === "running" ? (
                        <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Progress className="w-20" parts={[{ tone: "info", value: last.pages_done }, { tone: "warning", value: Math.max(0, last.pages_total - last.pages_done) }]} />
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
                          <span className="@[30rem]:hidden">{cur.models} мод.</span>
                          <span className="hidden @[30rem]:inline">
                            {cur.models} {plural(cur.models, "модель", "модели", "моделей")}
                            <span className="text-muted-foreground"> · {cur.variants} тов.</span>
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">нет данных</span>
                      )}
                    </td>
                    <td className="hidden px-2 py-1.5 text-muted-foreground @[34rem]:table-cell">{cur?.applied_at ? formatDateTime(cur.applied_at) : "—"}</td>
                    <td className="py-1.5 pl-2 pr-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {canManage ? <CountryAction source={s} busy={busy} act={act} /> : null}
                    </td>
                  </tr>
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

/** A ready snapshot not applied yet. */
const pendingOf = (s: Source) => (s.latest && s.latest.status === "ready" && s.latest.id !== s.current?.id ? s.latest : null);

/** «Применить» a ready snapshot, else «Загрузить» / «Обновить» (not while a load runs). */
function CountryAction({ source, busy, act }: { source: Source; busy: string | null; act: (name: string, args: Record<string, unknown>, key: string) => Promise<void> }) {
  const pending = pendingOf(source);
  if (pending) {
    return (
      <Button size="sm" className="h-7 px-2" disabled={busy !== null} onClick={() => void act("assortment_apply", { id: pending.id }, source.id)}>
        Применить
      </Button>
    );
  }
  if (source.latest?.status === "running") return null;
  return (
    <Button size="sm" variant="outline" className="h-7 px-2" disabled={busy !== null} onClick={() => void act("assortment_refresh", { country: source.country_code }, source.id)}>
      {source.current ? "Обновить" : "Загрузить"}
    </Button>
  );
}

/** A country's STIHL site one level deep: its assortment by category. */
function CountryDetail({ source, action, onBack, children }: { source: Source; action: React.ReactNode; onBack: () => void; children?: React.ReactNode }) {
  const cur = source.current;
  const last = source.latest;
  return (
    <DeepView
      back="Сайты STIHL стран"
      onBack={onBack}
      title={countryName(source.country_code)}
      meta={
        <>
          {cur ? `сайт STIHL · загружено ${formatDateTime(cur.applied_at)}` : "ассортимент ещё не загружен"}
          {last?.status === "running" ? ` · идёт загрузка ${last.pages_done} из ${last.pages_total || "…"}` : ""}
          {pendingOf(source) ? " · готов новый снимок" : ""}
        </>
      }
      actions={action}
    >
      {children}
      {cur ? <CountryItems country={source.country_code} /> : <Note>Ассортимент страны ещё не загружен.</Note>}
    </DeepView>
  );
}

/**
 * Organisations' own catalogs (EP-112): a site read by the agent or a price list; a draft
 * already counts in the rating and waits for «Подтвердить» / «Отклонить» in its catalog.
 */
function OrgSources({ sources, onOpen }: { sources: Source[]; onOpen: (id: string) => void }) {
  const openPinned = useOpenPinned();
  const openObject = useOpenObject();
  const covs = useSourceCoverages();
  if (!sources.length) {
    return <Note>Каталогов организаций пока нет: загрузите прайс в карточке организации или попросите агента в её чате разобрать её сайт.</Note>;
  }
  const rows = [...sources].sort((a, b) => (covs.get(b.id)?.by_volume ?? -1) - (covs.get(a.id)?.by_volume ?? -1));
  return (
    <table className="w-full border-collapse bg-[var(--mf-surface)] text-xs">
      <thead className="sticky top-0 z-10 bg-[var(--mf-surface)] shadow-[inset_0_-1px_0_var(--mf-line-300)]">
        <tr>
          <th className={cn(th, "pl-3 text-left")}>Организация</th>
          <th className={cn(th, "hidden text-left @[34rem]:table-cell")}>Источник</th>
          <th className={cn(th, "text-right")}>Покрытие</th>
          <th className={cn(th, "pr-3 text-right")} />
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => {
          const cur = s.current;
          const draft = !!cur && !cur.confirmed_at;
          const cov = covs.get(s.id);
          const name = sourceName(s);
          const ref = s.company_id ? { kind: "company" as const, id: s.company_id, title: name } : null;
          return (
            <tr
              key={s.id}
              className={cn("border-b border-[var(--mf-line-200)] align-top", cur && "cursor-pointer hover:bg-state-hover")}
              onClick={() => cur && onOpen(s.id)}
            >
              <td className="max-w-0 py-1.5 pl-3 pr-2">
                <span className="block truncate font-medium" title={name}>{name}</span>
                <span className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                  {draft ? <Badge tone="warn">черновик</Badge> : null}
                  {countryName(s.country_code)} · {cur ? `${cur.products} тов.` : "нет снимка"}
                </span>
              </td>
              <td className="hidden max-w-0 truncate px-2 py-1.5 text-muted-foreground @[34rem]:table-cell" title={s.base_url}>
                {s.kind === "pricelist" ? "прайс" : "сайт"}
                {s.base_url ? ` · ${s.base_url.replace(/^https?:\/\//, "")}` : ""}
              </td>
              <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{cov ? `${Math.round(cov.by_volume)}%` : "—"}</td>
              <td className="py-1.5 pl-2 pr-3 text-right" onClick={(e) => e.stopPropagation()}>
                <span className="flex flex-wrap justify-end gap-1">
                  {ref ? (
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { if (!openPinned(ref)) void openObject(ref); }}>
                      Рядом
                    </Button>
                  ) : null}
                  {cur ? (
                    <Button size="sm" variant="outline" className={cn("h-7 px-2", draft && "border-[var(--mf-amber)]")} onClick={() => onOpen(s.id)}>
                      {draft ? "Проверить" : "Состав"}
                    </Button>
                  ) : null}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const sourceName = (s: Source) => s.title.replace(/^(Сайт|Прайс) · /, "");

/** The rating of every source by its id; reloads after a decision. */
function useSourceCoverages(): Map<string, SourceCoverage> {
  const tool = useTool();
  const [covs, setCovs] = useState<Map<string, SourceCoverage>>(new Map());
  const load = useCallback(() => {
    tool<{ sources?: SourceCoverage[] }>("assortment_coverage", {}).then(
      (r) => setCovs(new Map((r.sources ?? []).map((x) => [x.source_id, x]))),
      () => setCovs(new Map()),
    );
  }, [tool]);
  useEffect(load, [load]);
  useAssortmentChanged(load);
  return covs;
}

/**
 * An organisation's catalog one level deep: what it gives the sheet and what it has beyond
 * it. A draft is confirmed or rejected here — the buttons stay in the sticky bar.
 */
function OrgDetail({ source, canManage, onBack }: { source: Source; canManage: boolean; onBack: () => void }) {
  const tool = useTool();
  const openPinned = useOpenPinned();
  const openObject = useOpenObject();
  const covs = useSourceCoverages();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cur = source.current;
  const draft = !!cur && !cur.confirmed_at;
  const cov = covs.get(source.id);
  const name = sourceName(source);
  const ref = source.company_id ? { kind: "company" as const, id: source.company_id, title: name } : null;
  const decide = async (what: "assortment_confirm" | "assortment_discard") => {
    if (!cur) return;
    setBusy(true);
    setError(null);
    try {
      await tool(what, { id: cur.id });
      assortmentChanged();
      if (what === "assortment_discard") onBack(); // the draft is gone: back to the list
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DeepView
      back="Каталоги организаций"
      onBack={onBack}
      title={
        <>
          <span className="min-w-0 truncate" title={name}>{name}</span>
          {draft ? <Badge tone="warn">черновик</Badge> : null}
        </>
      }
      meta={
        <>
          {countryName(source.country_code)} · {source.kind === "pricelist" ? "прайс" : "сайт"}
          {source.base_url ? (
            <>
              {" · "}
              <a href={source.base_url} target="_blank" rel="noreferrer" className="hover:underline">
                {source.base_url.replace(/^https?:\/\//, "")}
              </a>
            </>
          ) : null}
          {cur ? ` · ${cur.products} тов.` : ""}
          {cov ? ` · покрытие ${Math.round(cov.by_volume)}%` : ""}
          {draft ? <span className="hidden @[30rem]:block">Черновик уже в рейтинге: проверьте состав и подтвердите или отклоните.</span> : null}
          {error ? <span role="alert" className="block text-destructive">{error}</span> : null}
        </>
      }
      actions={
        <>
          {ref ? (
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { if (!openPinned(ref)) void openObject(ref); }}>
              Рядом
            </Button>
          ) : null}
          {draft && canManage ? (
            <>
              <Button size="sm" className="h-7 px-2" disabled={busy} onClick={() => void decide("assortment_confirm")}>
                Подтвердить
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={busy} onClick={() => void decide("assortment_discard")}>
                Отклонить
              </Button>
            </>
          ) : null}
        </>
      }
    >
      {cur ? <CatalogDetail d={{ source_id: source.id, snapshot_id: cur.id }} canDecide={canManage} /> : <Note>У источника нет снимка.</Note>}
    </DeepView>
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
          <thead className="sticky top-[var(--mf-sticky,0px)] z-10 bg-[var(--mf-surface)] shadow-[inset_0_-1px_0_var(--mf-line-300)]">
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
