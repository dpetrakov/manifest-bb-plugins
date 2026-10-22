// «Ассортимент» of an organisation card (EP-112, README §6в): what its rating is counted
// by (its countries' STIHL sites or its own source), its own price list or site. A draft —
// from a file here or collected by the agent from the organisation's site — counts in the
// rating at once, like an automatic choice of the matching; a person confirms it or
// rejects it (the previous confirmed source or the countries come back).
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { errorText, useCompanyChanged, useStatus, useTool } from "../hooks";
import { countryName, formatDateTime } from "../labels";
import { Badge } from "../manifest";
import { readFile, toBase64 } from "./file";
import { useOpenSource } from "./nav";

interface Snapshot {
  id: string;
  status: string;
  products: number;
  models: number;
  applied_at: string | null;
  finished_at: string | null;
  confirmed_at: string | null;
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
  draft: boolean;
  country: string;
}
interface Preview {
  snapshot: Snapshot;
  source_id: string;
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
  const openSource = useOpenSource();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    try {
      const d = await tool<CompanyAssortmentData>("assortment_company", { company_id: companyId });
      setData(d);
      // A draft is the current snapshot of an own source not confirmed yet.
      const unconfirmed = (d.sources ?? []).map((s) => s.current).filter((x): x is Snapshot => !!x && !x.confirmed_at);
      setDrafts(await Promise.all(unconfirmed.map((sn) => tool<Preview>("assortment_preview", { id: sn.id }))));
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
  const own = (data.sources ?? []).filter((s) => s.current?.confirmed_at);
  return (
    <div className="flex flex-col gap-2 text-xs">
      {data.coverage ? (
        <p>
          Покрытие листа: <b className="tabular-nums">{Math.round(data.coverage.by_volume)}%</b> по объёму ·{" "}
          <b className="tabular-nums">{Math.round(data.coverage.by_positions)}%</b> позиций
          <span className="text-muted-foreground"> — {byLabel(data.by, data.country)}</span>
          {data.draft ? <Badge tone="warn" className="ml-1.5">черновик</Badge> : null}
        </p>
      ) : (
        <p className="text-muted-foreground">Покрытие листа: нет данных — сайта STIHL у её стран нет, своего источника тоже.</p>
      )}
      {own.map((s) => (
        <p key={s.id} className="text-muted-foreground">
          {KIND_LABEL[s.kind] ?? s.kind}: {s.current!.products} тов., подтверждён {formatDateTime(s.current!.confirmed_at)}
          {s.base_url ? (
            <>
              {" · "}
              <a href={s.base_url} target="_blank" rel="noreferrer" className="hover:underline">
                {s.base_url.replace(/^https?:\/\//, "")}
              </a>
            </>
          ) : null}
          {" · "}
          <button type="button" className="text-foreground underline-offset-2 hover:underline" onClick={() => openSource(s.id)}>
            Каталог в источниках
          </button>
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
          <p className="mt-1 text-[11px] text-muted-foreground">Уже в рейтинге организации и на карте. Состав, «Подтвердить» и «Отклонить» — в «Источниках».</p>
          <p className="mt-1">
            По нему покрытие <b className="tabular-nums">{Math.round(p.coverage.by_volume)}%</b> по объёму ·{" "}
            <b className="tabular-nums">{Math.round(p.coverage.by_positions)}%</b> позиций
            {p.current ? (
              <span className="text-muted-foreground"> (без него — {Math.round(p.current.by_volume)}% по стране)</span>
            ) : (
              <span className="text-muted-foreground"> (без него — нет данных)</span>
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
          <div className="mt-1.5">
            <Button size="sm" variant="outline" className="h-7 border-[var(--mf-amber)] px-2" onClick={() => openSource(p.source_id)}>
              Проверить в источниках
            </Button>
          </div>
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
