// Вкладка «Карточка» правой панели: организация из subPath страницы.
// Те же данные, что карточка Manifest; правка — при outreach.manage.
// Изменения агента приходят событием «company changed» и видны сразу.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorText, useCompanyChanged, useStatus, useTool } from "./hooks";
import {
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
} from "./labels";
import { Note, PriorityBadge } from "./RegistryList";
import type { Card } from "./types";

export function CardTab({ subPath }: PluginNavPanelProps) {
  const companyId = subPath.split("/")[0] ?? "";
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
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-3 py-3 text-sm">
      <h2 className="text-base font-semibold">{c.display_name}</h2>
      <p className="text-xs text-muted-foreground">
        {KIND_LABEL[c.kind] ?? c.kind} · {countryName(c.country_code)} · {regionLabel(c.region)}
      </p>
      {error && (
        <p role="alert" className="mt-2 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive">
          {error}
        </p>
      )}

      <Section title="Работа">
        <div className="flex items-center gap-2">
          <PriorityBadge priority={c.priority} manual={c.priority_manual != null} />
          <span className="text-xs text-muted-foreground">
            авто P{c.priority_auto}: {PRIORITY_REASON_LABEL[c.priority_reason] ?? c.priority_reason}
          </span>
        </div>
        {canEdit ? (
          <div className="mt-2 grid gap-2">
            <Labeled label="Ручной приоритет">
              <select
                className={selectCls}
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
                <option value="">Автоматически</option>
                {[1, 2, 3, 4, 5].map((p) => (
                  <option key={p} value={p}>P{p}</option>
                ))}
              </select>
            </Labeled>
            <StatusEditor status={c.status} reason={c.status_reason} busy={busy}
              onSave={(status, reason) => run("outreach_update_company", { id: c.id, status, status_reason: reason, expected_updated_at: c.updated_at })} />
          </div>
        ) : (
          <p className="mt-1">Статус: {STATUS_LABEL[c.status] ?? c.status}</p>
        )}
        {c.status_reason && <p className="text-xs text-muted-foreground">Причина: {c.status_reason}</p>}
        {c.do_not_contact && <p className="text-xs text-destructive">Не связываться{c.do_not_contact_reason ? `: ${c.do_not_contact_reason}` : ""}</p>}
      </Section>

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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-3 border-t border-border pt-2">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
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
