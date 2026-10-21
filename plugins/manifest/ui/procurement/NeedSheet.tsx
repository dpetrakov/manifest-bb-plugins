// «Закупочный лист» (ADR-051, W-19, EP-105): всё, что нам нужно закупить, — объект справа
// от чата, как почта и дашборд. Позиции правит, отменяет и загружает из файла человек
// (Manifest отклоняет это агенту, решение О-5: все операции — в плагине). Загрузка:
// файл CSV/XLSX → предпросмотр (новые / изменённые / без изменений / ошибки) → «Применить»
// с отпечатком того, что человек увидел.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBbNavigate, type PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { errorText, useStatus, useTool } from "../hooks";
import { Note } from "../RegistryList";
import { Badge, ConfirmCard, KindLabel } from "../manifest";
import type { ImportPreview, Need } from "../types";
import { railTarget } from "../workspace/intent";
import { useOpenObject } from "../workspace/state";
import { NEEDS_HUB } from "./paths";
import { Countries } from "./Countries";
import { Matching } from "./Matching";
import { GroupRow, KitMark, money, th } from "./grid";
import { readFile, toBase64 } from "./file";

/** Positions grouped by category, in sheet order inside a group. */
function byCategory(items: Need[]): { category: string; items: Need[]; qty: number }[] {
  const groups = new Map<string, Need[]>();
  for (const n of items) {
    const k = n.category || "Без категории";
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "ru"))
    .map(([category, list]) => ({ category, items: list, qty: list.reduce((sum, n) => sum + n.target_qty, 0) }));
}

/** The «Закупочный лист» rail: the last sheet chat or a new one, the sheet on the right. */
export function NeedsPage(_: PluginNavPanelProps) {
  const navigate = useBbNavigate();
  const openObject = useOpenObject();
  const [stay, setStay] = useState(false);
  useEffect(() => {
    const target = railTarget("needs");
    if (target === undefined) setStay(true);
    else if (target) navigate.toThread(target);
    else void openObject(NEEDS_HUB);
  }, [navigate, openObject]);
  if (!stay) return <Note>Открываем закупочный лист…</Note>;
  return <NeedSheet />;
}


/** The «Закупочный лист» object: the sheet and the assortment of countries. */
export function NeedSheet() {
  const { status } = useStatus();
  const [tab, setTab] = useState<"sheet" | "matching" | "countries">("sheet");
  if (!status?.canAssortment) return <SheetTab />;
  return (
    <div className="@container mf-root mf-island mf-paper flex h-full min-h-0 flex-col">
      <div className="mf-surface flex gap-1 border-b border-border px-3">
        {(
          [
            ["sheet", "Лист"],
            ["matching", "Сверка"],
            ["countries", "Ассортимент стран"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn("whitespace-nowrap px-3 py-2 text-xs", tab === k ? "border-b-2 border-foreground font-semibold" : "text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === "sheet" ? (
          <SheetTab />
        ) : (
          <div className="h-full overflow-y-auto">{tab === "matching" ? <Matching /> : <Countries />}</div>
        )}
      </div>
    </div>
  );
}

/** The sheet: positions, edit, cancel, import. */
function SheetTab() {
  const { status } = useStatus();
  const tool = useTool();
  const [items, setItems] = useState<Need[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => {
    tool<{ items: Need[] }>("procurement_needs", {}).then(
      (r) => {
        setItems(r.items ?? []);
        setError(null);
      },
      (e: unknown) => setError(errorText(e)),
    );
  }, [tool]);
  useEffect(() => {
    if (status?.canProcurement) load();
  }, [load, status?.canProcurement]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!items) return [];
    if (!s) return items;
    return items.filter((n) =>
      [n.model_key, n.category, n.description_en, n.part_no, ...n.article_aliases].some((v) => v.toLowerCase().includes(s)),
    );
  }, [items, q]);
  if (!status) return <Note>Подключаемся к Manifest…</Note>;
  if (!status.connected) return <Note>{status.message}</Note>;
  if (!status.canProcurement) return <Note>Закупочный лист недоступен: нужно право «Закупки: просмотр» в Manifest или обновление Manifest.</Note>;
  const canEdit = status.canProcurementManage;
  const total = items?.reduce((s, n) => s + n.target_qty, 0) ?? 0;
  return (
    <div className="@container mf-root mf-island mf-paper flex h-full min-h-0 flex-col">
      <div className="mf-surface flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Модель, артикул, категория…" aria-label="Поиск по листу" className="h-7 min-w-[9rem] flex-1 text-xs" />
        <span className="text-muted-foreground">
          {items ? `${items.length} поз. · ${total.toLocaleString("ru-RU")} шт` : "…"}
        </span>
        {canEdit ? (
          <>
            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setCreating(!creating)}>
              + Позиция
            </Button>
            <ImportButton onApplied={load} />
          </>
        ) : null}
      </div>
      {error ? <p role="alert" className="px-3 py-2 text-xs text-destructive">{error}</p> : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {creating ? (
          <div className="border-b border-border bg-[var(--mf-surface)] p-3">
            <NeedForm
              onDone={(changed) => {
                setCreating(false);
                if (changed) load();
              }}
            />
          </div>
        ) : null}
        {items && items.length === 0 ? <Note>Лист пуст. Загрузите файл с позициями (CSV или XLSX).</Note> : null}
        {shown.length ? (
          <table className="w-full border-collapse bg-[var(--mf-surface)] text-xs">
            <thead className="sticky top-0 z-10 bg-[var(--mf-surface)] shadow-[inset_0_-1px_0_var(--mf-line-300)]">
              <tr>
                <th className={cn(th, "w-9 pl-3 text-right")}>№</th>
                <th className={cn(th, "text-left")}>Модель</th>
                <th className={cn(th, "hidden text-left @[30rem]:table-cell")}>Артикулы</th>
                <th className={cn(th, "w-14 text-right")}>Кол-во</th>
                <th className={cn(th, "hidden w-24 pr-3 text-right @[22rem]:table-cell")}>Ориентир</th>
              </tr>
            </thead>
            <tbody>
              {byCategory(shown).map((g) => (
                <CategoryRows key={g.category} group={g} open={open} setOpen={setOpen} canEdit={canEdit} onChanged={load} />
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}

function CategoryRows({ group, open, setOpen, canEdit, onChanged }: {
  group: { category: string; items: Need[]; qty: number };
  open: string | null;
  setOpen: (id: string | null) => void;
  canEdit: boolean;
  onChanged: () => void;
}) {
  return (
    <>
      <GroupRow colSpan={5} title={group.category} note={`${group.items.length} поз. · ${group.qty.toLocaleString("ru-RU")} шт`} />
      {group.items.map((n) => {
        const isOpen = open === n.id;
        const arts = n.article_aliases;
        return (
          <FragmentRow key={n.id}>
            <tr
              className={cn("cursor-pointer border-b border-[var(--mf-line-200)] hover:bg-state-hover", isOpen && "bg-state-active")}
              onClick={() => setOpen(isOpen ? null : n.id)}
              aria-expanded={isOpen}
            >
              <td className="py-1 pl-3 pr-2 text-right tabular-nums text-muted-foreground">{n.position_no}</td>
              <td className="max-w-0 px-2 py-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-medium">{n.model_key || n.description_en || n.part_no}</span>
                  {n.kit ? <KitMark /> : null}
                </span>
              </td>
              <td className="hidden max-w-0 truncate px-2 py-1 font-mono text-[11px] text-muted-foreground @[30rem]:table-cell" title={arts.join(" ")}>
                {arts[0] ?? "—"}
                {arts.length > 1 ? ` +${arts.length - 1}` : ""}
              </td>
              <td className="px-2 py-1 text-right tabular-nums">{n.target_qty}</td>
              <td className="hidden py-1 pl-2 pr-3 text-right tabular-nums text-muted-foreground @[22rem]:table-cell">{money(n.ref_price, n.ref_currency)}</td>
            </tr>
            {isOpen ? (
              <tr className="border-b border-[var(--mf-line-300)]">
                <td colSpan={5} className="bg-[var(--mf-paper)] p-2.5">
                  <NeedForm
                    need={n}
                    readOnly={!canEdit}
                    onDone={(changed) => {
                      if (changed) onChanged();
                      else setOpen(null);
                    }}
                  />
                </td>
              </tr>
            ) : null}
          </FragmentRow>
        );
      })}
    </>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const field = "h-8 text-xs";

/** Create (no need) or edit a position. */
function NeedForm({ need, readOnly, onDone }: { need?: Need; readOnly?: boolean; onDone: (changed: boolean) => void }) {
  const tool = useTool();
  const [model, setModel] = useState(need?.model_key ?? "");
  const [kit, setKit] = useState(need?.kit ?? false);
  const [category, setCategory] = useState(need?.category ?? "");
  const [desc, setDesc] = useState(need?.description_en ?? "");
  const [aliases, setAliases] = useState((need?.article_aliases ?? []).join(" "));
  const [qty, setQty] = useState(String(need?.target_qty ?? ""));
  const [price, setPrice] = useState(need?.ref_price === null || need?.ref_price === undefined ? "" : String(need.ref_price));
  const [cur, setCur] = useState(need?.ref_currency ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const arts = aliases.split(/[\s,;]+/).filter(Boolean);
      const p = price.trim() === "" ? null : Number(price.replace(",", "."));
      const args: Record<string, unknown> = {
        id: need?.id,
        position_no: need?.position_no,
        brand: need?.brand ?? (model ? "STIHL" : ""),
        part_no: need?.part_no || arts[0] || "",
        description_en: desc || (model ? `STIHL ${model}${kit ? " set (with battery and charger)" : ""}` : ""),
        target_qty: Number(qty),
        unit: "pcs",
        response_deadline: need?.response_deadline ?? undefined,
        commercial_terms: need?.commercial_terms,
        specification_en: need?.specification_en,
        internal_comment: need?.internal_comment,
        model_key: model,
        kit,
        category,
        article_aliases: arts,
        ref_currency: cur,
      };
      if (p === null) args.clear_ref_price = true;
      else args.ref_price = p;
      await tool("procurement_need_save", args);
      onDone(true);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (!need) return;
    setBusy(true);
    try {
      await tool("procurement_need_cancel", { id: need.id });
      onDone(true);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  };
  const ro = readOnly || busy;
  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="grid gap-2 @md:grid-cols-2">
        <label className="flex flex-col gap-0.5">
          <KindLabel>Модель</KindLabel>
          <Input className={field} value={model} onChange={(e) => setModel(e.target.value)} disabled={ro} placeholder="MSA 220 C-B" />
        </label>
        <label className="flex flex-col gap-0.5">
          <KindLabel>Категория</KindLabel>
          <Input className={field} value={category} onChange={(e) => setCategory(e.target.value)} disabled={ro} />
        </label>
        <label className="flex flex-col gap-0.5 @md:col-span-2">
          <KindLabel>Артикулы (все известные, через пробел)</KindLabel>
          <Input className={field} value={aliases} onChange={(e) => setAliases(e.target.value)} disabled={ro} />
        </label>
        <label className="flex flex-col gap-0.5">
          <KindLabel>Кол-во, шт</KindLabel>
          <Input className={field} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} disabled={ro} />
        </label>
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-0.5">
            <KindLabel>Ориентир цены</KindLabel>
            <Input className={field} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} disabled={ro} />
          </label>
          <label className="flex w-20 flex-col gap-0.5">
            <KindLabel>Валюта</KindLabel>
            <Input className={field} value={cur} onChange={(e) => setCur(e.target.value.toUpperCase())} disabled={ro} placeholder="KZT" />
          </label>
        </div>
        <label className="flex flex-col gap-0.5 @md:col-span-2">
          <KindLabel>Для поставщика (англ.)</KindLabel>
          <Input className={field} value={desc} onChange={(e) => setDesc(e.target.value)} disabled={ro} />
        </label>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={kit} onChange={(e) => setKit(e.target.checked)} disabled={ro} />
        Набор с аккумулятором и зарядным
      </label>
      {err ? <p role="alert" className="text-destructive">{err}</p> : null}
      {readOnly ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="h-8" disabled={busy || !qty} onClick={() => void save()}>
            Сохранить
          </Button>
          <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => onDone(false)}>
            Закрыть
          </Button>
          <span className="flex-1" />
          {need ? (
            <Button size="sm" variant="ghost" className="h-8 text-destructive" disabled={busy} onClick={() => setConfirmCancel(true)}>
              Отменить позицию
            </Button>
          ) : null}
        </div>
      )}
      {confirmCancel ? (
        <ConfirmCard
          title={`Отменить позицию ${need?.position_no}?`}
          actions={
            <>
              <Button size="sm" variant="destructive" className="h-8" disabled={busy} onClick={() => void cancel()}>
                Отменить позицию
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setConfirmCancel(false)}>
                Не отменять
              </Button>
            </>
          }
        >
          Позиция уйдёт из листа и из рейтинга поставщиков; назначения поставщикам снимутся.
        </ConfirmCard>
      ) : null}
    </div>
  );
}

const KIND_TEXT: Record<string, string> = { create: "новая", update: "изменится", same: "без изменений", error: "ошибка" };

/** «Загрузить файл»: preview, then apply what the person saw. */
function ImportButton({ onApplied }: { onApplied: () => void }) {
  const tool = useTool();
  const input = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<{ name: string; b64: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const pick = async (f: File) => {
    setErr(null);
    setDone(null);
    setBusy(true);
    try {
      const b64 = toBase64(await readFile(f));
      const p = await tool<ImportPreview>("procurement_import_preview", { filename: f.name, content_base64: b64 });
      setFile({ name: f.name, b64 });
      setPreview(p);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    if (!file || !preview) return;
    setBusy(true);
    setErr(null);
    try {
      await tool("procurement_import_apply", { filename: file.name, content_base64: file.b64, fingerprint: preview.fingerprint });
      setDone(`Загружено: новых ${preview.counts.create ?? 0}, изменено ${preview.counts.update ?? 0}.`);
      setPreview(null);
      setFile(null);
      onApplied();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const changes = preview?.actions.filter((a) => a.kind !== "same") ?? [];
  const toApply = (preview?.counts.create ?? 0) + (preview?.counts.update ?? 0);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".csv,.xlsx,.tsv,text/csv"
        className="hidden"
        aria-label="Файл с позициями"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void pick(f);
        }}
      />
      <Button size="sm" variant="outline" className="h-7 px-2" disabled={busy} onClick={() => input.current?.click()}>
        Загрузить файл
      </Button>
      {done ? <span className="w-full text-[var(--mf-green)]">{done}</span> : null}
      {err ? <span role="alert" className="w-full text-destructive">{err}</span> : null}
      {preview ? (
        <div className="w-full">
          <ConfirmCard
            title={`${file?.name}: ${preview.rows} строк`}
            actions={
              <>
                <Button size="sm" className="h-8" disabled={busy || toApply === 0} onClick={() => void apply()}>
                  Применить: новых {preview.counts.create ?? 0}, изменений {preview.counts.update ?? 0}
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => setPreview(null)}>
                  Отмена
                </Button>
              </>
            }
          >
            <div className="flex flex-wrap gap-1">
              {(["create", "update", "same", "error"] as const).map((k) =>
                preview.counts[k] ? (
                  <Badge key={k} tone={k === "error" ? "err" : k === "same" ? "muted" : k === "update" ? "warn" : "ok"}>
                    {KIND_TEXT[k]}: {preview.counts[k]}
                  </Badge>
                ) : null,
              )}
            </div>
            {changes.length ? (
              <ul className="mt-2 max-h-56 overflow-y-auto">
                {changes.map((a) => (
                  <li key={`${a.key}|${a.kit}|${a.lines[0]}`} className={cn("flex gap-2 py-0.5", a.kind === "error" && "text-destructive")}>
                    <span className="w-16 flex-none text-muted-foreground">{KIND_TEXT[a.kind]}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {a.key.startsWith("art:") || a.key.startsWith("name:") ? a.name : a.key}
                      {a.kit ? " · набор" : ""} · {a.qty} шт
                      {a.changes?.length ? ` · ${a.changes.join(", ")}` : ""}
                      {a.error ? ` · ${a.error} (стр. ${a.lines.join(", ")})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </ConfirmCard>
        </div>
      ) : null}
    </>
  );
}
