// «Ассортимент» of an organisation card (EP-112, README §6в): what its rating is counted
// by (its countries' STIHL sites or its own source), its own price list or site, and a
// draft — from a file here or collected by the agent from the organisation's site — that
// a person applies or drops. An applied own source replaces the countries in the rating.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { errorText, useCompanyChanged, useStatus, useTool } from "../hooks";
import { countryName, formatDateTime } from "../labels";
import { Badge } from "../manifest";
import { readFile, toBase64 } from "./file";

interface Snapshot {
  id: string;
  status: string;
  products: number;
  models: number;
  applied_at: string | null;
  finished_at: string | null;
  created_by: string;
}
interface Source {
  id: string;
  kind: string;
  base_url: string;
  current: Snapshot | null;
  latest: Snapshot | null;
}
interface Coverage {
  by_volume: number;
  by_positions: number;
  unchecked: number;
}
interface CompanyAssortmentData {
  sources: Source[] | null;
  coverage: Coverage | null;
  by: string;
  country: string;
}
interface Preview {
  snapshot: Snapshot;
  kind: string;
  origin: string;
  recognized: number;
  coverage: Coverage;
  current: Coverage | null;
  current_by: string;
  unknown: string[] | null;
}

const KIND_LABEL: Record<string, string> = { pricelist: "прайс организации", distributor_site: "сайт организации" };

function byLabel(by: string, country: string): string {
  if (by === "stihl_country" || !by) return `по сайту STIHL страны ${countryName(country)}`;
  return `по источнику: ${KIND_LABEL[by] ?? by}`;
}

export function CompanyAssortment({ companyId, website, canEdit }: { companyId: string; website?: string; canEdit: boolean }) {
  const { status } = useStatus();
  const tool = useTool();
  const [data, setData] = useState<CompanyAssortmentData | null>(null);
  const [drafts, setDrafts] = useState<Preview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    try {
      const d = await tool<CompanyAssortmentData>("assortment_company", { company_id: companyId });
      setData(d);
      const ready = (d.sources ?? []).map((s) => s.latest).filter((x): x is Snapshot => !!x && x.status === "ready");
      setDrafts(await Promise.all(ready.map((sn) => tool<Preview>("assortment_preview", { id: sn.id }))));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [companyId, tool]);
  useEffect(() => {
    void load();
  }, [load]);
  useCompanyChanged((id) => {
    if (id === companyId) void load();
  });
  const act = async (name: string, args: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await tool(name, args);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const upload = async (f: File) => {
    await act("assortment_company_file", { company_id: companyId, filename: f.name, content_base64: toBase64(await readFile(f)) });
  };
  if (!status?.canAssortment) return null;
  if (!data) return <p className="text-xs text-muted-foreground">{error ?? "…"}</p>;
  const own = (data.sources ?? []).filter((s) => s.current);
  return (
    <div className="flex flex-col gap-2 text-xs">
      {data.coverage ? (
        <p>
          Покрытие листа: <b className="tabular-nums">{Math.round(data.coverage.by_volume)}%</b> по объёму ·{" "}
          <b className="tabular-nums">{Math.round(data.coverage.by_positions)}%</b> позиций
          <span className="text-muted-foreground"> — {byLabel(data.by, data.country)}</span>
        </p>
      ) : (
        <p className="text-muted-foreground">Покрытие листа: нет данных — сайта STIHL у её стран нет, своего источника тоже.</p>
      )}
      {own.map((s) => (
        <p key={s.id} className="text-muted-foreground">
          {KIND_LABEL[s.kind] ?? s.kind}: {s.current!.products} тов., применён {formatDateTime(s.current!.applied_at)}
          {s.base_url ? (
            <>
              {" · "}
              <a href={s.base_url} target="_blank" rel="noreferrer" className="hover:underline">
                {s.base_url.replace(/^https?:\/\//, "")}
              </a>
            </>
          ) : null}
        </p>
      ))}
      {drafts.map((p) => (
        <div key={p.snapshot.id} className="rounded-md border border-[var(--mf-amber)] bg-[color-mix(in_oklab,var(--mf-amber)_8%,white)] p-2" role="group" aria-label="Черновик ассортимента">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="warn">черновик</Badge>
            <span>
              {KIND_LABEL[p.kind] ?? p.kind}: {p.snapshot.products} тов., распознано для листа {p.recognized}
            </span>
          </div>
          <p className="mt-1">
            По нему покрытие <b className="tabular-nums">{Math.round(p.coverage.by_volume)}%</b> по объёму ·{" "}
            <b className="tabular-nums">{Math.round(p.coverage.by_positions)}%</b> позиций
            {p.current ? (
              <span className="text-muted-foreground">
                {" "}
                (сейчас {Math.round(p.current.by_volume)}% {p.current_by === "stihl_country" ? "по стране" : "по своему источнику"})
              </span>
            ) : (
              <span className="text-muted-foreground"> (сейчас нет данных)</span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {p.origin ? `${p.origin} · ` : ""}
            {p.snapshot.created_by} · {formatDateTime(p.snapshot.finished_at)}
          </p>
          {p.unknown?.length ? (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={p.unknown.join("\n")}>
              Без модели: {p.unknown.slice(0, 3).join("; ")}
              {p.unknown.length > 3 ? "…" : ""}
            </p>
          ) : null}
          {canEdit ? (
            <div className="mt-1.5 flex gap-1.5">
              <Button size="sm" className="h-7 px-2" disabled={busy} onClick={() => void act("assortment_apply", { id: p.snapshot.id })}>
                Применить
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={busy} onClick={() => void act("assortment_discard", { id: p.snapshot.id })}>
                Отклонить
              </Button>
            </div>
          ) : null}
        </div>
      ))}
      {error ? <p role="alert" className="text-destructive">{error}</p> : null}
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 px-2" disabled={busy} onClick={() => file.current?.click()}>
            Загрузить прайс
          </Button>
          <input
            ref={file}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            aria-label="Файл прайса"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
          <span className="text-[11px] text-muted-foreground">
            или попросите агента в чате: «найди ассортимент STIHL на {website ? `сайте ${website.replace(/^https?:\/\//, "")}` : "сайте организации"} и сделай черновик»
          </span>
        </div>
      ) : null}
    </div>
  );
}
