// «Покрытие» (EP-108, EP-110, README §6г): where the procurement sheet is covered — a map
// of countries and organisations, a country or an organisation to pick, and the matching
// with one of its sources: the country's STIHL site or an organisation's own catalog (a
// draft counts at once and is confirmed or rejected here). Decisions on products are made
// in the table; doubtful choices of all sources are gathered in «Проверить».
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errorText, useStatus, useTool } from "../hooks";
import { countryName } from "../labels";
import { Note } from "../RegistryList";
import { Badge } from "../manifest";
import { useOpenObject, useOpenPinned } from "../workspace/state";
import { CountryLookup, CoverageMap, describe, type Cluster, type MapCountry } from "../map/CoverageMap";
import { ASSORTMENT_CHANGED, ChoiceTable, sourceLabel, type ChoiceRow, type SourceInfo } from "./ChoiceTable";
import { useOpenSource } from "./nav";

export interface CountryCoverage {
  country: string;
  by_volume: number;
  by_positions: number;
  full: number;
  partial: number;
  none: number;
  unchecked: number;
  positions: number;
}
/** The best organisation working in a country (assortment_coverage.served). */
interface ServedCoverage {
  country: string;
  by_volume: number;
  by_positions: number;
  company_id: string;
  company_name: string;
  source_kind: string;
  source_country: string;
  draft: boolean;
}

/** The rating of one source (assortment_coverage.sources). */
export interface SourceCoverage extends SourceInfo {
  by_volume: number;
  by_positions: number;
  full: number;
  partial: number;
  none: number;
  unchecked: number;
  positions: number;
}
interface SourceRow {
  kind: string;
  country_code: string | null;
  company_id: string | null;
  current: { id: string; confirmed_at?: string | null } | null;
}
interface Facets {
  countries?: { value: string; count: number }[];
}

/** Reloads on a decision or a draft changed anywhere in the panel. */
export function useAssortmentChanged(reload: () => void) {
  useEffect(() => {
    window.addEventListener(ASSORTMENT_CHANGED, reload);
    return () => window.removeEventListener(ASSORTMENT_CHANGED, reload);
  }, [reload]);
}

export function Matching() {
  const { status } = useStatus();
  const tool = useTool();
  const [covs, setCovs] = useState<CountryCoverage[] | null>(null);
  const [srcCovs, setSrcCovs] = useState<SourceCoverage[]>([]);
  const [served, setServed] = useState<ServedCoverage[]>([]);
  const [country, setCountry] = useState<string>("");
  const [sourceId, setSourceId] = useState<string>("");
  const [rows, setRows] = useState<ChoiceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [facets, setFacets] = useState<Facets>({});
  useEffect(() => {
    tool<{ items: SourceRow[] }>("assortment_sources", {}).then((r) => setSources(r.items ?? []), () => setSources([]));
    tool<Facets>("outreach_facets", {}).then(setFacets, () => setFacets({}));
  }, [tool]);
  const loadCovs = useCallback(() => {
    tool<{ items: CountryCoverage[]; sources?: SourceCoverage[]; served?: ServedCoverage[] }>("assortment_coverage", {}).then(
      (r) => {
        setCovs(r.items ?? []);
        setSrcCovs(r.sources ?? []);
        setServed(r.served ?? []);
        setCountry((c) => c || r.items?.[0]?.country || "");
        setError(null);
      },
      (e: unknown) => setError(errorText(e)),
    );
  }, [tool]);
  useEffect(loadCovs, [loadCovs]);
  const [orgs, setOrgs] = useState<{ items: OrgRow[]; total: number } | null>(null);
  const [orgsError, setOrgsError] = useState<string | null>(null);
  const [orgsTry, setOrgsTry] = useState(0);
  useEffect(() => {
    setOrgs(null);
    setOrgsError(null);
    if (!country) return;
    let live = true;
    tool<{ items: OrgRow[]; total: number }>("outreach_list_companies", { country, limit: 50 }).then(
      (r) => live && setOrgs({ items: r.items ?? [], total: r.total ?? 0 }),
      // A failed call is not «no organisations»: say so and let the person retry.
      (e: unknown) => live && setOrgsError(errorText(e)),
    );
    return () => {
      live = false;
    };
  }, [country, tool, orgsTry]);
  // The sources of the selected country: its STIHL site, the own catalogs of the
  // organisations serving it (their main country or a coverage country), and the STIHL
  // sites of other countries those organisations are rated by (a distributor of South
  // Africa serves Zambia with the assortment of South Africa).
  const here = useMemo(() => {
    const items = orgs?.items ?? [];
    const ids = new Set(items.map((o) => o.id));
    const via = new Set(items.filter((o) => o.coverage && (o.coverage.by ?? "stihl_country") === "stihl_country").map((o) => o.coverage!.country));
    const site = srcCovs.filter((x) => x.source_kind === "stihl_country" && x.country === country);
    const own = srcCovs.filter((x) => x.source_kind !== "stihl_country" && (x.country === country || (x.company_id && ids.has(x.company_id))));
    const other = srcCovs.filter((x) => x.source_kind === "stihl_country" && x.country !== country && via.has(x.country));
    return [...site, ...own, ...other];
  }, [srcCovs, orgs, country]);
  useEffect(() => {
    setSourceId((cur) => (here.some((x) => x.source_id === cur) ? cur : here[0]?.source_id ?? ""));
  }, [here]);
  const loadRows = useCallback(() => {
    setRows(null);
    if (!sourceId) return;
    tool<{ items: ChoiceRow[] }>("assortment_source_choices", { source_id: sourceId }).then(
      (r) => setRows(r.items ?? []),
      (e: unknown) => setError(errorText(e)),
    );
  }, [sourceId, tool]);
  useEffect(loadRows, [loadRows]);
  const reload = useCallback(() => {
    loadCovs();
    loadRows();
  }, [loadCovs, loadRows]);
  useAssortmentChanged(reload);
  const mapCountries = useMemo(() => mergeCountries(covs ?? [], srcCovs, served, sources, facets), [covs, srcCovs, served, sources, facets]);
  const cluster = useMemo(() => clusterOf(country, orgs?.items ?? [], mapCountries), [country, orgs, mapCountries]);
  const ownByCompany = useMemo(() => {
    const m = new Map<string, SourceCoverage>();
    for (const x of srcCovs) if (x.company_id && (!m.has(x.company_id) || x.by_volume > m.get(x.company_id)!.by_volume)) m.set(x.company_id, x);
    return m;
  }, [srcCovs]);
  if (!status?.canAssortment) return <Note>Покрытие появится после обновления Manifest.</Note>;
  if (covs && covs.length === 0 && srcCovs.length === 0) return <Note>Нет загруженных источников: загрузите ассортимент во вкладке «Источники».</Note>;
  const canDecide = !!status.canManage;
  const selected = here.find((x) => x.source_id === sourceId);
  return (
    <div className="flex flex-col">
      <CoverageMap countries={mapCountries} selected={country} cluster={cluster} onSelect={setCountry} />
      <div className="mf-surface flex flex-wrap items-start gap-2 border-y border-border px-3 py-2">
        <div className="w-44 flex-none">
          <CountryLookup countries={mapCountries} selected={country} onSelect={setCountry} />
        </div>
        {country ? (
          orgsError ? (
            <span className="flex-1 py-1 text-[11px] text-destructive">
              Не удалось загрузить организации: {orgsError}{" "}
              <button type="button" className="underline" onClick={() => setOrgsTry((n) => n + 1)}>
                Повторить
              </button>
            </span>
          ) : (
            <CountryCompanies country={country} orgs={orgs} own={ownByCompany} onMatch={(id) => setSourceId(id)} />
          )
        ) : (
          <span className="flex-1" />
        )}
      </div>
      {error ? <p role="alert" className="px-3 py-2 text-xs text-destructive">{error}</p> : null}
      {here.length ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2 text-xs" role="tablist" aria-label="Сверка по источнику">
            <span className="text-muted-foreground">Сверка по:</span>
            {here.map((x) => (
              <button
                key={x.source_id}
                type="button"
                role="tab"
                aria-selected={x.source_id === sourceId}
                onClick={() => setSourceId(x.source_id)}
                className={cn(
                  "flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]",
                  x.source_id === sourceId ? "border-foreground bg-foreground text-background" : "border-border hover:bg-state-hover",
                  x.draft && "border-dashed",
                )}
              >
                {x.source_kind === "stihl_country" ? (x.country === country ? "Сайт STIHL страны" : `Сайт STIHL ${countryName(x.country)}`) : sourceLabel(x)}
                <b className="tabular-nums">{Math.round(x.by_volume)}%</b>
                {x.draft ? <span className="text-[10px] opacity-80">черновик</span> : null}
              </button>
            ))}
          </div>
          {selected ? <SourceLine c={selected} /> : null}
          {rows ? <ChoiceTable rows={rows} canDecide={canDecide} /> : <Note>Загружаем сверку…</Note>}
        </>
      ) : country ? (
        <NoData c={mapCountries.find((x) => x.code === country)} />
      ) : null}
    </div>
  );
}

/**
 * The selected source: its rating and, for an organisation's catalog, the way to its place
 * in «Источники» — prominent for a draft (decided there), quiet for a confirmed one.
 */
function SourceLine({ c }: { c: SourceCoverage }) {
  const openSource = useOpenSource();
  const own = c.source_kind !== "stihl_country";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
      <span>
        <b className="tabular-nums">{c.by_volume}%</b> по объёму · <b className="tabular-nums">{c.by_positions}%</b> позиций
      </span>
      <span className="text-muted-foreground">
        полностью {c.full} · частично {c.partial} · нет {c.none}
        {c.unchecked ? <span className="text-[var(--mf-amber)]"> · проверить {c.unchecked}</span> : null}
      </span>
      {own && c.draft ? (
        <span className="flex items-center gap-1.5">
          <Badge tone="warn">черновик</Badge>
          <span className="text-[11px] text-muted-foreground">уже в рейтинге</span>
          <Button size="sm" variant="outline" className="h-6 border-[var(--mf-amber)] px-2 text-[11px]" onClick={() => openSource(c.source_id)}>
            Проверить в источниках
          </Button>
        </span>
      ) : own ? (
        <button type="button" className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={() => openSource(c.source_id)}>
          Каталог в источниках
        </button>
      ) : null}
    </div>
  );
}

/** Countries of the map: coverage, STIHL sites, organisations of the registry. */
function mergeCountries(covs: CountryCoverage[], srcCovs: SourceCoverage[], served: ServedCoverage[], sources: SourceRow[], facets: Facets): MapCountry[] {
  const m = new Map<string, MapCountry>();
  const get = (code: string) => {
    let c = m.get(code);
    if (!c) m.set(code, (c = { code, coverage: null, byPositions: null, site: false, suppliers: 0, refined: 0, drafts: 0 }));
    return c;
  };
  for (const f of facets.countries ?? []) if (f.value) get(f.value).suppliers = f.count;
  for (const s of sources) {
    if (!s.country_code) continue;
    if (s.kind === "stihl_country") get(s.country_code).site = true;
    else if (s.company_id && s.current) {
      if (s.current.confirmed_at) get(s.country_code).refined += 1;
      else get(s.country_code).drafts = (get(s.country_code).drafts ?? 0) + 1;
    }
  }
  for (const c of covs) Object.assign(get(c.country), { coverage: c.by_volume, byPositions: c.by_positions, coverageBy: "site", coverageDraft: false });
  // An organisation's own catalog colours its country too, when it covers more than the
  // country's site (or the country has none); a draft is marked as such.
  for (const x of srcCovs) {
    if (x.source_kind === "stihl_country" || !x.country) continue;
    const c = get(x.country);
    if (c.coverage == null || x.by_volume > c.coverage) {
      Object.assign(c, { coverage: x.by_volume, byPositions: x.by_positions, coverageBy: "own", coverageDraft: x.draft, coverageOrg: x.company_name });
    }
  }
  // An organisation working in a country brings its catalog there too, also from another
  // country (a distributor of South Africa serving Zambia): the best of them.
  for (const x of served) {
    const c = get(x.country);
    if (c.coverage != null && x.by_volume <= c.coverage) continue;
    const via = x.source_country !== x.country;
    Object.assign(c, {
      coverage: x.by_volume,
      byPositions: x.by_positions,
      coverageBy: via ? "via" : x.source_kind === "stihl_country" ? "site" : "own",
      coverageDraft: x.draft,
      coverageOrg: x.company_name,
      coverageVia: x.source_kind === "stihl_country" ? `сайт STIHL ${countryName(x.source_country)}` : `каталог${x.draft ? ", черновик" : ""}`,
    });
  }
  return [...m.values()];
}

interface OrgRow {
  id: string;
  display_name: string;
  priority: number;
  country_code: string;
  countries?: string[];
  coverage: { by_volume: number; country: string; by?: string } | null;
}

/** Countries an organisation serves: its main one and its coverage countries. */
const served = (o: OrgRow) => [...new Set([o.country_code, ...(o.countries ?? [])].filter(Boolean))];

/**
 * The cluster of the selected country: the other countries its organisations serve, how
 * many of them serve each, and whether they are all the organisations there.
 */
function clusterOf(selected: string, orgs: OrgRow[], countries: MapCountry[]): Record<string, Cluster> {
  if (!selected || !orgs.length) return {};
  const total = new Map(countries.map((c) => [c.code, c.suppliers]));
  const out: Record<string, Cluster> = {};
  for (const o of orgs) {
    for (const cc of served(o)) {
      const c = (out[cc] ??= { n: 0, full: false });
      c.n += 1;
    }
  }
  for (const [cc, c] of Object.entries(out)) c.full = c.n >= (total.get(cc) ?? 0);
  return out;
}

/**
 * Organisations of the registry serving the selected country (main country or one of its
 * coverage countries — one organisation can stand in several): «Рядом» opens its card as
 * a tab beside, «Чат» — its own chat.
 */
function CountryCompanies({
  country,
  orgs,
  own,
  onMatch,
}: {
  country: string;
  orgs: { items: OrgRow[]; total: number } | null;
  own: Map<string, SourceCoverage>;
  onMatch: (sourceId: string) => void;
}) {
  const openPinned = useOpenPinned();
  const openObject = useOpenObject();
  const [all, setAll] = useState(false);
  const items = orgs ? (all ? orgs.items : orgs.items.slice(0, 6)) : null;
  const total = orgs?.total ?? 0;
  if (!items) return <span className="flex-1 py-1 text-[11px] text-muted-foreground">…</span>;
  if (!items.length) return <span className="flex-1 py-1 text-[11px] text-muted-foreground">В реестре нет организаций этой страны.</span>;
  const btn = "h-6 rounded-md px-1.5 text-[11px] text-muted-foreground hover:bg-state-hover hover:text-foreground";
  return (
    <ul className="flex min-w-[12rem] flex-1 flex-col gap-0.5" aria-label="Организации страны">
      {items.map((o) => {
        const ref = { kind: "company" as const, id: o.id, title: o.display_name };
        return (
          <li key={o.id} className="flex items-center gap-1.5 text-xs">
            <span className="flex-none rounded-full border border-border px-1 text-[10px] font-semibold">P{o.priority}</span>
            <span className="min-w-0 truncate font-medium" title={o.display_name}>{o.display_name}</span>
            <OtherCountries codes={served(o).filter((c) => c !== country)} />
            {o.coverage ? (
              <span className="flex-none text-[11px] tabular-nums text-muted-foreground" title={`Покрытие листа: лучшая из стран организации (${countryName(o.coverage.country)})`}>
                {Math.round(o.coverage.by_volume)}%
              </span>
            ) : null}
            <span className="ml-auto flex flex-none">
              {own.get(o.id) ? (
                <button type="button" className={btn} title="Сверка листа с каталогом организации" onClick={() => onMatch(own.get(o.id)!.source_id)}>
                  Сверка
                </button>
              ) : null}
              <button type="button" className={btn} title="Карточка рядом — отдельной вкладкой панели" onClick={() => { if (!openPinned(ref)) void openObject(ref); }}>
                Рядом
              </button>
              <button type="button" className={btn} title="Чат организации" onClick={() => void openObject(ref)}>
                Чат
              </button>
            </span>
          </li>
        );
      })}
      {orgs && !all && orgs.items.length > items.length ? (
        <li>
          <button type="button" className="text-[11px] text-muted-foreground hover:underline" onClick={() => setAll(true)}>
            и ещё {orgs.items.length - items.length}
          </button>
        </li>
      ) : null}
      {total > (orgs?.items.length ?? 0) ? <li className="text-[11px] text-muted-foreground">всего {total} — фильтр «Страна» в списке слева</li> : null}
    </ul>
  );
}

/** The other countries of an organisation, short: «+ Киргизия, Узбекистан +2». */
function OtherCountries({ codes }: { codes: string[] }) {
  if (!codes.length) return null;
  const names = codes.map(countryName);
  return (
    <span className="min-w-0 flex-none truncate text-[10px] text-muted-foreground" title={`Также: ${names.join(", ")}`}>
      + {names.slice(0, 2).join(", ")}
      {names.length > 2 ? ` +${names.length - 2}` : ""}
    </span>
  );
}

/** A country without its assortment: what would give the data. */
function NoData({ c }: { c?: MapCountry }) {
  if (!c) return null;
  return (
    <div className="px-3 py-2 text-xs">
      <b>{countryName(c.code)}</b> <span className="text-muted-foreground">· {describe(c)}</span>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {c.site
          ? "Сайт STIHL страны есть — загрузите его во вкладке «Источники», и покрытие посчитается."
          : "Сайта STIHL на общей платформе у страны нет: покрытие даст прайс, каталог или сайт самой организации."}
      </p>
    </div>
  );
}

