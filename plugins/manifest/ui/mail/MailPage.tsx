// «Почта аутрича» (W-16, EP-085, docs/outreach/mail.md; по приёмке W-20 — по модели
// рабочего места): почта — объект справа от чата, как дашборд и карточка. MailHub —
// вкладки шаблонов, рассылок, юрлиц и неразобранных входящих; клик по рассылке, шаблону
// открывает его чат (или экран нового треда BB) с объектом справа. Рейл открывает
// последний чат по почте или новый. Токены шлюза задаются только в вебе Manifest.
import { useCallback, useEffect, useState } from "react";
import type { PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { errorText, useStatus, useTool } from "../hooks";
import { formatDateTime } from "../labels";
import { Note } from "../RegistryList";
import {
  AUDIENCE_LABEL,
  CompanyPicker,
  INBOUND_KIND_LABEL,
  KIND_LABEL,
  selectCls,
  type Inbound,
  type LegalEntity,
  type Template,
} from "./common";
import { useOpenObject, useRailReturn } from "../workspace/state";
import { SectionTabs } from "../workspace/nav";
import type { Mailing } from "./common";
import { MAIL_HUB, OPEN_MAIL_TAB, takeMailTab } from "./hubTabs";
import { mailingLine } from "./send";
import { ModeBadge, Status, StatusDot } from "../manifest";

export const MAIL_TABS: readonly (readonly [string, string])[] = [
  ["templates", "Шаблоны"],
  ["mailings", "Рассылки"],
  ["entities", "Юрлица и отправители"],
  ["inbound", "Неразобранные входящие"],
];

/** The mail hub: in a chat's side panel or, as a fallback, on the whole page. */
export function MailHub({ initial = "mailings" }: { initial?: string }) {
  const { status } = useStatus();
  const [tab, setTab] = useState(() => {
    const asked = takeMailTab();
    return asked && MAIL_TABS.some(([k]) => k === asked) ? asked : initial;
  });
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<string>).detail;
      if (MAIL_TABS.some(([k]) => k === t)) {
        setTab(t);
        takeMailTab();
      }
    };
    window.addEventListener(OPEN_MAIL_TAB, on);
    return () => window.removeEventListener(OPEN_MAIL_TAB, on);
  }, []);
  if (!status) return <Note>Подключаемся к Manifest…</Note>;
  if (!status.connected) return <Note>{status.message}</Note>;
  if (!status.canMail) return <Note>Почта появится после обновления Manifest: на сервере ещё нет почтового слоя.</Note>;
  return (
    <div className="@container mf-root mf-island mf-paper flex h-full min-h-0 flex-col">
      <SectionTabs tabs={MAIL_TABS} active={tab} onSelect={setTab} label="Почта аутрича" />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "entities" ? <Entities /> : tab === "inbound" ? <InboundList /> : tab === "mailings" ? <Mailings /> : <Templates />}
      </div>
    </div>
  );
}

/** The mail hub as an object: its chats are indexed under mail/hub (server, compose link). */
export { MAIL_HUB, useOpenMailTab } from "./hubTabs";

/**
 * The «Почта аутрича» rail: the last mail chat or BB's New thread screen with the hub on
 * the right. Old links to an object (mailing/<id>, tpl/<id>, inbound/<id>) open its chat.
 * After «back» (a redirect a moment ago) the hub stays here.
 */
export function MailPage({ subPath }: PluginNavPanelProps) {
  const openObject = useOpenObject();
  const railReturn = useRailReturn();
  const [stay, setStay] = useState(false);
  const [head, rest] = [subPath.split("/")[0] || "", subPath.split("/")[1] ?? ""];
  useEffect(() => {
    if (head === "mailing" && rest) return void openObject({ kind: "mailing", id: rest, title: "" });
    if (head === "inbound" && rest) return void openObject({ kind: "inbound", id: rest, title: "" });
    if (head === "tpl") return void openObject({ kind: "template", id: rest && rest !== "new" ? rest : "", title: "" });
    void railReturn("mail").then((r) => {
      if (r === "stay") setStay(true);
      // No live hub chat in this window: the hub's last chat (any window) or a new one.
      else if (r === "none") void openObject(MAIL_HUB);
    });
  }, [head, openObject, railReturn, rest]);
  if (!stay) return <Note>Открываем почту…</Note>;
  return <MailHub initial={MAIL_TABS.some(([k]) => k === head) ? head : "mailings"} />;
}

// ---- templates ----

function Templates() {
  const tool = useTool();
  const openObject = useOpenObject();
  const { status } = useStatus();
  const [audience, setAudience] = useState("");
  const [items, setItems] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    tool<{ items: Template[] }>("mail_templates", { audience: audience || undefined }).then(
      (r) => setItems(r.items),
      (e: unknown) => setError(errorText(e)),
    );
  }, [audience, tool]);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2">
        <select className={selectCls} value={audience} onChange={(e) => setAudience(e.target.value)}>
          <option value="">Все аудитории</option>
          {Object.entries(AUDIENCE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <span className="flex-1" />
        {status?.canManage ? (
          <Button size="sm" className="h-8" onClick={() => void openObject({ kind: "template", id: "", title: "" })}>
            Новый шаблон
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {!items ? (
        <Note>Загружаем…</Note>
      ) : items.length === 0 ? (
        <Note>Шаблонов пока нет. Создайте первый — агент поможет с текстом.</Note>
      ) : (
        <ul className="@container flex flex-col divide-y divide-border mf-card overflow-hidden">
          {items.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => void openObject({ kind: "template", id: t.id, title: t.name })}
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-state-hover"
              >
                <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="min-w-0 font-medium">{t.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {AUDIENCE_LABEL[t.audience] ?? t.audience} · {KIND_LABEL[t.kind] ?? t.kind} · {t.language} · v{t.current_version}
                  </span>
                </span>
                <span className="truncate text-xs text-muted-foreground">{t.subject}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- mailings ----

const MAILING_STATE: Record<string, string> = { draft: "Черновик", sending: "Идёт", done: "Завершена", stopped: "Остановлена", sent: "Отправлена" };

function Mailings() {
  const tool = useTool();
  const openObject = useOpenObject();
  const [items, setItems] = useState<Mailing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    tool<{ items: Mailing[] }>("mail_mailings", {}).then(
      (r) => setItems(r.items),
      (e: unknown) => setError(errorText(e)),
    );
  }, [tool]);
  if (!items) return <Note>{error ?? "Загружаем…"}</Note>;
  if (items.length === 0) return <Note>Рассылок нет.</Note>;
  const n = (v: number | undefined) => (v ? v : <span className="text-muted-foreground">—</span>);
  return (
    <div className="@container mf-card overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-[var(--mf-surface-strong,#eef3f1)] text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-semibold">Рассылка</th>
            <th className="hidden px-2 py-2 font-semibold @[30rem]:table-cell">Состояние</th>
            <th className="hidden px-2 py-2 text-right font-semibold @[40rem]:table-cell" title="Получателей / готовых писем">Получ.</th>
            <th className="hidden px-2 py-2 text-right font-semibold @[40rem]:table-cell">Ушло</th>
            <th className="hidden px-2 py-2 text-right font-semibold @[48rem]:table-cell" title="В очереди шлюза">Очередь</th>
            <th className="hidden px-2 py-2 text-right font-semibold @[48rem]:table-cell" title="Недоставка, ошибка, дубль">Недост.</th>
            <th className="hidden px-2 py-2 text-right font-semibold @[40rem]:table-cell">Ответы</th>
            <th className="hidden px-3 py-2 font-semibold @[56rem]:table-cell">Обновлена</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => {
            const p = m.progress;
            const line = mailingLine(m);
            return (
              <tr key={m.id} className="cursor-pointer border-t border-border hover:bg-state-hover" onClick={() => void openObject({ kind: "mailing", id: m.id, title: m.name })}>
                <td className="max-w-0 px-3 py-2">
                  <div className="truncate font-medium">{m.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{m.template_name || "без шаблона"}</div>
                  {/* A narrow panel: the state and the counts under the name, not columns off the edge. */}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground @[40rem]:hidden">
                    <span className="@[30rem]:hidden">
                      <Status tone={line.tone}>{MAILING_STATE[m.state] ?? m.state}</Status>
                    </span>
                    <span>писем {p ? p.letters : m.total}</span>
                    <span>ушло {p?.sent ?? 0}</span>
                    {p?.failed ? <span className="text-destructive">недоставка {p.failed}</span> : null}
                    <span>ответов {p?.replies ?? 0}</span>
                  </div>
                </td>
                <td className="hidden whitespace-nowrap px-2 py-2 @[30rem]:table-cell">
                  <span className="inline-flex items-center gap-1.5">
                    <Status tone={line.tone}>{MAILING_STATE[m.state] ?? m.state}</Status>
                    <ModeBadge sandbox={m.mode === "sandbox" || m.mode === "mixed"} />
                  </span>
                </td>
                <td className="hidden px-2 py-2 text-right tabular-nums @[40rem]:table-cell">{p ? p.letters : m.total}</td>
                <td className="hidden px-2 py-2 text-right tabular-nums @[40rem]:table-cell">{n(p?.sent)}</td>
                <td className="hidden px-2 py-2 text-right tabular-nums @[48rem]:table-cell">{n(p?.in_channel)}</td>
                <td className="hidden px-2 py-2 text-right tabular-nums @[48rem]:table-cell">{p?.failed ? <span className="inline-flex items-center gap-1"><StatusDot tone="error" />{p.failed}</span> : n(0)}</td>
                <td className="hidden px-2 py-2 text-right tabular-nums @[40rem]:table-cell">{p?.replies ? <span className="mf-badge mf-badge--volt">{p.replies}</span> : n(0)}</td>
                <td className="hidden whitespace-nowrap px-3 py-2 text-muted-foreground @[56rem]:table-cell">{formatDateTime(m.updated_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---- legal entities and senders ----

/**
 * The signature ({{signature}}) and the footer of a legal entity — they go into every letter
 * sent under it. Placeholders ({{sender.name}}, {{legal.…}}) and the light markup of templates
 * work here too. Saving sends the whole entity: the server replaces it.
 */
function EntityTexts({ entity, canEdit, onSaved }: { entity: LegalEntity; canEdit: boolean; onSaved: () => void }) {
  const tool = useTool();
  const [signature, setSignature] = useState(entity.signature);
  const [footer, setFooter] = useState(entity.footer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setSignature(entity.signature);
    setFooter(entity.footer);
  }, [entity.signature, entity.footer]);
  const changed = signature !== entity.signature || footer !== entity.footer;
  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const { id, code, name, full_name, details, address, website, phone, subdomain, sandbox, language } = entity;
      await tool("mail_entity_save", { id, code, name, full_name, details, address, website, phone, subdomain, language, ...(sandbox ? { sandbox } : {}), signature, footer });
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const area = "min-h-[5.5rem] w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs disabled:opacity-70";
  return (
    <details className="mt-2 rounded-md border border-[var(--mf-line-300)] bg-[var(--mf-surface)] px-2 py-1.5 text-xs" open={changed || undefined}>
      <summary className="cursor-pointer select-none font-medium">Подпись и подвал писем</summary>
      <div className="mt-2 flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Подпись — вместо {"{{signature}}"} в тексте письма</span>
          <textarea className={area} value={signature} maxLength={2000} disabled={!canEdit || busy} onChange={(e) => setSignature(e.target.value)} aria-label="Подпись" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Подвал — добавляется под каждым письмом (реквизиты, отписка)</span>
          <textarea className={area} value={footer} maxLength={4000} disabled={!canEdit || busy} onChange={(e) => setFooter(e.target.value)} aria-label="Подвал" />
        </label>
        <p className="text-[11px] text-muted-foreground">
          Подстановки: {"{{sender.name}}"}, {"{{sender.email}}"}, {"{{legal.name}}"}, {"{{legal.address}}"}, {"{{legal.website}}"}, {"{{legal.phone}}"}; разметка — как в шаблоне (**жирный**, [текст](https://…)). Действует для всех писем этого юрлица.
        </p>
        {error ? <p role="alert" className="text-destructive">{error}</p> : null}
        {canEdit ? (
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-7" disabled={busy || !changed} onClick={() => void save()}>
              Сохранить
            </Button>
            {changed ? (
              <Button size="sm" variant="ghost" className="h-7" disabled={busy} onClick={() => { setSignature(entity.signature); setFooter(entity.footer); }}>
                Отменить
              </Button>
            ) : saved ? (
              <span className="text-[var(--mf-green)]">Сохранено</span>
            ) : null}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Менять может сотрудник с правом «Почта: настройки».</p>
        )}
      </div>
    </details>
  );
}

function Entities() {
  const tool = useTool();
  const { status } = useStatus();
  const [items, setItems] = useState<LegalEntity[] | null>(null);
  const [defaults, setDefaults] = useState<{ general: { legal_entity_id: string; sender_id: string }; audiences: Record<string, { legal_entity_id: string; sender_id: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canSettings = !!status?.canMailSettings;

  const load = useCallback(() => {
    tool<{ items: LegalEntity[] }>("mail_entities", {}).then((r) => setItems(r.items), (e: unknown) => setError(errorText(e)));
    tool<NonNullable<typeof defaults>>("mail_defaults", {}).then((d) => setDefaults(d), () => undefined);
  }, [tool]);
  useEffect(load, [load]);

  const run = async (name: string, args: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await tool(name, args);
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!items) return <Note>{error ?? "Загружаем…"}</Note>;
  const senders = items.flatMap((e) => e.senders.map((s) => ({ ...s, entity: e })));
  const pick = (value: string) => {
    const s = senders.find((x) => x.id === value);
    return s ? { legal_entity_id: s.legal_entity_id, sender_id: s.id } : { legal_entity_id: "", sender_id: "" };
  };
  const senderSelect = (current: string, onChange: (v: string) => void) => (
    <select className={selectCls} disabled={!canSettings || busy} value={current} onChange={(e) => onChange(e.target.value)}>
      <option value="">не задан</option>
      {senders.map((s) => (
        <option key={s.id} value={s.id}>
          {s.display_name} &lt;{s.address}&gt;
        </option>
      ))}
    </select>
  );

  return (
    <div className="flex flex-col gap-3 text-sm">
      {error ? <p className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive">{error}</p> : null}
      {items.length === 0 ? <Note>Юрлиц пока нет. Их заводит администратор в вебе Manifest («Аутрич → Почта»).</Note> : null}
      {items.map((e) => (
        <section key={e.id} className="mf-card overflow-hidden p-3">
          <header className="flex flex-wrap items-baseline gap-2">
            <h3 className="font-semibold">{e.name}</h3>
            <span className="text-xs text-muted-foreground">{e.subdomain}</span>
            <ModeBadge sandbox={e.sandbox} />
            <span className="flex-1" />
            <Status tone={e.health_ok == null ? "muted" : e.health_ok ? "ok" : "error"} className="text-xs">
              {e.health_ok == null ? "канал не проверялся" : e.health_ok ? "канал в порядке" : `канал: ${e.health_error || "ошибка"}`}
            </Status>
            <Button size="sm" variant="ghost" className="h-7" disabled={busy || !canSettings} onClick={() => void run("mail_entity_health", { id: e.id })}>
              Проверить
            </Button>
          </header>
          {!e.ready ? (
            <Status tone="error" className="mt-1 text-xs">
              Не готово к отправке: {e.ready_problems.join(", ")}
            </Status>
          ) : null}
          {e.quota ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Сегодня {e.quota.sent_today} из {e.quota.daily_limit} (прогрев {e.quota.warmup_stage}) · в очереди {e.quota.queue_depth}
              {e.quota.estimated_drain_at ? ` · очередь уйдёт к ${formatDateTime(e.quota.estimated_drain_at)}` : ""}
              {e.quota.paused ? ` · пауза: ${e.quota.pause_reason}` : ""}
            </p>
          ) : null}
          <ul className="mt-2 flex flex-col gap-1 text-xs">
            {e.senders.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-medium">{s.display_name}</span>
                <span className="text-muted-foreground">&lt;{s.address}&gt;</span>
                {s.registered_at ? (
                  <Status tone="ok">зарегистрирован</Status>
                ) : (
                  <Status tone="error" title={s.register_error}>
                    не зарегистрирован
                  </Status>
                )}
              </li>
            ))}
          </ul>
          {canSettings ? <AddSender entity={e} busy={busy} onAdd={(local, name) => void run("mail_sender_save", { legal_entity_id: e.id, local_part: local, display_name: name })} /> : null}
          <EntityTexts entity={e} canEdit={canSettings} onSaved={load} />
        </section>
      ))}
      {defaults ? (
        <section className="mf-card overflow-hidden p-3">
          <h3 className="mb-2 font-semibold">Отправитель по умолчанию</h3>
          <p className="mb-2 text-xs text-muted-foreground">Подставляется организации при первом письме и записывается в её карточку.</p>
          <div className="grid gap-2 text-xs @md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Общий</span>
              {senderSelect(defaults.general.sender_id, (v) => void run("mail_defaults_set", { ...defaults, general: pick(v) }))}
            </label>
            {Object.entries(AUDIENCE_LABEL).map(([k, label]) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="text-muted-foreground">{label}</span>
                {senderSelect(defaults.audiences[k]?.sender_id ?? "", (v) =>
                  void run("mail_defaults_set", { ...defaults, audiences: { ...defaults.audiences, [k]: pick(v) } }),
                )}
              </label>
            ))}
          </div>
        </section>
      ) : null}
      <p className="text-xs text-muted-foreground">Токены шлюза, реквизиты и подвал юрлица задаются в вебе Manifest.</p>
    </div>
  );
}

function AddSender({ entity, busy, onAdd }: { entity: LegalEntity; busy: boolean; onAdd: (local: string, name: string) => void }) {
  const [local, setLocal] = useState("");
  const [name, setName] = useState("");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
      <Input className="h-7 w-32 text-xs" placeholder="evgenii" value={local} onChange={(e) => setLocal(e.target.value)} />
      <span className="text-muted-foreground">@{entity.subdomain}</span>
      <Input className="h-7 w-44 text-xs" placeholder="Evgenii | MSG" value={name} onChange={(e) => setName(e.target.value)} />
      <Button
        size="sm"
        variant="outline"
        className="h-7"
        disabled={busy || !local || !name}
        onClick={() => {
          onAdd(local, name);
          setLocal("");
          setName("");
        }}
      >
        Добавить адрес
      </Button>
    </div>
  );
}

// ---- inbound ----

function InboundList() {
  const tool = useTool();
  const { status } = useStatus();
  const [items, setItems] = useState<Inbound[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    tool<{ items: Inbound[] }>("mail_inbound_list", { triage: "unlinked", limit: 100 }).then(
      (r) => setItems(r.items),
      (e: unknown) => setError(errorText(e)),
    );
  }, [tool]);
  useEffect(load, [load]);
  const act = async (name: string, args: Record<string, unknown>) => {
    try {
      await tool(name, args);
      setOpen(null);
      setTarget(null);
      load();
    } catch (e) {
      setError(errorText(e));
    }
  };
  if (!items) return <Note>{error ?? "Загружаем…"}</Note>;
  if (items.length === 0) return <Note>Неразобранных писем нет: все входящие привязаны к организациям.</Note>;
  return (
    <ul className="flex flex-col divide-y divide-border mf-card overflow-hidden text-sm">
      {error ? <li className="px-3 py-1 text-xs text-destructive">{error}</li> : null}
      {items.map((x) => (
        <li key={x.id} className="px-3 py-2">
          <button type="button" className="flex w-full flex-col text-left" onClick={() => setOpen(open === x.id ? null : x.id)}>
            <span className="flex justify-between gap-2 text-xs">
              <Status tone="warning" className="truncate font-medium">
                {x.from_name ? `${x.from_name} <${x.from_address}>` : x.from_address}
              </Status>
              <span className="flex-none text-muted-foreground">
                {INBOUND_KIND_LABEL[x.kind] ?? x.kind} · {formatDateTime(x.received_at)}
              </span>
            </span>
            <span className="truncate text-xs">{x.subject}</span>
          </button>
          {open === x.id ? (
            <div className="mt-2 flex flex-col gap-2">
              <pre title="Внешнее письмо: текст как есть, ссылки и вложения не открываются автоматически" className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-sans text-xs">{x.reply_text || x.body_text}</pre>
              {x.attachments.length ? <p className="text-xs text-muted-foreground">Вложения: {x.attachments.map((a) => a.filename).join(", ")}</p> : null}
              {status?.canManage ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-64">
                    <CompanyPicker value={target} onChange={setTarget} placeholder="Привязать к организации…" />
                  </div>
                  <Button size="sm" className="h-7" disabled={!target} onClick={() => void act("mail_inbound_link", { id: x.id, company_id: target?.id })}>
                    Привязать
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => void act("mail_inbound_mark", { id: x.id, triage: "spam" })}>
                    Спам
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => void act("mail_inbound_mark", { id: x.id, triage: "ignored" })}>
                    Игнорировать
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
