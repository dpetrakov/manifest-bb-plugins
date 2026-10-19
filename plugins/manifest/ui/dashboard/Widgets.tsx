// Виджеты дашборда аутрича (docs/outreach/dashboard.md §6.2). Числа — из
// Manifest; проценты только при знаменателе от 20; цвет — только у нарушений.
// Любой элемент кликабелен: плитка и полоса задают фильтр темы, строка
// очереди и ленты открывает карточку справа.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PriorityBadge } from "../RegistryList";
import {
  AGING_LABEL,
  AGING_ORDER,
  ATTENTION_LABEL,
  FIELD_LABEL,
  REASON_LABEL,
  STATUS_LABEL,
  actorLabel,
  countryName,
  fieldValue,
  formatDateTime,
  rate,
  regionLabel,
} from "../labels";
import type { FeedItem, Metrics, Queue } from "../types";

export function Panel({ title, hint, children, className }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("mf-card p-3", className)}>
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-bold">{title}</h3>
        {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
      </header>
      {children}
    </section>
  );
}

// ---- tiles ----

const TILE_KEYS = ["waiting_reply", "overdue", "no_next_action", "due_today", "ready_untouched"] as const;
const ALARM = new Set(["waiting_reply", "overdue", "no_next_action"]);

export function Tiles({ metrics, active, onPick }: { metrics: Metrics; active?: string; onPick: (attention: string) => void }) {
  const a = metrics.activity;
  return (
    <div className="grid grid-cols-2 gap-2 @md:grid-cols-3 @3xl:grid-cols-6">
      {TILE_KEYS.map((k) => {
        const n = metrics.checks[k];
        const alarm = ALARM.has(k) && n > 0;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onPick(active === k ? "" : k)}
            aria-pressed={active === k}
            className={cn(
              "flex flex-col items-start rounded-md border bg-card px-3 py-2 text-left transition-colors hover:bg-state-hover",
              alarm ? "border-destructive/50 shadow-[inset_3px_0_0_var(--mf-coral)]" : "border-border",
              active === k && "ring-1 ring-ring",
            )}
          >
            <span className={cn("text-2xl font-bold tabular-nums", alarm && "text-destructive")}>{n}</span>
            <span className="text-xs text-muted-foreground">{ATTENTION_LABEL[k]}</span>
          </button>
        );
      })}
      <div className="mf-kpi--volt flex flex-col items-start rounded-md border bg-card px-3 py-2">
        <span className="text-2xl font-bold tabular-nums">{a.positive_30d}</span>
        <span className="text-xs text-muted-foreground" title="Организации с ответом «интерес» или «прислали условия» за 30 дней">
          Позитивных ответов, 30 дн
        </span>
      </div>
    </div>
  );
}

// ---- queue ----

export function QueueView({ queue, onOpen }: { queue: Queue; onOpen: (id: string) => void }) {
  const groups = queue.groups.filter((g) => g.total > 0);
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">Очередь пуста: просроченных шагов и ответов без реакции нет.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <div key={g.key}>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className={cn("font-semibold", (g.key === "waiting_reply" || g.key === "overdue") && "text-destructive")}>{g.title}</span>
            <span className="text-muted-foreground">
              {g.items.length < g.total ? `${g.items.length} из ${g.total}` : g.total}
            </span>
          </div>
          <ul className="flex flex-col">
            {g.items.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => onOpen(it.id)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-state-hover"
                >
                  <PriorityBadge priority={it.priority} />
                  <span className="min-w-0 flex-1 truncate">{it.display_name}</span>
                  <span className="hidden flex-none text-xs text-muted-foreground @md:inline">{countryName(it.country_code)}</span>
                  <span className="max-w-[45%] flex-none truncate text-xs text-muted-foreground" title={it.reason}>
                    {it.reason}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---- funnel ----

export function Funnel({ metrics, active, onPick }: { metrics: Metrics; active: string[]; onPick: (status: string) => void }) {
  const max = Math.max(1, ...metrics.funnel.map((f) => f.count));
  const drop = metrics.dropoff;
  return (
    <div className="flex flex-col gap-1">
      {metrics.funnel.map((f) => (
        <button
          key={f.status}
          type="button"
          onClick={() => onPick(f.status)}
          className={cn("group flex items-center gap-2 rounded px-1 text-left text-xs hover:bg-state-hover", active.includes(f.status) && "bg-state-active")}
          title={f.count ? `Медиана в статусе: ${f.median_days_in_status} дн` : undefined}
        >
          <span className="w-32 flex-none truncate text-muted-foreground">{STATUS_LABEL[f.status] ?? f.status}</span>
          <span className="relative h-4 flex-1 rounded-sm bg-muted">
            <span className="absolute inset-y-0 left-0 rounded-sm bg-[var(--mf-teal)]" style={{ width: `${(f.count / max) * 100}%` }} />
          </span>
          <span className="w-8 flex-none text-right tabular-nums">{f.count}</span>
        </button>
      ))}
      {drop.length > 0 ? (
        <div className="mt-2 border-t border-border pt-2">
          <div className="mb-1 text-[11px] text-muted-foreground">Отток по причинам</div>
          {drop.map((d) => (
            <button
              key={`${d.status}-${d.reason_code}`}
              type="button"
              onClick={() => onPick(d.status)}
              className="flex w-full items-center gap-2 rounded px-1 text-left text-xs hover:bg-state-hover"
            >
              <span className="flex-1 truncate">
                {STATUS_LABEL[d.status]} · {REASON_LABEL[d.reason_code] ?? d.reason_code}
              </span>
              <span className="tabular-nums">{d.count}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---- regions ----

const STAGES: { key: string; label: string; statuses: string[]; cls: string }[] = [
  { key: "early", label: "до контакта", statuses: ["new", "to_qualify", "ready"], cls: "bg-muted-foreground/30" },
  { key: "work", label: "в работе", statuses: ["contacted", "replied", "qualified"], cls: "bg-[var(--mf-teal)]" },
  { key: "done", label: "передан", statuses: ["handed_over"], cls: "bg-[var(--mf-green)]" },
  { key: "out", label: "отказ / не писать", statuses: ["rejected", "do_not_contact"], cls: "bg-[var(--mf-coral)]" },
];

export function Regions({ metrics, active, onPick }: { metrics: Metrics; active: string; onPick: (region: string) => void }) {
  const max = Math.max(1, ...metrics.regions.map((r) => r.total));
  return (
    <div className="flex flex-col gap-1">
      {metrics.regions.map((r) => (
        <button
          key={r.region}
          type="button"
          onClick={() => onPick(active === r.region ? "" : r.region)}
          className={cn("flex items-center gap-2 rounded px-1 text-left text-xs hover:bg-state-hover", active === r.region && "bg-state-active")}
        >
          <span className="w-32 flex-none truncate text-muted-foreground">{regionLabel(r.region)}</span>
          <span className="flex h-4 flex-1 overflow-hidden rounded-sm bg-muted" style={{ maxWidth: `${(r.total / max) * 100}%` }}>
            {STAGES.map((s) => {
              const n = s.statuses.reduce((acc, st) => acc + (r.by_status[st] ?? 0), 0);
              return n ? <span key={s.key} className={s.cls} style={{ width: `${(n / r.total) * 100}%` }} title={`${s.label}: ${n}`} /> : null;
            })}
          </span>
          <span className="w-8 flex-none text-right tabular-nums">{r.total}</span>
        </button>
      ))}
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {STAGES.map((s) => (
          <span key={s.key} className="flex items-center gap-1">
            <span className={cn("inline-block size-2 rounded-sm", s.cls)} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---- aging ----

/** Bucket → filter (давность касания): the closest the registry filter can express. */
export function agingFilter(bucket: string): { stale_days?: number; never_touched?: boolean } {
  switch (bucket) {
    case "never":
      return { never_touched: true };
    case "d8_14":
      return { stale_days: 8, never_touched: false };
    case "d15_30":
      return { stale_days: 15, never_touched: false };
    case "d30p":
      return { stale_days: 31, never_touched: false };
  }
  return { never_touched: false };
}

export function Aging({ metrics, onPick }: { metrics: Metrics; onPick: (status: string, bucket: string) => void }) {
  const rows = metrics.aging.filter((r) => !["rejected", "do_not_contact", "handed_over"].includes(r.status));
  const max = Math.max(1, ...rows.flatMap((r) => AGING_ORDER.map((b) => r.buckets[b] ?? 0)));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Нет активных организаций.</p>;
  // На узком (панель, телефон) матрица прокручивается сама, не ломая виджет.
  return (
    <div className="overflow-x-auto">
    <table className="w-full min-w-[30rem] table-fixed text-xs">
      <thead>
        <tr className="text-muted-foreground">
          <th className="w-32 text-left font-normal">Статус</th>
          {AGING_ORDER.map((b) => (
            <th key={b} className="font-normal">
              {AGING_LABEL[b]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.status}>
            <td className="truncate pr-1 text-muted-foreground">{STATUS_LABEL[r.status]}</td>
            {AGING_ORDER.map((b) => {
              const n = r.buckets[b] ?? 0;
              const hot = (b === "d15_30" || b === "d30p") && n > 0 && r.status !== "new";
              return (
                <td key={b} className="p-0.5">
                  <button
                    type="button"
                    disabled={!n}
                    onClick={() => onPick(r.status, b)}
                    className={cn(
                      "h-7 w-full rounded-sm text-center tabular-nums disabled:cursor-default",
                      n ? "hover:ring-1 hover:ring-ring" : "text-muted-foreground/40",
                      hot && "text-destructive",
                    )}
                    style={n ? { backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round(8 + (n / max) * 40)}%, transparent)` } : undefined}
                  >
                    {n || "·"}
                  </button>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

// ---- quality and activity ----

export function Quality({ metrics, onPick }: { metrics: Metrics; onPick: (f: Record<string, unknown>) => void }) {
  const q = metrics.quality;
  const a = metrics.activity;
  const row = (label: string, value: ReactNode, f?: Record<string, unknown>, warn = false) => (
    <button
      type="button"
      disabled={!f}
      onClick={() => f && onPick(f)}
      className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-state-hover disabled:hover:bg-transparent"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", warn && "text-destructive")}>{value}</span>
    </button>
  );
  return (
    <div className="grid gap-3 @md:grid-cols-2">
      <div>
        <div className="mb-1 flex gap-1">
          {["1", "2", "3", "4", "5"].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPick({ priorities: [Number(p)] })}
              className="flex flex-1 flex-col items-center rounded-md border border-border py-1 text-xs hover:bg-state-hover"
            >
              <span className="font-semibold">P{p}</span>
              <span className="tabular-nums text-muted-foreground">{q.by_priority[p] ?? 0}</span>
            </button>
          ))}
        </div>
        {row("С контактным лицом", rate(q.with_person, metrics.total), { has_person: true })}
        {row("Без контактного лица", metrics.total - q.with_person, { has_person: false })}
        {row("Только email бренда", q.brand_only, { brand: "only" })}
        {row("Без каналов связи", q.no_channels, undefined, q.no_channels > 0)}
        {row("Неверные / недоставленные каналы", q.invalid_contacts, undefined, q.invalid_contacts > 0)}
        {row("Активные без ответственного", q.unassigned, { owner: "none" })}
      </div>
      <div>
        {row("Касаний за 7 дней: мы → они", a.touches_out_7d)}
        {row("Касаний за 7 дней: они → мы", a.touches_in_7d)}
        {row("Организаций, которым писали", a.touched, { never_touched: false })}
        {row("Ответили", rate(a.replied, a.touched))}
        {row("Позитивные ответы, 30 дн", rate(a.positive_30d, a.touched))}
        {row("До первого касания (медиана)", a.median_days_to_first >= 0 ? `${a.median_days_to_first} дн` : "нет данных")}
      </div>
    </div>
  );
}

// ---- feed ----

function feedText(it: FeedItem): string {
  if (it.entity === "interaction") return it.new_value ? `касание: ${it.new_value}` : `касание удалено`;
  if (it.entity === "next_action") {
    if (it.field === "done") return `шаг закрыт: ${it.new_value}`;
    return `шаг: ${it.new_value || "—"}`;
  }
  const label = FIELD_LABEL[it.field] ?? it.field;
  return `${label}: ${fieldValue(it.field, it.old_value)} → ${fieldValue(it.field, it.new_value)}`;
}

export function Feed({ items, seenAt, onOpen }: { items: FeedItem[]; seenAt: string | null; onOpen: (id: string) => void }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{seenAt ? "С прошлого визита изменений нет." : "Изменений за неделю нет."}</p>;
  }
  return (
    <ul className="flex flex-col">
      {items.map((it) => (
        <li key={it.id}>
          <button
            type="button"
            onClick={() => onOpen(it.company_id)}
            className="flex w-full flex-col rounded-md px-1.5 py-1 text-left text-xs hover:bg-state-hover"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium">{it.company_name}</span>
              <span className="flex-none text-muted-foreground">{formatDateTime(it.at)}</span>
            </span>
            <span className="truncate text-muted-foreground">
              {feedText(it)} · {actorLabel(it.actor)}
              {it.batch_id ? " · пачка" : ""}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

