// Вкладка «Карточка» правой панели: организация из subPath страницы.
// Те же данные, что карточка Manifest; правка — при outreach.manage.
// Изменения агента приходят событием «company changed» и видны сразу.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorText, useCompanyChanged, useStatus, useTool } from "./hooks";
import {
  ACTION_LABEL,
  CHANNEL_LABEL,
  OUTCOME_LABEL,
  daysUntil,
  formatDate,
  CONTACT_TYPES,
  CONTACT_TYPE_LABEL,
  KIND_LABEL,
  PRIORITY_REASON_LABEL,
  STATUS_LABEL,
  STATUS_NEEDS_REASON,
  STATUS_ORDER,
  actorLabel,
  countryName,
  formatDateTime,
  regionLabel,
  ROLE_LABEL,
  ROLE_ORDER,
} from "./labels";
import { Note, PriorityBadge } from "./RegistryList";
import type { Card } from "./types";
import { CompanyMail } from "./mail/CompanyMail";
import { Badge, COMPANY_STATUS_TONE, ConfirmCard, KindLabel, ModeBadge } from "./manifest";

export function CardTab({ subPath }: PluginNavPanelProps) {
  return <CardView companyId={subPath.split("/")[0] ?? ""} />;
}

/** The card of one organisation (the «Карточка» tab of the outreach page and of the dashboard). */
/** embedded — inside the object panel: its header already names the organisation. */
export function CardView({ companyId, header, embedded }: { companyId: string; header?: ReactNode; embedded?: boolean }) {
  const { status } = useStatus();
  const tool = useTool();
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      setCard(await tool<Card>("outreach_get_company", { id: companyId }));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [companyId, tool]);
  useEffect(() => {
    setCard(null);
    if (status?.connected && status.canView) void load();
  }, [load, status?.connected, status?.canView]);
  useCompanyChanged((id) => {
    if (id === companyId) void load();
  });

  /** Runs a write tool; the result is the fresh card. */
  const run = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        setCard(await tool<Card>(name, args));
        return true;
      } catch (e) {
        setError(errorText(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [tool],
  );

  if (!companyId) return <Note>Выберите организацию в реестре слева.</Note>;
  if (status && !status.connected) return <Note>{status.message}</Note>;
  if (status && !status.canView) return <Note>Нет доступа к реестру (outreach.view).</Note>;
  if (!card) return <Note>{error ? `Не удалось загрузить: ${error}` : "Загружаем карточку…"}</Note>;

  const c = card.company;
  const canEdit = !!status?.canManage;
  const persons = new Map(card.persons.map((p) => [p.id, p.full_name]));

  return (
    <div className="@container mf-root mf-island mf-paper flex h-full min-h-0 flex-col gap-2 overflow-y-auto px-3 py-3 text-sm">
      {header}
      <div className="flex flex-col gap-1">
        {embedded ? null : (
          <>
            <KindLabel>Организация</KindLabel>
            <h2 className="m-0 text-base font-bold leading-snug">{c.display_name}</h2>
          </>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge tone={COMPANY_STATUS_TONE[c.status] ?? "muted"}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
          {c.roles?.includes("supplier") ? <Badge tone={c.supplier_active === false ? "muted" : "ok"}>поставщик{c.supplier_active === false ? " · неактивен" : ""}</Badge> : null}
          <span>
            {KIND_LABEL[c.kind] ?? c.kind} · {countryName(c.country_code)} · {regionLabel(c.region)}
          </span>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-background px-2 py-1 text-xs text-destructive">
          {error}
        </p>
      )}

      <Section title="Работа">
        {canEdit ? (
          // Priority and status in one row; two rows only in a narrow panel.
          <div className="@container">
          <div className="grid gap-2 @[26rem]:grid-cols-2">
            <Labeled label="Приоритет">
              <span className="flex items-center gap-1.5" title={`авто P${c.priority_auto}: ${PRIORITY_REASON_LABEL[c.priority_reason] ?? c.priority_reason}`}>
              <PriorityBadge priority={c.priority} manual={c.priority_manual != null} />
              <select
                className={`${selectCls} min-w-0 flex-1`}
                value={c.priority_manual ?? ""}
                disabled={busy}
                onChange={(e) =>
                  void run(
                    "outreach_update_company",
                    e.target.value
                      ? { id: c.id, priority_manual: Number(e.target.value), expected_updated_at: c.updated_at }
                      : { id: c.id, clear_priority_manual: true, expected_updated_at: c.updated_at },
                  )
                }
              >
                <option value="">Авто · P{c.priority_auto}</option>
                {[1, 2, 3, 4, 5].map((p) => (
                  <option key={p} value={p}>P{p} вручную</option>
                ))}
              </select>
              </span>
            </Labeled>
            <StatusEditor status={c.status} reason={c.status_reason} busy={busy}
              onSave={(status, reason) => run("outreach_update_company", { id: c.id, status, status_reason: reason, expected_updated_at: c.updated_at })} />
          </div>
          </div>
        ) : (
          <p className="flex items-center gap-2" title={`авто P${c.priority_auto}: ${PRIORITY_REASON_LABEL[c.priority_reason] ?? c.priority_reason}`}>
            <PriorityBadge priority={c.priority} manual={c.priority_manual != null} />
            {STATUS_LABEL[c.status] ?? c.status}
          </p>
        )}
        {canEdit && c.roles ? (
          <RolesEditor roles={c.roles} currency={c.supplier_currency ?? "INR"} active={c.supplier_active !== false} busy={busy}
            onSave={(patch) => run("outreach_update_company", { id: c.id, ...patch, expected_updated_at: c.updated_at })} />
        ) : null}
        {c.status_reason && <p className="text-xs text-muted-foreground">Причина: {c.status_reason}</p>}
        {c.do_not_contact && <p className="text-xs text-destructive">Не связываться{c.do_not_contact_reason ? `: ${c.do_not_contact_reason}` : ""}</p>}
      </Section>

      {card.interactions !== undefined ? (
        <Section title="Шаг и касания">
          <WorkBlock card={card} canEdit={canEdit} busy={busy} run={run} />
        </Section>
      ) : null}

      {status?.canMail ? (
        <Section title="Почта">
          <CompanyMail key={c.id} companyId={c.id} />
        </Section>
      ) : null}

      <Section title="Реквизиты">
        <Requisites card={card} canEdit={canEdit} busy={busy} run={run} />
      </Section>

      <Section title={`Страны (${card.countries.length})`}>
        <ul className="text-xs">
          {card.countries.map((cc) => (
            <li key={cc.id}>
              {countryName(cc.country_code)}
              {cc.is_primary ? " · основная" : ""}
              <span className="text-muted-foreground"> · «{cc.country_title}»{cc.section_label ? ` / ${cc.section_label}` : ""}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`Каналы связи (${card.contacts.length})`}>
        <ul className="flex flex-col gap-1">
          {card.contacts.map((ct) => (
            <li key={ct.id} className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="text-xs text-muted-foreground">{CONTACT_TYPE_LABEL[ct.type] ?? ct.type} </span>
                <span className="break-all">{ct.value_raw}</span>
                {ct.is_brand_domain && <span className="text-xs text-muted-foreground"> · домен бренда</span>}
                {ct.person_id && <span className="text-xs text-muted-foreground"> · {persons.get(ct.person_id)}</span>}
              </span>
              {canEdit && (
                <ConfirmButton busy={busy} label="Удалить канал" onConfirm={() => run("outreach_delete_contact", { company_id: c.id, contact_id: ct.id })} />
              )}
            </li>
          ))}
        </ul>
        {canEdit && <AddContact busy={busy} onAdd={(type, value) => run("outreach_save_contact", { company_id: c.id, type, value_raw: value })} />}
      </Section>

      <Section title={`Контактные лица (${card.persons.length})`}>
        <ul className="flex flex-col gap-1">
          {card.persons.map((p) => (
            <li key={p.id}>
              <span className="font-medium">{[p.salutation, p.full_name].filter(Boolean).join(" ")}</span>
              {p.position && <span className="text-xs text-muted-foreground"> · {p.position}</span>}
            </li>
          ))}
        </ul>
        {canEdit && <AddPerson busy={busy} onAdd={(name, position) => run("outreach_save_person", { company_id: c.id, full_name: name, position })} />}
      </Section>

      <Section title={`Комментарии (${card.comments.length})`}>
        {canEdit && <AddComment busy={busy} onAdd={(body) => run("outreach_add_comment", { company_id: c.id, body })} />}
        <ul className="mt-2 flex flex-col gap-2">
          {card.comments.map((cm) => (
            <li key={cm.id}>
              <div className="text-[11px] text-muted-foreground">
                {cm.pinned ? "📌 " : ""}
                {cm.author} · {formatDateTime(cm.created_at)}
              </div>
              <div className="whitespace-pre-wrap">{cm.body}</div>
            </li>
          ))}
        </ul>
      </Section>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold">История правок ({card.changes.length})</summary>
        <ul className="mt-2 flex flex-col gap-1 text-xs">
          {card.changes.map((ch) => (
            <li key={ch.id}>
              <span className="text-muted-foreground">{formatDateTime(ch.at)} · {actorLabel(ch.actor)}</span>
              <div>
                {ch.field}: {ch.old_value || "—"} → {ch.new_value || "—"}
              </div>
            </li>
          ))}
        </ul>
      </details>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm font-semibold">Исходные данные</summary>
        {card.sources.map((s) => (
          <pre key={s.id} className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-[11px]">{s.raw_text}</pre>
        ))}
      </details>
    </div>
  );
}

const selectCls = "h-8 rounded-md border border-input bg-background px-2 text-xs";

/**
 * Roles (ADR-051): one card for the whole funnel — a candidate becomes a supplier of
 * procurement by a role; supplier fields (currency, active) show with the role.
 */
function RolesEditor({ roles, currency, active, busy, onSave }: {
  roles: string[];
  currency: string;
  active: boolean;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => unknown;
}) {
  const toggle = (r: string) => {
    const next = roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r];
    if (next.length > 0) void onSave({ roles: next });
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" aria-label="Роли организации">
      {ROLE_ORDER.map((r) => (
        <label key={r} className="flex items-center gap-1.5">
          <input type="checkbox" checked={roles.includes(r)} disabled={busy || (roles.length === 1 && roles.includes(r))} onChange={() => toggle(r)} />
          {ROLE_LABEL[r]}
        </label>
      ))}
      {roles.includes("supplier") ? (
        <>
          <label className="flex items-center gap-1.5">
            Валюта
            <select className={selectCls} value={currency} disabled={busy} onChange={(e) => void onSave({ supplier_currency: e.target.value })}>
              {["INR", "USD", "EUR", "AED", "CNY", "KZT", "RUB"].map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5" title="Неактивный поставщик не получает новых позиций; его ссылки на портал отключаются">
            <input type="checkbox" checked={active} disabled={busy} onChange={() => void onSave({ supplier_active: !active })} />
            активен
          </label>
        </>
      ) : null}
    </div>
  );
}

/** Следующий шаг, ответственный и касания (W-15). Правка — при outreach.manage. */
function WorkBlock({
  card,
  canEdit,
  busy,
  run,
}: {
  card: Card;
  canEdit: boolean;
  busy: boolean;
  run: (name: string, args: Record<string, unknown>) => Promise<boolean>;
}) {
  const c = card.company;
  const na = card.next_action ?? null;
  const [touch, setTouch] = useState<{ channel: string; direction: string; outcome: string; summary: string } | null>(null);
  const days = na ? daysUntil(na.due_on) : 0;
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div>
        <span className="text-muted-foreground">Следующий шаг: </span>
        {na ? (
          <span className={days < 0 ? "text-destructive" : undefined}>
            {ACTION_LABEL[na.action] ?? na.action}
            {na.note ? ` · ${na.note}` : ""} · до {formatDate(na.due_on)}
            {days < 0 ? ` (просрочено на ${-days} дн)` : ""}
            {na.auto ? <span className="text-muted-foreground"> · по шаблону</span> : null}
          </span>
        ) : (
          <span className="text-muted-foreground">нет</span>
        )}
        {na && canEdit ? (
          <button type="button" disabled={busy} className="ml-2 underline-offset-2 hover:underline"
            onClick={() => void run("outreach_complete_next_action", { company_id: c.id, note: "выполнено" })}>
            выполнено
          </button>
        ) : null}
      </div>
      <div>
        <span className="text-muted-foreground">Ответственный: </span>
        {c.owner || <span className="text-muted-foreground">не назначен</span>}
        {canEdit ? (
          <button type="button" disabled={busy} className="ml-2 underline-offset-2 hover:underline"
            onClick={() => void run("outreach_update_company", { id: c.id, owner: "me", expected_updated_at: c.updated_at })}>
            назначить на меня
          </button>
        ) : null}
      </div>
      {canEdit && touch === null ? (
        <Button size="sm" variant="outline" className="mt-1 h-7 self-start"
          onClick={() => setTouch({ channel: "email", direction: "out", outcome: "", summary: "" })}>
          Записать касание
        </Button>
      ) : null}
      {touch ? (
        <div className="mt-1 grid gap-1.5 rounded-md border border-border p-2">
          <div className="flex gap-1.5">
            <select className={selectCls} value={touch.direction} onChange={(e) => setTouch({ ...touch, direction: e.target.value })}>
              <option value="out">Мы → им</option>
              <option value="in">Они → нам</option>
            </select>
            <select className={selectCls} value={touch.channel} onChange={(e) => setTouch({ ...touch, channel: e.target.value })}>
              {Object.entries(CHANNEL_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select className={selectCls} value={touch.outcome} onChange={(e) => setTouch({ ...touch, outcome: e.target.value })}>
              <option value="">Исход…</option>
              {Object.entries(OUTCOME_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <Input className="h-7 text-xs" placeholder="Кратко о чём" value={touch.summary}
            onChange={(e) => setTouch({ ...touch, summary: e.target.value })} />
          <div className="flex gap-1.5">
            <Button size="sm" className="h-7" disabled={busy}
              onClick={async () => {
                const ok = await run("outreach_log_touch", { company_id: c.id, ...touch, outcome: touch.outcome || undefined, summary: touch.summary || undefined });
                if (ok) setTouch(null);
              }}>
              Записать
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setTouch(null)}>Отмена</Button>
          </div>
        </div>
      ) : null}
      {card.sandbox_traces ? <SandboxTraces companyId={c.id} canEdit={canEdit} busy={busy} run={run} /> : null}
      {(card.interactions ?? []).length > 0 ? (
        <ul className="mt-1 flex flex-col gap-1">
          {(card.interactions ?? []).slice(0, 10).map((x) => (
            <li key={x.id} className="rounded-md bg-muted/40 px-2 py-1">
              <div className="flex justify-between gap-2">
                <span>
                  {x.direction === "out" ? "→" : "←"} {CHANNEL_LABEL[x.channel] ?? x.channel}
                  {x.outcome ? ` · ${OUTCOME_LABEL[x.outcome] ?? x.outcome}` : ""}
                  {x.sandbox ? (
                    <>
                      {" "}
                      <ModeBadge sandbox />
                    </>
                  ) : null}
                </span>
                <span className="text-muted-foreground">{formatDateTime(x.occurred_at)}</span>
              </div>
              {x.summary ? <div className="text-muted-foreground">{x.summary}</div> : null}
              <div className="text-[11px] text-muted-foreground">{actorLabel(x.created_by)}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">Касаний ещё не было.</p>
      )}
    </div>
  );
}

/** Следы песочницы (W-20): тест прошёл по-настоящему — откатить его кнопкой. */
function SandboxTraces({ companyId, canEdit, busy, run }: { companyId: string; canEdit: boolean; busy: boolean; run: (name: string, args: Record<string, unknown>) => Promise<boolean> }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 rounded-md border border-[rgba(0,168,162,0.35)] bg-[rgba(0,168,162,0.06)] px-2 py-1">
      <span title="Касания, статус и шаг менялись как в бою, но письма никуда не уходили; в метрики не входят">
        <ModeBadge sandbox /> следы теста
      </span>
      {canEdit ? (
        confirm ? (
          <ConfirmCard
            title="Убрать следы песочницы?"
            actions={
              <>
                <Button size="sm" className="h-7" disabled={busy}
                  onClick={async () => {
                    if (await run("outreach_sandbox_rollback", { id: companyId })) setConfirm(false);
                  }}>
                  Убрать
                </Button>
                <Button size="sm" variant="ghost" className="h-7" disabled={busy} onClick={() => setConfirm(false)}>
                  Отмена
                </Button>
              </>
            }
          >
            <span>Касания песочницы удалятся; статус, шаг и отметки адресов вернутся, какими были до теста.</span>
          </ConfirmCard>
        ) : (
          <Button size="sm" variant="outline" className="h-7" onClick={() => setConfirm(true)}>
            Убрать следы
          </Button>
        )
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mf-card px-3 py-2">
      <h3 className="mb-1.5 text-[13px] font-bold">{title}</h3>
      {children}
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function StatusEditor({ status, busy, onSave }: { status: string; reason: string; busy: boolean; onSave: (s: string, r: string) => Promise<boolean> }) {
  const [next, setNext] = useState(status);
  const [why, setWhy] = useState("");
  useEffect(() => setNext(status), [status]);
  const needs = STATUS_NEEDS_REASON.includes(next);
  const changed = next !== status;
  return (
    <div className="flex flex-col gap-1">
      <Labeled label="Статус">
        <select className={selectCls} value={next} disabled={busy} onChange={(e) => setNext(e.target.value)}>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      </Labeled>
      {changed && (
        <>
          <Input value={why} onChange={(e) => setWhy(e.target.value)} placeholder={needs ? "Причина (обязательно)" : "Причина (необязательно)"} className="h-8 text-xs" />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || (needs && !why.trim())}
              onClick={() => void onSave(next, why.trim()).then((ok) => ok && setWhy(""))}>
              Сменить статус
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNext(status)}>Отмена</Button>
          </div>
        </>
      )}
    </div>
  );
}

function Requisites({ card, canEdit, busy, run }: { card: Card; canEdit: boolean; busy: boolean; run: (n: string, a: Record<string, unknown>) => Promise<boolean> }) {
  const c = card.company;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ display_name: "", legal_name: "", city: "", address_raw: "", tags: "" });
  const start = () => {
    setDraft({ display_name: c.display_name, legal_name: c.legal_name, city: c.city, address_raw: c.address_raw, tags: c.tags.join(", ") });
    setEditing(true);
  };
  if (!editing) {
    return (
      <div className="flex flex-col gap-1">
        <Row k="Юр. название" v={c.legal_name} />
        <Row k="Город" v={c.city} />
        <Row k="Адрес" v={c.address_raw} pre />
        <Row k="Метки" v={c.tags.join(", ")} />
        {canEdit && <Button size="sm" variant="outline" className="mt-1 self-start" onClick={start}>Изменить</Button>}
      </div>
    );
  }
  const save = async () => {
    const body: Record<string, unknown> = { id: c.id, expected_updated_at: c.updated_at };
    if (draft.display_name !== c.display_name) body.display_name = draft.display_name;
    if (draft.legal_name !== c.legal_name) body.legal_name = draft.legal_name;
    if (draft.city !== c.city) body.city = draft.city;
    if (draft.address_raw !== c.address_raw) body.address_raw = draft.address_raw;
    const tags = draft.tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (tags.join(",") !== c.tags.join(",")) body.tags = tags;
    if (Object.keys(body).length === 2 || (await run("outreach_update_company", body))) setEditing(false);
  };
  return (
    <div className="flex flex-col gap-2">
      {(["display_name", "legal_name", "city", "tags"] as const).map((k) => (
        <Labeled key={k} label={{ display_name: "Название", legal_name: "Юр. название", city: "Город", tags: "Метки (через запятую)" }[k]}>
          <Input value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className="h-8 text-xs" />
        </Labeled>
      ))}
      <Labeled label="Адрес">
        <textarea value={draft.address_raw} rows={3} onChange={(e) => setDraft({ ...draft, address_raw: e.target.value })}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs" />
      </Labeled>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => void save()}>Сохранить</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Отмена</Button>
      </div>
    </div>
  );
}

function Row({ k, v, pre }: { k: string; v: string; pre?: boolean }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className={pre ? "whitespace-pre-wrap break-words" : "break-words"}>{v || "—"}</span>
    </div>
  );
}

function AddContact({ busy, onAdd }: { busy: boolean; onAdd: (type: string, value: string) => Promise<boolean> }) {
  const [type, setType] = useState("email");
  const [value, setValue] = useState("");
  return (
    <div className="mt-2 flex gap-1">
      <select className={selectCls} value={type} onChange={(e) => setType(e.target.value)} aria-label="Тип канала">
        {CONTACT_TYPES.map((t) => (
          <option key={t} value={t}>{CONTACT_TYPE_LABEL[t]}</option>
        ))}
      </select>
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Значение" className="h-8 text-xs" aria-label="Значение канала" />
      <Button size="sm" disabled={busy || !value.trim()} onClick={() => void onAdd(type, value.trim()).then((ok) => ok && setValue(""))}>+</Button>
    </div>
  );
}

function AddPerson({ busy, onAdd }: { busy: boolean; onAdd: (name: string, position: string) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  return (
    <div className="mt-2 flex gap-1">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" className="h-8 text-xs" aria-label="Имя" />
      <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Должность" className="h-8 text-xs" aria-label="Должность" />
      <Button size="sm" disabled={busy || !name.trim()}
        onClick={() => void onAdd(name.trim(), position.trim()).then((ok) => { if (ok) { setName(""); setPosition(""); } })}>+</Button>
    </div>
  );
}

function AddComment({ busy, onAdd }: { busy: boolean; onAdd: (body: string) => Promise<boolean> }) {
  const [body, setBody] = useState("");
  return (
    <div className="flex flex-col gap-1">
      <textarea value={body} rows={2} onChange={(e) => setBody(e.target.value)} placeholder="Комментарий" aria-label="Новый комментарий"
        className="rounded-md border border-input bg-background px-2 py-1 text-xs" />
      <Button size="sm" className="self-end" disabled={busy || !body.trim()} onClick={() => void onAdd(body.trim()).then((ok) => ok && setBody(""))}>
        Добавить
      </Button>
    </div>
  );
}

/** Двухшаговое удаление: «✕» → «Удалить?» → действие; без системных диалогов. */
function ConfirmButton({ busy, label, onConfirm }: { busy: boolean; label: string; onConfirm: () => Promise<boolean> }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <Button variant="destructive" size="sm" disabled={busy} onClick={() => void onConfirm().then(() => setArmed(false))}>
      Удалить?
    </Button>
  ) : (
    <Button variant="ghost" size="sm" disabled={busy} aria-label={label} onClick={() => setArmed(true)}>
      ✕
    </Button>
  );
}
