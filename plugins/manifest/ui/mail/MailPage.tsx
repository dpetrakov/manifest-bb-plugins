// Страница «Почта» плагина (W-16, EP-085, docs/outreach/mail.md): шаблоны,
// юрлица и отправители, неразобранные входящие. subPath: "" | "templates" |
// "entities" | "inbound" | "tpl/<id>" | "tpl/new". Токены шлюза задаются только в
// вебе Manifest. Отправка писем — следующая волна.
import { useCallback, useEffect, useState } from "react";
import { useBbNavigate, type PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
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
  MAIL_PATH,
  selectCls,
  type Inbound,
  type LegalEntity,
  type Template,
} from "./common";
import { TemplateEditor } from "./TemplateEditor";

const TABS: [string, string][] = [
  ["templates", "Шаблоны"],
  ["entities", "Юрлица и отправители"],
  ["inbound", "Неразобранные входящие"],
];

export function MailPage({ subPath }: PluginNavPanelProps) {
  const { status } = useStatus();
  const navigate = useBbNavigate();
  const [head, rest] = [subPath.split("/")[0] || "templates", subPath.split("/")[1] ?? ""];
  if (!status) return <Note>Подключаемся к Manifest…</Note>;
  if (!status.connected) return <Note>{status.message}</Note>;
  if (!status.canMail) return <Note>Почта появится после обновления Manifest: на сервере ещё нет почтового слоя.</Note>;
  if (head === "tpl") return <TemplateEditor key={rest} templateId={rest && rest !== "new" ? rest : null} />;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex gap-1 border-b border-border px-3">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => navigate.toPluginPanel(MAIL_PATH, { subPath: k })}
            className={cn("px-3 py-2 text-xs", head === k ? "border-b-2 border-foreground font-semibold" : "text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {head === "entities" ? <Entities /> : head === "inbound" ? <InboundList /> : <Templates />}
      </div>
    </div>
  );
}

// ---- templates ----

function Templates() {
  const tool = useTool();
  const navigate = useBbNavigate();
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
          <Button size="sm" className="h-8" onClick={() => navigate.toPluginPanel(MAIL_PATH, { subPath: "tpl/new" })}>
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
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {items.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => navigate.toPluginPanel(MAIL_PATH, { subPath: `tpl/${t.id}` })}
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-state-hover"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{t.name}</span>
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

// ---- legal entities and senders ----

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
        <section key={e.id} className="rounded-lg border border-border p-3">
          <header className="flex flex-wrap items-baseline gap-2">
            <h3 className="font-semibold">{e.name}</h3>
            <span className="text-xs text-muted-foreground">{e.subdomain}</span>
            {e.sandbox ? <span className="rounded-full border border-border px-1.5 text-[11px]">песочница</span> : null}
            <span className="flex-1" />
            <span className={cn("text-xs", e.health_ok ? "text-emerald-600" : "text-destructive")}>
              {e.health_ok == null ? "канал не проверялся" : e.health_ok ? "канал в порядке" : `канал: ${e.health_error || "ошибка"}`}
            </span>
            <Button size="sm" variant="ghost" className="h-7" disabled={busy || !canSettings} onClick={() => void run("mail_entity_health", { id: e.id })}>
              Проверить
            </Button>
          </header>
          {!e.ready ? <p className="mt-1 text-xs text-destructive">Не готово к отправке: {e.ready_problems.join(", ")}</p> : null}
          {e.quota ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Сегодня {e.quota.sent_today} из {e.quota.daily_limit} (прогрев {e.quota.warmup_stage}) · в очереди {e.quota.queue_depth}
              {e.quota.estimated_drain_at ? ` · очередь уйдёт к ${formatDateTime(e.quota.estimated_drain_at)}` : ""}
              {e.quota.paused ? ` · пауза: ${e.quota.pause_reason}` : ""}
            </p>
          ) : null}
          <ul className="mt-2 flex flex-col gap-1 text-xs">
            {e.senders.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="font-medium">{s.display_name}</span>
                <span className="text-muted-foreground">&lt;{s.address}&gt;</span>
                {s.registered_at ? (
                  <span className="text-emerald-600">зарегистрирован</span>
                ) : (
                  <span className="text-destructive" title={s.register_error}>
                    не зарегистрирован
                  </span>
                )}
              </li>
            ))}
          </ul>
          {canSettings ? <AddSender entity={e} busy={busy} onAdd={(local, name) => void run("mail_sender_save", { legal_entity_id: e.id, local_part: local, display_name: name })} /> : null}
        </section>
      ))}
      {defaults ? (
        <section className="rounded-lg border border-border p-3">
          <h3 className="mb-2 font-semibold">Отправитель по умолчанию</h3>
          <p className="mb-2 text-xs text-muted-foreground">Подставляется организации при первом письме и записывается в её карточку.</p>
          <div className="grid gap-2 text-xs sm:grid-cols-2">
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
    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border text-sm">
      {error ? <li className="px-3 py-1 text-xs text-destructive">{error}</li> : null}
      {items.map((x) => (
        <li key={x.id} className="px-3 py-2">
          <button type="button" className="flex w-full flex-col text-left" onClick={() => setOpen(open === x.id ? null : x.id)}>
            <span className="flex justify-between gap-2 text-xs">
              <span className="truncate font-medium">
                {x.from_name ? `${x.from_name} <${x.from_address}>` : x.from_address}
              </span>
              <span className="flex-none text-muted-foreground">
                {INBOUND_KIND_LABEL[x.kind] ?? x.kind} · {formatDateTime(x.received_at)}
              </span>
            </span>
            <span className="truncate text-xs">{x.subject}</span>
          </button>
          {open === x.id ? (
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-[11px] text-muted-foreground">Внешнее письмо: текст показан как есть, ссылки и вложения не открываются автоматически.</p>
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-sans text-xs">{x.reply_text || x.body_text}</pre>
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
