// Attachments of letters (EP-113): the procurement sheet in Excel, the way the buyer's
// suppliers know it (OEM Part No · Description · Qty, pcs + empty Price and Availability) —
// the whole sheet or what the organisation's catalog has. A draft, a mailing and a template
// say what to attach; the file is built for each recipient when the letter goes.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { errorText, useTool } from "../hooks";
import { countryName } from "../labels";

/** What to attach (stored). */
export interface AttachmentSpec {
  kind: "procurement_sheet";
  scope: "all" | "catalog";
  /** Whose catalog: as in the rating, regional (STIHL site of its country) or its own. */
  source?: "auto" | "country" | "own";
  /** Without the quantities column. */
  no_qty?: boolean;
}
/** What an attachment will be (or was) for an organisation. */
export interface AttachmentSheet {
  scope: string;
  source?: string;
  no_qty?: boolean;
  available?: string[];
  fallback?: boolean;
  filename: string;
  rows: number;
  catalog: boolean;
  source_kind?: string;
  country?: string;
  draft?: boolean;
  size?: number;
}

/** The catalog a sheet went by: «сайт STIHL Германия», «личный каталог, черновик». */
function catalogText(s: AttachmentSheet): string {
  if (!s.source_kind) return "";
  return s.source_kind === "stihl_country" ? `региональный: сайт STIHL ${countryName(s.country ?? "")}` : `личный каталог${s.draft ? ", черновик" : ""}`;
}

/** In a few words: «28 поз. · что есть в каталоге (региональный: сайт STIHL Германия) · без количества». */
export function sheetText(s: AttachmentSheet): string {
  const cat = catalogText(s);
  let what: string;
  if (s.scope === "catalog") what = s.catalog ? `что есть в каталоге (${cat})` : "весь лист — каталога нет";
  else what = cat ? `весь лист, с артикулами (${cat})` : "весь лист";
  const parts = [`${s.rows} поз.`, what];
  if (s.fallback && s.source !== "auto") parts.push(s.source === "own" ? "личного каталога нет" : "регионального каталога нет");
  if (s.no_qty) parts.push("без количества");
  return parts.join(" · ");
}

function download(name: string, type: string, base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The files of a letter: of a draft (built now) or of a sent letter (as it went). */
export function AttachmentList({ sheets, companyId, messageId }: { sheets: AttachmentSheet[]; companyId?: string; messageId?: string }) {
  const tool = useTool();
  const [error, setError] = useState<string | null>(null);
  if (!sheets.length) return null;
  const get = async (position: number) => {
    setError(null);
    try {
      const f = await tool<{ filename: string; content_type: string; content_base64: string }>("mail_file", {
        ...(messageId ? { message_id: messageId } : { company_id: companyId }),
        position,
      });
      download(f.filename, f.content_type, f.content_base64);
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <ul className="flex flex-col gap-1" aria-label="Вложения">
      {sheets.map((s, i) => (
        <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-[var(--mf-line-300)] bg-[var(--mf-surface)] px-2 py-1 text-xs">
          <span aria-hidden>📎</span>
          <span className="font-medium">{s.filename}</span>
          <span className="text-muted-foreground">{sheetText(s)}</span>
          <button type="button" className="ml-auto text-[11px] underline" onClick={() => void get(i)}>
            Скачать
          </button>
        </li>
      ))}
      {error ? <li role="alert" className="text-[11px] text-destructive">{error}</li> : null}
    </ul>
  );
}

/**
 * Choose what a letter carries: the RFQ type (none / the whole sheet / what the catalog
 * has), whose catalog (as in the rating / regional / own) and with or without the
 * quantities. Price and Availability are always there. `available` — the catalogs the
 * organisation has (unknown for a template or a mailing as a whole); `inherit` — a mailing
 * recipient: «as in the mailing».
 */
export function AttachmentPicker({
  specs,
  busy,
  onChange,
  available,
  inherit,
}: {
  specs: AttachmentSpec[];
  busy?: boolean;
  onChange: (specs: AttachmentSpec[] | null) => void;
  available?: string[];
  inherit?: boolean;
}) {
  const cur = specs[0];
  const scope = inherit ? "inherit" : (cur?.scope ?? "");
  const source = cur?.source ?? "auto";
  // Only set fields: RPC accepts strict JSON, an undefined field would fail the call.
  const set = (patch: Partial<AttachmentSpec>) => {
    const next: AttachmentSpec = { kind: "procurement_sheet", scope: cur?.scope ?? "catalog", source, ...patch };
    if (patch.no_qty ?? cur?.no_qty) next.no_qty = true;
    else delete next.no_qty;
    onChange([next]);
  };
  const has = (x: string) => !available || available.includes(x);
  const sel = "h-7 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-60";
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label="Вложение">
      <span className="text-muted-foreground">Вложение:</span>
      <select
        className={sel}
        value={scope}
        disabled={busy}
        aria-label="Вложение письма"
        onChange={(e) => {
          const v = e.target.value;
          if (v === "inherit") onChange(null);
          else if (!v) onChange([]);
          else set({ scope: v as AttachmentSpec["scope"] });
        }}
      >
        {inherit !== undefined ? <option value="inherit">как у рассылки</option> : null}
        <option value="">без вложения</option>
        <option value="catalog">RFQ — что есть в каталоге</option>
        <option value="all">RFQ — весь закупочный лист</option>
      </select>
      {cur && !inherit ? (
        <>
          <select className={sel} value={source} disabled={busy} aria-label="Каталог" onChange={(e) => set({ source: e.target.value as AttachmentSpec["source"] })}>
            <option value="auto">каталог как в рейтинге</option>
            <option value="country">региональный (сайт STIHL страны){has("country") ? "" : " — нет"}</option>
            <option value="own">личный каталог организации{has("own") ? "" : " — нет"}</option>
          </select>
          <select className={sel} value={cur.no_qty ? "no" : "yes"} disabled={busy} aria-label="Количество" onChange={(e) => set({ no_qty: e.target.value === "no" })}>
            <option value="yes">с количеством</option>
            <option value="no">без количества</option>
          </select>
        </>
      ) : null}
    </div>
  );
}

/** The picker of a draft, saved at once. */
export function DraftAttachments({
  companyId,
  specs,
  available,
  onSaved,
}: {
  companyId: string;
  specs: AttachmentSpec[];
  available?: string[];
  onSaved: (letter: unknown) => void;
}) {
  const tool = useTool();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <AttachmentPicker
        specs={specs}
        busy={busy}
        available={available}
        onChange={async (next) => {
          setBusy(true);
          setError(null);
          try {
            onSaved(await tool("mail_draft_attachments", { company_id: companyId, attachments: next ?? [] }));
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      />
      {error ? <span role="alert" className="text-[11px] text-destructive">{error}</span> : null}
    </div>
  );
}

/** Saved attachment specs may be absent from an older Manifest. */
export const specsOf = (x?: AttachmentSpec[] | null) => x ?? [];
