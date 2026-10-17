// Компактный выпадающий фильтр. Длинный список (страны, ~200) получает поле
// поиска сверху — как фильтр стран в Manifest (просьба владельца 2026-10-16).
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: string;
}

const SEARCH_THRESHOLD = 12;

export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const searchable = options.length > SEARCH_THRESHOLD;
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    if (searchable) setTimeout(() => input.current?.focus(), 0);
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, searchable]);

  const q = query.trim().toLowerCase();
  const visible = q ? options.filter((o) => o.value === "" || o.label.toLowerCase().includes(q)) : options;
  const firstMatch = visible.find((o) => o.value !== "");
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Фильтр: ${label}`}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-7 max-w-[11rem] items-center gap-1 rounded-md border border-border px-2 text-xs",
          value ? "bg-state-active text-foreground" : "text-muted-foreground hover:bg-state-hover",
        )}
      >
        <span className="truncate">{value ? current?.label ?? value : label}</span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute left-0 top-8 z-50 flex max-h-72 w-60 flex-col overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {searchable && (
            <input
              ref={input}
              type="search"
              value={query}
              placeholder="Найти…"
              aria-label={`Поиск: ${label}`}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && q && firstMatch) pick(firstMatch.value);
              }}
              className="sticky top-0 z-10 mb-1 h-7 flex-none rounded border border-input bg-background px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          )}
          {q && !firstMatch && <span className="px-2 py-1 text-xs text-muted-foreground">Ничего не найдено</span>}
          {visible.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => pick(o.value)}
              className={cn(
                "flex-none truncate rounded px-2 py-1 text-left text-xs hover:bg-state-hover",
                o.value === value && "font-semibold",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
