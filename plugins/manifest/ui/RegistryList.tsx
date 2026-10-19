// Реестр потенциальных поставщиков — компактный список для левого сайдбара
// (список «Потенциальные поставщики» в сайдбаре) и для корня страницы «Аутрич».
import { useEffect, useMemo, useState } from "react";
import { useOpenCompany } from "./workspace/state";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { FilterSelect, type Option } from "./FilterSelect";
import { errorText, useCompanyChanged, useRegistry, useStatus, useTool } from "./hooks";
import { STATUS_LABEL, STATUS_ORDER, countryName, regionLabel } from "./labels";
import type { Facets, ListItem } from "./types";

export function PriorityBadge({ priority, manual }: { priority: number; manual?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-7 flex-none items-center justify-center rounded-full border px-1.5 text-[11px] font-semibold",
        priority === 1 && "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        priority === 2 && "border-border",
        priority === 3 && "border-border",
        priority >= 4 && "border-dashed border-border text-muted-foreground",
      )}
      title={manual ? "Приоритет задан вручную" : "Приоритет по каналам связи"}
    >
      P{priority}
      {manual ? "✎" : ""}
    </span>
  );
}

function Channels({ it }: { it: ListItem }) {
  const items: [boolean, string, string][] = [
    [it.has_phone, "Phone", "телефон"],
    [it.has_whatsapp, "MessageCircle", "WhatsApp"],
    [it.has_email, "Mail", "email"],
    [it.has_website, "Globe", "сайт"],
  ];
  return (
    <span className="flex items-center gap-1" aria-label="Каналы связи">
      {items.map(([on, icon, title]) => (
        <span key={title} title={`${title}: ${on ? "есть" : "нет"}`} className={on ? "text-foreground" : "text-muted-foreground/30"}>
          <Icon name={icon} className="size-3" />
        </span>
      ))}
    </span>
  );
}

export function RegistryList({ onNavigate }: { onNavigate?: () => void }) {
  const { status, error: statusError } = useStatus();
  const reg = useRegistry();
  const tool = useTool();
  const openCompany = useOpenCompany();
  const [facets, setFacets] = useState<Facets | null>(null);
  const [search, setSearch] = useState(reg.filters.q);

  const ready = status?.connected && status.canView;
  useEffect(() => {
    if (!ready) return;
    void reg.load();
    tool<Facets>("outreach_facets").then(setFacets, () => setFacets(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== reg.filters.q) reg.setFilter("q", search.trim());
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  useCompanyChanged((id) => {
    if (reg.items.some((i) => i.id === id)) void reg.load();
  });

  const regionOptions = useMemo<Option[]>(
    () => [{ value: "", label: "Все регионы" }, ...(facets?.regions ?? []).map((r) => ({ value: r.value, label: `${regionLabel(r.value)} (${r.count})` }))],
    [facets],
  );
  const countryOptions = useMemo<Option[]>(
    () => [
      { value: "", label: "Все страны" },
      ...(facets?.countries ?? [])
        .map((c) => ({ value: c.value, label: `${countryName(c.value)} (${c.count})` }))
        .sort((a, b) => a.label.localeCompare(b.label, "ru")),
    ],
    [facets],
  );
  const priorityOptions: Option[] = [{ value: "", label: "Все приоритеты" }, ...[1, 2, 3, 4, 5].map((p) => ({ value: String(p), label: `P${p}` }))];
  const statusOptions: Option[] = [{ value: "", label: "Все статусы" }, ...STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] }))];

  if (statusError) return <Note>Плагин недоступен: {statusError}</Note>;
  if (!status) return <Note>Подключаемся к Manifest…</Note>;
  if (!status.connected) return <Note>{status.message || "Плагин не подключён."} Настройки → плагины → Manifest.</Note>;
  if (!status.canView) return <Note>Нет доступа к реестру: нужно право outreach.view в Manifest.</Note>;

  // W-18: an organisation opens in its latest chat (the card on the right); without
  // chats — its page with the card and «Новый чат».
  const open = (it: ListItem) => {
    reg.select(it.id);
    onNavigate?.();
    openCompany(it.id, it.display_name);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-1.5 px-2 pb-2 pt-1">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Название, контакт, город…"
          aria-label="Поиск по реестру"
          className="h-7 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="flex flex-wrap gap-1">
          <FilterSelect label="Регион" value={reg.filters.region} options={regionOptions} onChange={(v) => reg.setFilter("region", v)} />
          <FilterSelect label="Страна" value={reg.filters.country} options={countryOptions} onChange={(v) => reg.setFilter("country", v)} />
          <FilterSelect label="Приоритет" value={reg.filters.priority} options={priorityOptions} onChange={(v) => reg.setFilter("priority", v)} />
          <FilterSelect label="Статус" value={reg.filters.status} options={statusOptions} onChange={(v) => reg.setFilter("status", v)} />
        </div>
        <span className="text-[11px] text-muted-foreground">
          {reg.loading && reg.items.length === 0 ? "Загружаем…" : `Найдено: ${reg.total}`}
        </span>
      </div>
      {reg.error && <Note>Не удалось загрузить: {reg.error}</Note>}
      <ul className="min-h-0 flex-1 overflow-y-auto px-1">
        {reg.items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => open(it)}
              className={cn(
                "flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-state-hover",
                reg.selectedId === it.id && "bg-state-active",
              )}
            >
              <span className="flex items-center gap-1.5">
                <PriorityBadge priority={it.priority} manual={it.priority_manual} />
                <span className="truncate text-sm font-medium">{it.display_name}</span>
              </span>
              <span className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">
                  {countryName(it.country_code)}
                  {it.countries.length > 1 ? ` +${it.countries.length - 1}` : ""} · {STATUS_LABEL[it.status] ?? it.status}
                </span>
                <Channels it={it} />
              </span>
            </button>
          </li>
        ))}
        {reg.items.length < reg.total && (
          <li className="px-2 py-2">
            <button
              type="button"
              disabled={reg.loading}
              onClick={() => void reg.load(true).catch((e) => console.error(errorText(e)))}
              className="w-full rounded-md border border-border py-1 text-xs hover:bg-state-hover disabled:opacity-50"
            >
              {reg.loading ? "Загружаем…" : `Показать ещё (${reg.total - reg.items.length})`}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return <div role="status" className="px-3 py-2 text-xs text-muted-foreground">{children}</div>;
}
