// The «Сверка» map (EP-110): where the procurement sheet is covered. A country's fill is
// the coverage of its STIHL assortment (by volume); a hatched country has a STIHL site
// not loaded yet; a circle — organisations of the registry there (size — how many;
// amber — one of them has its own catalog or price list). A click selects the country;
// the lookup under the map does the same for small and crowded countries.
import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { countryName } from "../labels";
import { POINTS, SHAPES, WORLD_H, WORLD_W } from "./world";

export interface MapCountry {
  code: string;
  /** Coverage by volume, % — the country's assortment is loaded. */
  coverage: number | null;
  byPositions?: number | null;
  /** A STIHL site exists but its assortment is not loaded. */
  site: boolean;
  /** Organisations of the registry in the country. */
  suppliers: number;
  /** Of them — with their own catalog or price list, confirmed. */
  refined: number;
  /** Of them — with a draft of their own catalog (counts, not confirmed yet). */
  drafts?: number;
}

/**
 * A country of the selected country's cluster: `n` of its organisations serve it; `full` —
 * they are all the organisations there.
 */
export interface Cluster {
  n: number;
  full: boolean;
}

type View = { key: string; label: string; codes: string[] };
const VIEWS: View[] = [
  { key: "world", label: "Мир", codes: [] },
  { key: "europe", label: "Европа", codes: ["PT", "IS", "NO", "FI", "CY", "GR", "UA", "IE"] },
  { key: "asia", label: "Азия", codes: ["TR", "KZ", "JP", "ID", "IN", "AE", "MN", "PH"] },
  { key: "africa", label: "Африка", codes: ["MA", "EG", "ZA", "SN", "SO", "MG"] },
  { key: "americas", label: "Америка", codes: ["CA", "MX", "CU", "BR", "AR", "CL", "GL"] },
  { key: "oceania", label: "Океания", codes: ["AU", "NZ", "FJ", "PG", "NC"] },
];

/** The viewBox around a set of countries, with the map's aspect ratio. */
function viewBox(v: View): [number, number, number, number] {
  if (!v.codes.length) return [0, 0, WORLD_W, WORLD_H];
  const pts = v.codes.map((c) => POINTS[c]).filter(Boolean);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const pad = 18;
  let [x0, x1, y0, y1] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad];
  const ratio = WORLD_W / WORLD_H;
  if ((x1 - x0) / (y1 - y0) < ratio) {
    const w = (y1 - y0) * ratio;
    const cx = (x0 + x1) / 2;
    [x0, x1] = [cx - w / 2, cx + w / 2];
  } else {
    const h = (x1 - x0) / ratio;
    const cy = (y0 + y1) / 2;
    [y0, y1] = [cy - h / 2, cy + h / 2];
  }
  return [x0, y0, x1 - x0, y1 - y0];
}

/** Fill of a covered country: pale at 0 %, deep green at 100 %. */
const coverageFill = (pct: number) => `color-mix(in oklab, var(--mf-green) ${Math.round(18 + Math.min(100, Math.max(0, pct)) * 0.72)}%, white)`;

export function CoverageMap({
  countries,
  selected,
  cluster = {},
  onSelect,
}: {
  countries: MapCountry[];
  selected: string;
  cluster?: Record<string, Cluster>;
  onSelect: (code: string) => void;
}) {
  const byCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries]);
  const [view, setView] = useState<View>(VIEWS[0]);
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const vb = viewBox(view);
  const k = vb[2] / WORLD_W; // marker scale in a zoomed view
  const move = (code: string) => (e: React.MouseEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setHover({ code, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const clickable = (c?: MapCountry) => !!c && (c.coverage !== null || c.site || c.suppliers > 0);
  const markers = countries.filter((c) => c.suppliers > 0 && POINTS[c.code]).sort((a, b) => b.suppliers - a.suppliers);
  const hc = hover ? byCode.get(hover.code) : undefined;
  return (
    <div className="flex flex-col">
      {/* The map stops growing on a wide page: past ~46rem it only takes height from the sheet. */}
      <div ref={box} className="relative mx-auto w-full max-w-[46rem] overflow-hidden bg-[var(--mf-paper)]" onMouseLeave={() => setHover(null)}>
        <svg viewBox={vb.join(" ")} className="block h-auto w-full" role="img" aria-label="Карта покрытия закупочного листа">
          <defs>
            <pattern id="mf-site-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="4" height="4" fill="var(--mf-line-200)" />
              <line x1="0" y1="0" x2="0" y2="4" stroke="color-mix(in oklab, var(--mf-green) 55%, white)" strokeWidth="1.6" />
            </pattern>
          </defs>
          {Object.entries(SHAPES).map(([code, d]) => {
            const c = byCode.get(code);
            const fill = c?.coverage != null ? coverageFill(c.coverage) : c?.site ? "url(#mf-site-hatch)" : "var(--mf-line-200)";
            return (
              <path
                key={code}
                d={d}
                fill={fill}
                stroke={selected === code ? "var(--mf-ink-900)" : "white"}
                strokeWidth={(selected === code ? 1.4 : 0.5) * k}
                className={cn(clickable(c) && "cursor-pointer hover:brightness-95")}
                onMouseMove={c ? move(code) : undefined}
                onClick={clickable(c) ? () => onSelect(code) : undefined}
              />
            );
          })}
          {/* The cluster: a halo around the marker, the country's fill stays the coverage.
              Solid — the selected country's organisations are all there are; dashed — others too. */}
          {markers
            .filter((c) => cluster[c.code])
            .map((c) => {
              const [x, y] = POINTS[c.code];
              const s = Math.max(k, 0.35);
              const r = (2.2 + Math.sqrt(c.suppliers) * 1.1) * s;
              const full = cluster[c.code].full;
              return (
                <circle
                  key={`halo-${c.code}`}
                  cx={x}
                  cy={y}
                  r={r + 3.2 * s}
                  fill="color-mix(in oklab, var(--mf-blue) 22%, transparent)"
                  stroke="var(--mf-blue)"
                  strokeWidth={(full ? 1.3 : 1) * s}
                  strokeDasharray={full ? undefined : `${2 * s} ${1.4 * s}`}
                  pointerEvents="none"
                  data-testid={`map-halo-${c.code}`}
                  data-full={full ? "1" : "0"}
                />
              );
            })}
          {markers.map((c) => {
            const [x, y] = POINTS[c.code];
            const r = (2.2 + Math.sqrt(c.suppliers) * 1.1) * Math.max(k, 0.35);
            const sel = selected === c.code;
            return (
              <circle
                key={c.code}
                cx={x}
                cy={y}
                r={r}
                fill={c.refined > 0 ? "var(--mf-amber)" : c.drafts ? "color-mix(in oklab, var(--mf-amber) 35%, white)" : "white"}
                stroke={sel ? "var(--mf-ink-900)" : !c.refined && c.drafts ? "var(--mf-amber)" : "var(--mf-ink-700)"}
                strokeDasharray={!sel && !c.refined && c.drafts ? `${1.6 * Math.max(k, 0.35)} ${1 * Math.max(k, 0.35)}` : undefined}
                strokeWidth={(sel ? 1.6 : 0.9) * Math.max(k, 0.35)}
                className="cursor-pointer"
                onMouseMove={move(c.code)}
                onClick={() => onSelect(c.code)}
                data-testid={`map-marker-${c.code}`}
              />
            );
          })}
        </svg>
        {hover && hc ? (
          <div
            className="pointer-events-none absolute z-10 min-w-[10rem] rounded-md border border-border bg-[var(--mf-surface)] px-2 py-1.5 text-[11px] shadow-md"
            style={tipPlace(hover, box.current)}
          >
            <div className="font-semibold">{countryName(hc.code)}</div>
            <div className="text-muted-foreground">{describe(hc)}</div>
            {cluster[hc.code] && hc.code !== selected ? (
              <div className="mt-0.5 text-[var(--mf-blue)]">
                {cluster[hc.code].full
                  ? `только организации ${countryName(selected)} (${cluster[hc.code].n})`
                  : `организаций ${countryName(selected)}: ${cluster[hc.code].n} из ${hc.suppliers}`}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="absolute left-2 top-2 flex flex-wrap gap-0.5 rounded-md border border-border bg-[var(--mf-surface)]/90 p-0.5 text-[10px]">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v)}
              className={cn("rounded px-1.5 py-0.5", view.key === v.key ? "bg-foreground text-background" : "hover:bg-state-hover")}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <Legend cluster={Object.keys(cluster).length > 1} />
    </div>
  );
}

/**
 * Where the tooltip goes: below and right of the cursor, flipped above it in the lower half
 * of the map and to its left near the right edge — the map clips what leaves its frame.
 */
function tipPlace(at: { x: number; y: number }, el: HTMLElement | null): React.CSSProperties {
  const w = el?.clientWidth ?? 300;
  const h = el?.clientHeight ?? 200;
  const pos: React.CSSProperties = {};
  if (at.x > w - 190) pos.right = Math.max(4, w - at.x + 12);
  else pos.left = at.x + 12;
  if (at.y > h / 2) pos.bottom = Math.max(4, h - at.y + 12);
  else pos.top = at.y + 12;
  return pos;
}

/** One line about a country for the tooltip and the lookup. */
export function describe(c: MapCountry): string {
  const parts: string[] = [];
  if (c.coverage != null) parts.push(`покрытие ${Math.round(c.coverage)}% по объёму`);
  else if (c.site) parts.push("сайт STIHL не загружен");
  else parts.push("нет источника ассортимента");
  if (c.suppliers)
    parts.push(`${c.suppliers} орг.${c.refined ? `, свой каталог — ${c.refined}` : ""}${c.drafts ? `, черновик каталога — ${c.drafts}` : ""}`);
  return parts.join(" · ");
}

function Legend({ cluster }: { cluster: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <span className="h-2 w-12 rounded-sm" style={{ background: `linear-gradient(90deg, ${coverageFill(0)}, ${coverageFill(100)})` }} />
        покрытие листа 0–100%
      </span>
      <span className="flex items-center gap-1">
        <svg width="12" height="8" aria-hidden>
          <rect width="12" height="8" fill="url(#mf-site-hatch)" />
        </svg>
        сайт STIHL не загружен
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full border border-[var(--mf-ink-700)] bg-white" />
        организации реестра
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full border border-[var(--mf-ink-700)] bg-[var(--mf-amber)]" />
        есть свой каталог
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full border border-dashed border-[var(--mf-amber)] bg-[color-mix(in_oklab,var(--mf-amber)_35%,white)]" />
        черновик каталога
      </span>
      {cluster ? (
        <>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full border border-[var(--mf-blue)] bg-[color-mix(in_oklab,var(--mf-blue)_22%,transparent)]" />
            те же организации — других там нет
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full border border-dashed border-[var(--mf-blue)] bg-[color-mix(in_oklab,var(--mf-blue)_22%,transparent)]" />
            есть и другие
          </span>
        </>
      ) : null}
    </div>
  );
}

/** The lookup under the map: any country of the registry or with data. */
export function CountryLookup({ countries, selected, onSelect }: { countries: MapCountry[]; selected: string; onSelect: (code: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return countries
      .filter((c) => !s || countryName(c.code).toLowerCase().includes(s) || c.code.toLowerCase() === s)
      .sort((a, b) => (b.coverage ?? -1) - (a.coverage ?? -1) || b.suppliers - a.suppliers || countryName(a.code).localeCompare(countryName(b.code), "ru"))
      .slice(0, 12);
  }, [countries, q]);
  return (
    <div className="relative min-w-[10rem] flex-1">
      <Input
        value={open ? q : selected ? countryName(selected) : ""}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => {
          setQ("");
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Страна…"
        aria-label="Выбрать страну"
        className="h-7 text-xs"
      />
      {open && list.length ? (
        <ul role="listbox" className="absolute left-0 right-0 top-8 z-20 max-h-64 overflow-y-auto rounded-md border border-border bg-[var(--mf-surface)] py-1 text-xs shadow-md">
          {list.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                role="option"
                aria-selected={c.code === selected}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(c.code);
                  setOpen(false);
                }}
                className="flex w-full items-baseline gap-2 px-2 py-1 text-left hover:bg-state-hover"
              >
                <span className="font-medium">{countryName(c.code)}</span>
                <span className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground">
                  {c.coverage != null ? `${Math.round(c.coverage)}%` : c.site ? "не загружен" : "—"}
                  {c.suppliers ? ` · ${c.suppliers} орг.` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
