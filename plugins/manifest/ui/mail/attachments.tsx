// Attachments of letters (EP-113): the procurement sheet in Excel, the way the buyer's
// suppliers know it (OEM Part No · Description · Qty, pcs + empty Price and Availability) —
// the whole sheet or what the organisation's catalog has — and any uploaded file (a person
// here, the agent from its thread). A draft, a mailing, a recipient and a template say what
// to attach; the sheet is built for each recipient when the letter goes, a file goes as is.
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { errorText, useTool } from "../hooks";
import { readFile, toBase64 } from "../procurement/file";
import { countryName } from "../labels";

/** The procurement sheet to attach (stored). */
export interface SheetSpec {
  kind: "procurement_sheet";
  scope: "all" | "catalog";
  /** Whose catalog: as in the rating, regional (STIHL site of its country) or its own. */
  source?: "auto" | "country" | "own";
  /** Without the quantities column. */
  no_qty?: boolean;
}
/** An uploaded file to attach; Manifest fills its name and size. */
export interface FileSpec {
  kind: "file";
  file_id: string;
  filename?: string;
  size?: number;
}
/** What to attach (stored). */
export type AttachmentSpec = SheetSpec | FileSpec;
/** What an attachment will be (or was) for an organisation. */
export interface AttachmentSheet {
  kind?: string;
  file_id?: string;
  content_type?: string;
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
  if (s.kind === "file") return `файл · ${sizeText(s.size ?? 0)}`;
  const cat = catalogText(s);
  let what: string;
  if (s.scope === "catalog") what = s.catalog ? `что есть в каталоге (${cat})` : "весь лист — каталога нет";
  else what = cat ? `весь лист, с артикулами (${cat})` : "весь лист";
  const parts = [`${s.rows} поз.`, what];
  if (s.fallback && s.source !== "auto") parts.push(s.source === "own" ? "личного каталога нет" : "регионального каталога нет");
  if (s.no_qty) parts.push("без количества");
  return parts.join(" · ");
}

/** «820 КБ», «1,4 МБ». */
export function sizeText(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} КБ`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
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

/** The catalogs an organisation has, from the first sheet among attachments. */
export const availableOf = (sheets?: AttachmentSheet[] | null) => sheets?.find((x) => x.kind !== "file")?.available;

/**
 * Choose what a letter carries: the RFQ type (none / the whole sheet / what the catalog
 * has), whose catalog (as in the rating / regional / own), with or without the quantities
 * — Price and Availability are always there — and files: add one from the computer, remove
 * one. `available` — the catalogs the organisation has (unknown for a template or a
 * mailing as a whole); `inherit` — a mailing recipient following the mailing («как у
 * рассылки»): any change makes its own list from what it carries now.
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
  const tool = useTool();
  const input = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sheet = specs.find((x): x is SheetSpec => x.kind === "procurement_sheet");
  const files = specs.filter((x): x is FileSpec => x.kind === "file");
  const scope = inherit ? "inherit" : (sheet?.scope ?? "");
  const source = sheet?.source ?? "auto";
  // Only set fields: RPC accepts strict JSON, an undefined field would fail the call.
  const fileOf = (f: FileSpec): FileSpec => ({ kind: "file", file_id: f.file_id });
  const compose = (sh: SheetSpec | null, fs: FileSpec[]): AttachmentSpec[] => [...(sh ? [sh] : []), ...fs.map(fileOf)];
  const setSheet = (patch: Partial<SheetSpec>) => {
    const next: SheetSpec = { kind: "procurement_sheet", scope: sheet?.scope ?? "catalog", source, ...patch };
    if (patch.no_qty ?? sheet?.no_qty) next.no_qty = true;
    else delete next.no_qty;
    onChange(compose(next, files));
  };
  const pick = async (f: File) => {
    setError(null);
    if (f.size > 7 * 1024 * 1024) {
      setError("файл больше 7 МБ — шлюз не возьмёт его в письмо");
      return;
    }
    setUploading(true);
    try {
      const b64 = toBase64(await readFile(f));
      const up = await tool<{ id: string }>("mail_file_upload", { filename: f.name, content_base64: b64, ...(f.type ? { content_type: f.type } : {}) });
      onChange(compose(sheet ?? null, [...files.filter((x) => x.file_id !== up.id), { kind: "file", file_id: up.id }]));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setUploading(false);
    }
  };
  const has = (x: string) => !available || available.includes(x);
  const sel = "h-7 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-60";
  const off = busy || uploading;
  return (
    <div className="flex flex-col gap-1 text-xs" role="group" aria-label="Вложение">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground">Вложение:</span>
        <select
          className={sel}
          value={scope}
          disabled={off}
          aria-label="Вложение письма"
          onChange={(e) => {
            const v = e.target.value;
            if (v === "inherit") onChange(null);
            else if (!v) onChange(compose(null, files));
            else setSheet({ scope: v as SheetSpec["scope"] });
          }}
        >
          {inherit !== undefined ? <option value="inherit">как у рассылки</option> : null}
          <option value="">{files.length ? "без RFQ" : "без вложения"}</option>
          <option value="catalog">RFQ — что есть в каталоге</option>
          <option value="all">RFQ — весь закупочный лист</option>
        </select>
        {sheet && !inherit ? (
          <>
            <select className={sel} value={source} disabled={off} aria-label="Каталог" onChange={(e) => setSheet({ source: e.target.value as SheetSpec["source"] })}>
              <option value="auto">каталог как в рейтинге</option>
              <option value="country">региональный (сайт STIHL страны){has("country") ? "" : " — нет"}</option>
              <option value="own">личный каталог организации{has("own") ? "" : " — нет"}</option>
            </select>
            <select className={sel} value={sheet.no_qty ? "no" : "yes"} disabled={off} aria-label="Количество" onChange={(e) => setSheet({ no_qty: e.target.value === "no" })}>
              <option value="yes">с количеством</option>
              <option value="no">без количества</option>
            </select>
          </>
        ) : null}
        <input
          ref={input}
          type="file"
          className="hidden"
          aria-label="Файл во вложение"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void pick(f);
          }}
        />
        <Button size="sm" variant="outline" className="h-7 px-2" disabled={off || specs.length >= 5} onClick={() => input.current?.click()}>
          {uploading ? "Загружаем…" : "+ Файл"}
        </Button>
      </div>
      {files.length ? (
        <ul className="flex flex-wrap gap-1" aria-label="Файлы во вложении">
          {files.map((f) => (
            <li key={f.file_id} className="flex items-center gap-1 rounded-md border border-[var(--mf-line-300)] bg-[var(--mf-surface)] px-1.5 py-0.5">
              <span aria-hidden>📎</span>
              <span className="max-w-[14rem] truncate" title={f.filename}>{f.filename ?? "файл"}</span>
              {f.size ? <span className="text-muted-foreground">{sizeText(f.size)}</span> : null}
              <button
                type="button"
                className="px-0.5 text-muted-foreground hover:text-destructive disabled:opacity-50"
                disabled={off}
                aria-label={`Убрать ${f.filename ?? "файл"}`}
                onClick={() => onChange(compose(sheet ?? null, files.filter((x) => x.file_id !== f.file_id)))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <span role="alert" className="text-[11px] text-destructive">{error}</span> : null}
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
