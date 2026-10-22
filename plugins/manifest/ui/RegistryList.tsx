// Реестр потенциальных поставщиков — компактный список для левого сайдбара
// (список «Потенциальные поставщики» в сайдбаре) и для корня страницы «Аутрич».
import { useEffect, useMemo, useRef, useState } from "react";
import { useOpenCompany, useOpenPinned } from "./workspace/state";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { CompanyPeek, usePeek } from "./CompanyPeek";
import { FilterSelect, type Option } from "./FilterSelect";
import { errorText, useCompanyChanged, useRegistry, useStatus, useTool } from "./hooks";
import { ROLE_LABEL, ROLE_ORDER, STATUS_LABEL, STATUS_ORDER, countryName, regionLabel } from "./labels";
import type { Facets, ListItem, WorkListItem } from "./types";

export function PriorityBadge({ priority, manual }: { priority: number; manual?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-7 flex-none items-center justify-center rounded-full border px-1.5 text-[11px] font-semibold",
        priority === 1 && "mf-prio-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
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

export function RegistryList({ onNavigate, activeThreadId = null }: { onNavigate?: () => void; activeThreadId?: string | null }) {
  const { status, error: statusError } = useStatus();
  const reg = useRegistry();
  const tool = useTool();
  const openCompany = useOpenCompany();
  const openPinned = useOpenPinned();
  const listRef = useRef<HTMLUListElement | null>(null);
  // Cmd/Ctrl-click or a row dragged out of the list (towards the panel): a separate tab.
  // The list knows the surface: a thread's panel, or the New thread screen's one. Where there is
  // no side panel (a plugin page) — the organisation's chat, so a click never does nothing.
  const pin = (it: ListItem) => {
    if (!openPinned({ kind: "company", id: it.id, title: it.display_name }, activeThreadId)) open(it);
  };
  const peek = usePeek();
  const [facets, setFacets] = useState<Facets | null>(null);
  const [search, setSearch] = useState(reg.filters.q);

  const ready = status?.connected && status.canView;
  // The list follows the open thread: in a dashboard chat — its selection.
  useEffect(() => reg.setScope(activeThreadId ?? ""), [activeThreadId, reg.setScope]);
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
  const roleOptions: Option[] = [{ value: "", label: "Все роли" }, ...ROLE_ORDER.map((r) => ({ value: r, label: ROLE_LABEL[r] }))];
  const sortOptions: Option[] = [
    { value: "", label: "По приоритету" },
    { value: "coverage", label: "По покрытию листа" },
  ];

  if (statusError) return <Note>Плагин недоступен: {statusError}</Note>;
  if (!status) return <Note>Подключаемся к Manifest…</Note>;
  if (!status.connected) return <Note>{status.message || "Плагин не подключён."} Настройки → плагины → Manifest.</Note>;
  if (!status.canView) return <Note>Нет доступа к реестру: нужно право outreach.view в Manifest.</Note>;

  // W-18: an organisation opens in its latest chat (the card on the right); without
  // chats — its page with the card and «Новый чат».
  function open(it: ListItem) {
    reg.select(it.id);
    onNavigate?.();
    openCompany(it.id, it.display_name);
  }
  // In a dashboard chat the card opens next to the dashboard; Cmd/Ctrl-click — its chat.
  const sel = reg.selection;
  const click = (it: ListItem, mod: boolean) => {
    peek.close();
    if (sel && !mod) {
      reg.select(it.id);
      pin(it);
    } else if (mod && !sel) pin(it);
    else open(it);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-1.5 px-2 pb-2 pt-1">
        {sel ? (
          <div role="status" className="flex items-start gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs">
            <span className="min-w-0 flex-1">
              Выборка дашборда: <b className="font-medium">{sel.label}</b>
            </span>
            <button
              type="button"
              aria-label="Отвязать от дашборда"
              title="Отвязать от дашборда — свой фильтр списка"
              className="rounded px-1 text-muted-foreground hover:bg-state-hover hover:text-foreground"
              onClick={reg.unlink}
            >
              ×
            </button>
          </div>
        ) : (
          <>
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
              <FilterSelect label="Роль" value={reg.filters.role} options={roleOptions} onChange={(v) => reg.setFilter("role", v)} />
              <FilterSelect label="Порядок" value={reg.filters.sort} options={sortOptions} onChange={(v) => reg.setFilter("sort", v)} />
            </div>
          </>
        )}
        <span className="text-[11px] text-muted-foreground">
          {reg.loading && reg.items.length === 0 ? "Загружаем…" : `Найдено: ${reg.total}`}
        </span>
      </div>
      {reg.error && <Note>Не удалось загрузить: {reg.error}</Note>}
      <ul ref={listRef} onScroll={peek.close} className="min-h-0 flex-1 overflow-y-auto px-1">
        {reg.items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              draggable
              onMouseEnter={(e) => peek.enter(it as WorkListItem, e.currentTarget)}
              onMouseLeave={peek.leave}
              onDragStart={(e) => {
                peek.close();
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData("text/plain", it.display_name);
              }}
              onDragEnd={(e) => {
                const r = listRef.current?.getBoundingClientRect();
                if (r && e.clientX > r.right + 24) pin(it);
              }}
              onAuxClick={(e) => {
                if (e.button === 1) pin(it);
              }}
              onClick={(e) => click(it, e.metaKey || e.ctrlKey)}
              className={cn(
                "flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-state-hover",
                reg.selectedId === it.id && "bg-state-active",
              )}
            >
              <span className="flex items-center gap-1.5">
                <PriorityBadge priority={it.priority} manual={it.priority_manual} />
                <span className="truncate text-sm font-medium">{it.display_name}</span>
                {it.roles?.includes("supplier") ? (
                  <span className="flex-none rounded-full border border-emerald-500/40 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-300" title="Поставщик закупок">
                    поставщик
                  </span>
                ) : null}
              </span>
              <span className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">
                  {countryName(it.country_code)}
                  {it.countries.length > 1 ? ` +${it.countries.length - 1}` : ""} · {STATUS_LABEL[it.status] ?? it.status}
                </span>
                <span className="flex flex-none items-center gap-1.5">
                  {it.coverage ? (
                    <span
                      className={
                        it.coverage.draft
                          ? "rounded border border-dashed border-[var(--mf-amber)] px-1 font-medium tabular-nums text-foreground"
                          : "rounded bg-[color-mix(in_oklab,var(--diff-added,#16a34a)_14%,transparent)] px-1 font-medium tabular-nums text-foreground"
                      }
                      title={`Покрытие закупочного листа: ${it.coverage.by_volume}% по объёму, ${it.coverage.by_positions}% по позициям (${
                        it.coverage.by === "pricelist" ? "прайс организации" : it.coverage.by === "distributor_site" ? "сайт организации" : `сайт STIHL ${it.coverage.country}`
                      }${it.coverage.draft ? ", черновик — не подтверждён" : ""})${it.coverage.unchecked ? ` · ${it.coverage.unchecked} выборов проверить` : ""}`}
                    >
                      {Math.round(it.coverage.by_volume)}%
                    </span>
                  ) : null}
                  <Channels it={it} />
                </span>
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
      {peek.peek ? (
        <CompanyPeek
          peek={peek.peek}
          onKeep={peek.keep}
          onLeave={peek.leave}
          onClose={peek.close}
          onBeside={(it) => {
            peek.close();
            reg.select(it.id);
            pin(it);
          }}
          onChat={(it) => {
            peek.close();
            open(it);
          }}
        />
      ) : null}
    </div>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return <div role="status" className="px-3 py-2 text-xs text-muted-foreground">{children}</div>;
}
