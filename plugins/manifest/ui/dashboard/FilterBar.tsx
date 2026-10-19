// Фильтр темы пилюлями (docs/outreach/dashboard.md §6.3): то, что задал агент
// или клик по графику, видно и правится руками; удачный фильтр сохраняется
// как общий сегмент команды.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorText, useTool } from "../hooks";
import { ATTENTION_LABEL, STATUS_LABEL, countryName, regionLabel } from "../labels";
import type { Segment } from "../types";
import { cleanFilter, type Filter } from "./state";

function pillText(key: string, value: unknown, segments: Segment[]): string {
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  switch (key) {
    case "q":
      return `Поиск: ${String(value)}`;
    case "region":
      return regionLabel(String(value));
    case "country":
      return countryName(String(value));
    case "priorities":
      return list(value).map((p) => `P${p}`).join(", ");
    case "statuses":
      return list(value).map((s) => STATUS_LABEL[s] ?? s).join(", ");
    case "tags":
      return `Метки: ${list(value).join(", ")}`;
    case "owner":
      return value === "none" ? "Без ответственного" : `Ответственный: ${String(value)}`;
    case "attention":
      return ATTENTION_LABEL[String(value)] ?? String(value);
    case "stale_days":
      return `Без касаний ≥ ${String(value)} дн`;
    case "never_touched":
      return value ? "Без касаний" : "Были касания";
    case "has_person":
      return value ? "Есть контактное лицо" : "Нет контактного лица";
    case "has_phone":
      return value ? "Есть телефон" : "Нет телефона";
    case "has_email":
      return value ? "Есть email" : "Нет email";
    case "brand":
      return value === "only" ? "Только email бренда" : "Без email бренда";
    case "segment_id":
      return `Сегмент: ${segments.find((s) => s.id === value)?.name ?? "…"}`;
    case "ids":
      return `Выбрано: ${list(value).length}`;
  }
  return `${key}: ${String(value)}`;
}

/** The filter in words, as the pills show it: for the list's «dashboard selection» banner. */
export function filterLabel(filter: Filter, segments: Segment[]): string {
  return Object.entries(cleanFilter(filter))
    .map(([k, v]) => pillText(k, v, segments))
    .join(" · ");
}

export function FilterBar({
  filter,
  onChange,
  segments,
  onSegmentsChanged,
  canSave,
}: {
  filter: Filter;
  onChange: (f: Filter) => void;
  segments: Segment[];
  onSegmentsChanged: () => void;
  canSave: boolean;
}) {
  const tool = useTool();
  const [naming, setNaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const entries = Object.entries(cleanFilter(filter));

  const save = async () => {
    if (!naming?.trim()) return;
    try {
      await tool("outreach_save_segment", { name: naming.trim(), filter: cleanFilter(filter) });
      setNaming(null);
      setError(null);
      onSegmentsChanged();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">Фильтр темы:</span>
      {entries.length === 0 ? <span className="text-muted-foreground">все организации</span> : null}
      {entries.map(([k, v]) => (
        <span key={k} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-2 pr-1">
          {pillText(k, v, segments)}
          <button
            type="button"
            aria-label="Убрать условие"
            className="rounded-full px-1 text-muted-foreground hover:bg-state-hover hover:text-foreground"
            onClick={() => onChange({ ...filter, [k]: undefined })}
          >
            ×
          </button>
        </span>
      ))}
      {entries.length > 0 ? (
        <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => onChange({})}>
          сбросить
        </button>
      ) : null}
      <span className="flex-1" />
      {segments.length > 0 ? (
        <select
          aria-label="Сегмент"
          className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs"
          value=""
          onChange={(e) => e.target.value && onChange({ segment_id: e.target.value })}
        >
          <option value="">Сегменты…</option>
          {segments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {typeof s.count === "number" ? ` · ${s.count}` : ""}
            </option>
          ))}
        </select>
      ) : null}
      {canSave && entries.length > 0 && naming === null ? (
        <Button size="sm" variant="outline" className="h-7" onClick={() => setNaming("")}>
          Сохранить как сегмент
        </Button>
      ) : null}
      {naming !== null ? (
        <span className="flex items-center gap-1">
          <Input
            autoFocus
            className="h-7 w-48 text-xs"
            placeholder="Название сегмента"
            value={naming}
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") setNaming(null);
            }}
          />
          <Button size="sm" className="h-7" onClick={() => void save()}>
            Сохранить
          </Button>
        </span>
      ) : null}
      {error ? <span className="w-full text-destructive">{error}</span> : null}
    </div>
  );
}
