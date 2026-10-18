// Редактор шаблона письма в плагине (W-16, EP-085, docs/outreach/mail.md §6–§7):
// слева — поля шаблона, палитра подстановок и предпросмотр («Шаблон» / «Письмо
// для …»), справа — чат с агентом. Черновик живёт в метке треда темы шаблона:
// агент правит его инструментом, правки видны сразу; сохраняет шаблон человек.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ThreadChat,
  experimental_NewThreadComposer,
  useBbNavigate,
  useRealtime,
  useRpc,
  useSdk,
} from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Draft, rpcContract } from "../../server";
import { errorText, useStatus, useTool } from "../hooks";
import { Note } from "../RegistryList";
import {
  AUDIENCE_LABEL,
  CompanyPicker,
  Field,
  HtmlFrame,
  KIND_LABEL,
  MAIL_PATH,
  areaCls,
  selectCls,
  type Preview,
  type Template,
} from "./common";

const NewThreadComposer = experimental_NewThreadComposer;
const TEMPLATE_DRAFT = "manifest-template-draft";

const EMPTY: Draft = { name: "", audience: "potential_supplier", language: "en", kind: "first", subject: "", body: "" };

/** Подсветка подстановок в сыром шаблоне. */
function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(\{\{[^}]*\}\})/g);
  return (
    <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-2 font-sans text-xs">
      {parts.map((p, i) =>
        p.startsWith("{{") ? (
          <span key={i} className="rounded bg-primary/15 px-0.5 text-primary">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </pre>
  );
}

export function TemplateEditor({ templateId }: { templateId: string | null }) {
  const tool = useTool();
  const rpc = useRpc<typeof rpcContract>();
  const sdk = useSdk();
  const navigate = useBbNavigate();
  const { status } = useStatus();
  const [tpl, setTpl] = useState<Template | null>(null);
  const [draft, setDraftLocal] = useState<Draft>(EMPTY);
  const [threadId, setThreadId] = useState<string | null | undefined>(undefined);
  const [fields, setFields] = useState<{ path: string; title: string }[]>([]);
  const [tab, setTab] = useState<"template" | "letter">("template");
  const [company, setCompany] = useState<{ id: string; name: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const canManage = !!status?.canManage;

  // Шаблон, его тема-тред и подстановки. Черновик темы накладывается только
  // после загрузки шаблона, иначе поздний ответ шаблона затёр бы его.
  useEffect(() => {
    let alive = true;
    setError(null);
    tool<{ fields: { path: string; title: string }[] }>("mail_fields", {}).then((r) => alive && setFields(r.fields), () => undefined);
    if (!templateId) {
      setTpl(null);
      setDraftLocal(EMPTY);
      setThreadId(null);
      return;
    }
    void (async () => {
      try {
        const t = await tool<Template>("mail_template_get", { id: templateId });
        if (!alive) return;
        setTpl(t);
        setDraftLocal({ name: t.name, audience: t.audience, language: t.language, kind: t.kind, subject: t.subject, body: t.body });
        const { threadId: th } = await rpc.call("template_thread_get", { templateId }).catch(() => ({ threadId: null }));
        if (!alive) return;
        setThreadId(th);
        if (!th) return;
        const r = await rpc.call("draft_get", { threadId: th }).catch(() => null);
        if (alive && r && (r.draft.subject !== undefined || r.draft.body !== undefined)) setDraftLocal((d) => ({ ...d, ...r.draft }));
      } catch (e) {
        if (alive) setError(errorText(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [rpc, templateId, tool]);

  // Правки агента приходят сигналом: только изменённые поля, своё эхо пропускаем.
  const clientId = useMemo(() => `ed-${Math.random().toString(36).slice(2, 10)}`, []);
  const pending = useRef<Draft>({});
  useRealtime(TEMPLATE_DRAFT, (payload) => {
    const p = payload as { threadId?: unknown; patch?: unknown; source?: unknown } | null;
    if (!threadId || p?.threadId !== threadId || p.source === clientId || !p.patch || typeof p.patch !== "object") return;
    const patch = p.patch as Draft;
    for (const k of Object.keys(patch) as (keyof Draft)[]) delete pending.current[k];
    setDraftLocal((d) => ({ ...d, ...patch }));
  });

  // Правка руками: локально сразу, в метку треда — накопленные поля с задержкой.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edit = useCallback(
    (patch: Draft) => {
      setDraftLocal((d) => ({ ...d, ...patch }));
      setSaved(null);
      if (!threadId) return;
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const draft = pending.current;
        pending.current = {};
        if (Object.keys(draft).length) void rpc.call("draft_set", { threadId, draft, source: clientId });
      }, 600);
    },
    [clientId, rpc, threadId],
  );

  // Предпросмотр «Письмо для …».
  useEffect(() => {
    if (tab !== "letter") return;
    const t = setTimeout(() => {
      tool<Preview>("mail_preview", { subject: draft.subject ?? "", body: draft.body ?? "", company_id: company?.id }).then(
        (p) => setPreview(p),
        (e: unknown) => setError(errorText(e)),
      );
    }, 400);
    return () => clearTimeout(t);
  }, [company?.id, draft.body, draft.subject, tab, tool]);

  const insert = (path: string) => {
    const el = bodyRef.current;
    const token = `{{${path}}}`;
    const body = draft.body ?? "";
    if (!el) return edit({ body: body + token });
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    edit({ body: body.slice(0, start) + token + body.slice(end) });
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    });
  };

  const save = async (asNew: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const name = asNew && tpl && draft.name === tpl.name ? `${draft.name} (копия)` : draft.name;
      const t = await tool<Template>("mail_template_save", { ...(asNew || !tpl ? {} : { id: tpl.id }), ...draft, name });
      setTpl(t);
      setDraftLocal((d) => ({ ...d, name: t.name }));
      setSaved(`Сохранено: версия ${t.current_version}`);
      if (threadId && (asNew || !templateId)) await rpc.call("template_thread_link", { templateId: t.id, threadId });
      if (t.id !== templateId) navigate.toPluginPanel(MAIL_PATH, { subPath: `tpl/${t.id}`, replace: true });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const startChat = useCallback(
    async (request: Parameters<typeof sdk.threads.spawn>[0]) => {
      try {
        const { sectionId } = await rpc.call("section_ensure", null);
        const thread = await sdk.threads.spawn({
          ...request,
          title: `Шаблон: ${draft.name || "новый"}`.slice(0, 120),
          pluginMetadata: { kind: "template", templateId: templateId ?? null, draft },
          ...(sectionId ? { sectionId } : {}),
        } as Parameters<typeof sdk.threads.spawn>[0]);
        if (templateId) await rpc.call("template_thread_link", { templateId, threadId: thread.id });
        setThreadId(thread.id);
      } catch (e) {
        setError(errorText(e));
      }
    },
    [draft, rpc, sdk, templateId],
  );

  if (templateId && !tpl && !error) return <Note>Загружаем шаблон…</Note>;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3 text-sm">
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => navigate.toPluginPanel(MAIL_PATH, { subPath: "templates" })}>
            ← Шаблоны
          </button>
          <span className="flex-1" />
          {saved ? <span className="text-xs text-muted-foreground">{saved}</span> : null}
          {canManage ? (
            <>
              <Button size="sm" className="h-8" disabled={busy || !draft.name || !draft.subject || !draft.body} onClick={() => void save(false)}>
                {tpl ? "Сохранить" : "Создать шаблон"}
              </Button>
              {tpl ? (
                <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => void save(true)}>
                  Сохранить как новый
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
        {error ? <p className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive">{error}</p> : null}
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="sm:col-span-4">
            <Field label="Название">
              <Input className="h-8 text-xs" value={draft.name ?? ""} onChange={(e) => edit({ name: e.target.value })} />
            </Field>
          </div>
          <Field label="Аудитория">
            <select className={selectCls} value={draft.audience} onChange={(e) => edit({ audience: e.target.value })}>
              {Object.entries(AUDIENCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Вид">
            <select className={selectCls} value={draft.kind} onChange={(e) => edit({ kind: e.target.value })}>
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Язык">
            <Input className="h-8 text-xs" value={draft.language ?? ""} onChange={(e) => edit({ language: e.target.value })} />
          </Field>
          <Field label="Версия">
            <span className="h-8 py-1.5 text-xs text-muted-foreground">{tpl ? `v${tpl.current_version} · ${tpl.updated_by}` : "новый"}</span>
          </Field>
        </div>
        <Field label="Тема">
          <Input className="h-8 text-xs" value={draft.subject ?? ""} onChange={(e) => edit({ subject: e.target.value })} />
        </Field>
        <Field label="Текст" hint="Абзацы — пустой строкой, списки «- », **жирный**, [текст](https://…). Подвал с реквизитами добавится сам. Чего может не быть у получателя — во фрагмент: [[ in {{company.city}}]] исчезнет без города; варианты: [[Dear {{person.name}}, || Dear Sir or Madam,]]; запасное: {{person.name | &quot;Sir or Madam&quot;}}.">
          <textarea ref={bodyRef} className={cn(areaCls, "min-h-56")} value={draft.body ?? ""} onChange={(e) => edit({ body: e.target.value })} />
        </Field>
        <div className="flex flex-wrap gap-1">
          {fields.map((f) => (
            <button
              key={f.path}
              type="button"
              title={f.title}
              onClick={() => insert(f.path)}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-state-hover"
            >
              {`{{${f.path}}}`}
            </button>
          ))}
        </div>
        <div className="flex gap-1 border-b border-border">
          {(["template", "letter"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn("px-3 py-1.5 text-xs", tab === k ? "border-b-2 border-foreground font-semibold" : "text-muted-foreground")}
            >
              {k === "template" ? "Шаблон" : `Письмо для ${company?.name ?? "…"}`}
            </button>
          ))}
        </div>
        {tab === "template" ? (
          <div className="flex flex-col gap-2">
            <Highlighted text={`Тема: ${draft.subject ?? ""}`} />
            <Highlighted text={draft.body ?? ""} />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <CompanyPicker value={company} onChange={setCompany} placeholder="Организация для предпросмотра (без неё — образец)" />
            {preview ? (
              <>
                <div className="text-xs text-muted-foreground">
                  От: {preview.from_name ? `${preview.from_name} <${preview.from}>` : "отправитель не задан"} · Кому: {preview.to || "—"}
                  {preview.sample ? " · образец" : ""}
                </div>
                <div className="text-sm font-medium">{preview.subject}</div>
                {preview.problems.length ? (
                  <ul className="text-xs text-destructive">
                    {preview.problems.map((p) => (
                      <li key={p}>• {p}</li>
                    ))}
                  </ul>
                ) : null}
                <HtmlFrame html={preview.html} className="h-80" />
              </>
            ) : (
              <Note>Собираем письмо…</Note>
            )}
          </div>
        )}
        {tpl?.versions && tpl.versions.length > 1 ? (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Версии ({tpl.versions.length})</summary>
            <ul className="mt-1 flex flex-col gap-1">
              {tpl.versions.map((v) => (
                <li key={v.version} className="flex items-center gap-2">
                  <span>v{v.version}</span>
                  <span className="text-muted-foreground">{v.created_by}</span>
                  <button type="button" className="underline-offset-2 hover:underline" onClick={() => edit({ subject: v.subject, body: v.body })}>
                    взять в черновик
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
      <aside className="flex w-[420px] flex-none flex-col border-l border-border">
        <div className="border-b border-border px-2 py-1.5 text-xs font-semibold">Чат по шаблону</div>
        {threadId ? (
          <div className="min-h-0 flex-1">
            <ThreadChat threadId={threadId} variant="full" layout="contained" />
          </div>
        ) : threadId === null ? (
          <div className="flex flex-1 flex-col justify-end gap-2 p-2">
            <p className="text-xs text-muted-foreground">
              Попросите агента: «напиши первое письмо дистрибьютору на английском», «сделай короче», «добавь вопрос про цены на цепи».
              Агент меняет черновик слева, сохраняете вы.
            </p>
            <NewThreadComposer
              draftKey={`manifest-template-${templateId ?? "new"}`}
              placeholder="Что сделать с шаблоном?"
              onSubmit={(request) => startChat(request as Parameters<typeof sdk.threads.spawn>[0])}
            />
          </div>
        ) : (
          <Note>Открываем чат…</Note>
        )}
      </aside>
    </div>
  );
}
