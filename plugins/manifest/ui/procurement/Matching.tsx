// «Сверка» (EP-108, §6а): the procurement sheet against a country's assortment. The
// automatic choice counts in the rating at once; doubtful ones are in «Проверить». A
// person confirms, halves, rejects or picks another product of the same model — a
// decision by the global id applies in every country; the rating is recomputed.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errorText, useStatus, useTool } from "../hooks";
import { countryName } from "../labels";
import { Note } from "../RegistryList";
import { Badge, StatusDot, type Tone } from "../manifest";
import { CountryLookup, CoverageMap, describe, type MapCountry } from "../map/CoverageMap";
import { KitMark, th } from "./grid";

interface CountryCoverage {
  country: string;
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
  current: { id: string } | null;
}
interface Facets {
  countries?: { value: string; count: number }[];
}
interface Alternative {
  global_id: string;
  sku: string;
  name: string;
  model_key: string;
  kit: boolean;
  url: string;
}
interface ChoiceRow {
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
}

const REASON: Record<string, string> = {
  kit: "набор ↔ без АКБ",
  generation: "другое поколение",
  mains: "зарядное не для сети ЕС",
  trim: "исполнение не указано",
};

function levelView(c: ChoiceRow): { tone: Tone; text: string } {
  if (c.level >= 1) return { tone: "ok", text: c.reason === "trim" ? "есть · исполнение не указано" : "есть" };
  if (c.level > 0) return { tone: "warning", text: `частично · ${REASON[c.reason ?? ""] ?? c.reason ?? ""}` };
  return { tone: "muted", text: "нет" };
}


export function Matching() {
  const { status } = useStatus();
  const tool = useTool();
  const [covs, setCovs] = useState<CountryCoverage[] | null>(null);
  const [country, setCountry] = useState<string>("");
  const [onlyReview, setOnlyReview] = useState(false);
  const [rows, setRows] = useState<ChoiceRow[] | null>(null);
  const [queue, setQueue] = useState<ChoiceRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [facets, setFacets] = useState<Facets>({});
  useEffect(() => {
    tool<{ items: SourceRow[] }>("assortment_sources", {}).then((r) => setSources(r.items ?? []), () => setSources([]));
    tool<Facets>("outreach_facets", {}).then(setFacets, () => setFacets({}));
  }, [tool]);
  const loadCovs = useCallback(() => {
    tool<{ items: CountryCoverage[] }>("assortment_coverage", {}).then(
      (r) => {
        setCovs(r.items ?? []);
        setCountry((c) => c || r.items?.[0]?.country || "");
      },
      (e: unknown) => setError(errorText(e)),
    );
    tool<{ items: ChoiceRow[] }>("assortment_queue", {}).then(
      (r) => setQueue(r.items ?? []),
      () => setQueue([]),
    );
  }, [tool]);
  const covered = !!covs?.some((c) => c.country === country);
  const loadRows = useCallback(() => {
    setRows(null);
    if (!country || !covered) return;
    tool<{ items: ChoiceRow[] }>("assortment_choices", { country }).then(
      (r) => setRows(r.items ?? []),
      (e: unknown) => setError(errorText(e)),
    );
  }, [country, covered, tool]);
  useEffect(loadCovs, [loadCovs]);
  useEffect(loadRows, [loadRows]);
  const decide = async (c: ChoiceRow, level: number, alt?: Alternative) => {
    setBusy(true);
    setError(null);
    try {
      const gid = alt ? alt.global_id : c.global_id;
      const sku = alt ? alt.sku : c.sku;
      const args = gid ? { key_kind: "global_id", key: gid } : { key_kind: "sku", key: sku };
      await tool("assortment_decide", { need_id: c.need_id, level, reason: level === 0.5 ? c.reason ?? "" : "", ...args });
      loadCovs();
      loadRows();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (c: ChoiceRow) => {
    if (!c.decision_id) return;
    setBusy(true);
    try {
      await tool("assortment_decision_revoke", { id: c.decision_id });
      loadCovs();
      loadRows();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const mapCountries = useMemo(() => mergeCountries(covs ?? [], sources, facets), [covs, sources, facets]);
  if (!status?.canAssortment) return <Note>Сверка появится после обновления Manifest.</Note>;
  if (covs && covs.length === 0) return <Note>Нет загруженных стран: загрузите ассортимент во вкладке «Ассортимент стран».</Note>;
  const canDecide = !!status.canManage;
  const shown = onlyReview ? (queue ?? []) : (rows ?? []);
  return (
    <div className="flex flex-col">
      <CoverageMap countries={mapCountries} selected={onlyReview ? "" : country} onSelect={(c) => { setCountry(c); setOnlyReview(false); }} />
      <div className="mf-surface flex flex-wrap items-center gap-2 border-y border-border px-3 py-2">
        <CountryLookup countries={mapCountries} selected={onlyReview ? "" : country} onSelect={(c) => { setCountry(c); setOnlyReview(false); }} />
        <button
          type="button"
          onClick={() => setOnlyReview(!onlyReview)}
          className={cn(
            "h-7 rounded-md border px-2 text-[11px]",
            onlyReview ? "border-[var(--mf-amber)] bg-[color-mix(in_oklab,var(--mf-amber)_18%,white)]" : "border-border hover:bg-state-hover",
          )}
          title="Сомнительные автоматические выборы всех стран"
        >
          Проверить {queue ? queue.length : "…"}
        </button>
      </div>
      {error ? <p role="alert" className="px-3 py-2 text-xs text-destructive">{error}</p> : null}
      {!onlyReview && covs ? (
        covered ? (
          <CoverageLine c={covs.find((x) => x.country === country)} />
        ) : country ? (
          <NoData c={mapCountries.find((x) => x.code === country)} />
        ) : null
      ) : null}
      {onlyReview || covered ? (
      <table className="w-full border-collapse bg-[var(--mf-surface)] text-xs">
        <thead className="sticky top-0 z-10 bg-[var(--mf-surface)] shadow-[inset_0_-1px_0_var(--mf-line-300)]">
          <tr>
            <th className={cn(th, "w-9 pl-3 text-right")}>№</th>
            <th className={cn(th, "text-left")}>Позиция</th>
            <th className={cn(th, "hidden text-left @[26rem]:table-cell")}>Товар страны</th>
            <th className={cn(th, "pr-3 text-left")}>Итог</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((c) => {
            const k = `${c.country}|${c.need_id}`;
            const isOpen = open === k;
            const lv = levelView(c);
            return (
              <MatchRows key={k} isOpen={isOpen} onToggle={() => setOpen(isOpen ? null : k)}
                cells={
                  <>
                    <td className="py-1 pl-3 pr-2 text-right tabular-nums text-muted-foreground">{c.position_no}</td>
                    <td className="max-w-0 px-2 py-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-medium">{c.model_key}</span>
                        {c.kit ? <KitMark /> : null}
                        {onlyReview ? <span className="flex-none text-[10px] text-muted-foreground">{countryName(c.country)}</span> : null}
                      </span>
                    </td>
                    <td className="hidden max-w-0 truncate px-2 py-1 text-muted-foreground @[26rem]:table-cell" title={c.name}>
                      {c.name ?? "—"}
                    </td>
                    <td className="py-1 pl-2 pr-3">
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        <StatusDot tone={lv.tone} />
                        <span className="truncate">{lv.text}</span>
                        {c.review && !c.decided ? <span className="text-[var(--mf-amber)]" title="Проверить">●</span> : null}
                        {c.decided ? <span className="text-[10px] text-muted-foreground" title="Решение человека">✓</span> : null}
                      </span>
                    </td>
                  </>
                }
                detail={
                  <div className="flex flex-col gap-2 text-xs">
                    <div>
                      {c.sku ? (
                        <>
                          Выбрано: <b>{c.name}</b> · <span className="font-mono">{c.sku}</span>
                          {c.url ? (
                            <a className="ml-1 underline" href={c.url} target="_blank" rel="noreferrer">
                              страница
                            </a>
                          ) : null}
                          {c.decided ? " · решение человека" : c.via === "article" ? " · по артикулу" : c.via === "model" ? " · по модели" : " · по семейству"}
                        </>
                      ) : (
                        <span className="text-muted-foreground">В этой стране подходящего товара не нашлось.</span>
                      )}
                    </div>
                    {canDecide && c.sku ? (
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
                        {c.decided ? (
                          <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy} onClick={() => void revoke(c)}>
                            Вернуть автоматический
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    {canDecide && c.alternatives?.length ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Другие товары этой модели</span>
                        {c.alternatives.map((a) => (
                          <div key={`${a.global_id}|${a.sku}`} className="flex items-center gap-2">
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
      ) : null}
      {onlyReview && queue && queue.length === 0 ? <Note>Проверять нечего: все сомнительные выборы решены.</Note> : null}
    </div>
  );
}

/** Countries of the map: coverage, STIHL sites, organisations of the registry. */
function mergeCountries(covs: CountryCoverage[], sources: SourceRow[], facets: Facets): MapCountry[] {
  const m = new Map<string, MapCountry>();
  const get = (code: string) => {
    let c = m.get(code);
    if (!c) m.set(code, (c = { code, coverage: null, byPositions: null, site: false, suppliers: 0, refined: 0 }));
    return c;
  };
  for (const f of facets.countries ?? []) if (f.value) get(f.value).suppliers = f.count;
  for (const s of sources) {
    if (!s.country_code) continue;
    if (s.kind === "stihl_country") get(s.country_code).site = true;
    else if (s.company_id && s.current) get(s.country_code).refined += 1;
  }
  for (const c of covs) Object.assign(get(c.country), { coverage: c.by_volume, byPositions: c.by_positions });
  return [...m.values()];
}

/** A country without its assortment: what would give the data. */
function NoData({ c }: { c?: MapCountry }) {
  if (!c) return null;
  return (
    <div className="px-3 py-2 text-xs">
      <b>{countryName(c.code)}</b> <span className="text-muted-foreground">· {describe(c)}</span>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {c.site
          ? "Сайт STIHL страны есть — загрузите его во вкладке «Ассортимент стран», и покрытие посчитается."
          : "Сайта STIHL на общей платформе у страны нет: покрытие даст прайс, каталог или сайт самой организации."}
      </p>
    </div>
  );
}

function CoverageLine({ c }: { c?: CountryCoverage }) {
  if (!c) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
      <span>
        <b className="tabular-nums">{c.by_volume}%</b> по объёму · <b className="tabular-nums">{c.by_positions}%</b> позиций
      </span>
      <span className="text-muted-foreground">
        полностью {c.full} · частично {c.partial} · нет {c.none}
        {c.unchecked ? <span className="text-[var(--mf-amber)]"> · проверить {c.unchecked}</span> : null}
      </span>
    </div>
  );
}

function MatchRows({ isOpen, onToggle, cells, detail }: { isOpen: boolean; onToggle: () => void; cells: React.ReactNode; detail: React.ReactNode }) {
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
