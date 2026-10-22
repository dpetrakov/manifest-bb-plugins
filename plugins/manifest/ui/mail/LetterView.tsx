// Письмо «как уйдёт» (W-17, EP-087, docs/outreach/mail.md §7): черновик организации,
// собранный тем же рендером, что пойдёт в шлюз, — от кого, кому, тема, HTML с подписью и
// подвалом, по какому шаблону и что мешает отправке. Используется директивой
// ::manifest-letter{company="…"} в чате и блоком «Почта» карточки.
import { useCallback, useEffect, useRef, useState } from "react";
import type { PluginMessageDirectiveProps } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { Status } from "../manifest";
import { errorText, useCompanyChanged, useStatus, useTool } from "../hooks";
import { formatDateTime } from "../labels";
import { HtmlFrame, type Letter, type Preview } from "./common";
import { AttachmentList } from "./attachments";

const NO_DRAFT = "нет черновика";

/** The open draft of an organisation; reloads when the organisation changes. */
export function useLetter(companyId: string) {
  const tool = useTool();
  const { status } = useStatus();
  const [letter, setLetter] = useState<Letter | null>(null);
  const [none, setNone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const load = useCallback(() => {
    if (!companyId || !status?.connected) return;
    const my = ++seq.current;
    tool<Letter>("mail_draft_get", { company_id: companyId }).then(
      (l) => {
        if (my !== seq.current) return;
        setLetter(l);
        setNone(false);
        setError(null);
      },
      (e: unknown) => {
        if (my !== seq.current) return;
        const text = errorText(e);
        if (text.includes(NO_DRAFT)) {
          setLetter(null);
          setNone(true);
          setError(null);
        } else setError(text);
      },
    );
  }, [companyId, status?.connected, tool]);
  useEffect(() => {
    setLetter(null);
    setNone(false);
    setError(null);
  }, [companyId]);
  useEffect(load, [load]);
  useCompanyChanged((id) => {
    if (id === companyId) load();
  });
  return { letter, none, error, reload: load, setLetter };
}

/** Height for the sandboxed frame: it can't be measured from outside. */
function frameHeight(text: string) {
  const lines = text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 90)), 0);
  return Math.min(900, 80 + lines * 21);
}

export function LetterView({ letter, compact }: { letter: Letter; compact?: boolean }) {
  const d = letter.draft;
  const caption = `${d.template_name ? `По шаблону «${d.template_name}»${d.template_version ? ` v${d.template_version}` : ""}` : "Без шаблона"}${
    d.edited ? " · изменён" : ""
  } · ${d.updated_by} · ${formatDateTime(d.updated_at)}`;
  return <PreviewCard preview={letter.preview} caption={caption} compact={compact} companyId={d.company_id} />;
}

/** One rendered letter: header, problems, HTML or text. */
export function PreviewCard({ preview: p, caption, compact, companyId }: { preview: Preview; caption?: string; compact?: boolean; companyId?: string }) {
  const [view, setView] = useState<"html" | "text">("html");
  return (
    <div className="mf-island mf-card flex flex-col gap-2 overflow-hidden p-0 text-xs">
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-b border-[var(--mf-line-200)] bg-[#fbfcfb] px-3 py-2">
        <dt className="text-muted-foreground">От</dt>
        <dd className="truncate">{p.from ? `${p.from_name} <${p.from}>` : <span className="text-destructive">не задан</span>}</dd>
        <dt className="text-muted-foreground">Кому</dt>
        <dd className="truncate">{p.to || <span className="text-destructive">нет email</span>}</dd>
        <dt className="text-muted-foreground">Тема</dt>
        <dd className="font-medium">{p.subject}</dd>
      </dl>
      <div className="flex flex-col gap-2 px-3 pb-3">
      {caption ? <p className="text-[11px] text-muted-foreground">{caption}</p> : null}
      {p.problems.length > 0 ? (
        <ul className="flex flex-col gap-0.5 rounded-md border border-[rgba(240,165,26,0.45)] bg-[rgba(240,165,26,0.08)] px-2 py-1">
          {p.problems.map((x) => (
            <li key={x}>
              <Status tone="warning">Не уйдёт: {x}</Status>
            </li>
          ))}
        </ul>
      ) : (
        <Status tone="ok">Готово к отправке: так письмо и уйдёт.</Status>
      )}
      {p.attachments?.length ? <AttachmentList sheets={p.attachments} companyId={companyId} /> : null}
      <div className="flex gap-1">
        {(["html", "text"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={cn("rounded-md px-2 py-0.5", view === v ? "bg-state-active font-medium" : "text-muted-foreground hover:bg-state-hover")}
          >
            {v === "html" ? "Письмо" : "Текстовая версия"}
          </button>
        ))}
      </div>
      {view === "html" ? (
        <HtmlFrame html={p.html} className="w-full" style={{ height: compact ? Math.min(420, frameHeight(p.text)) : frameHeight(p.text) }} />
      ) : (
        <pre className="max-h-[480px] overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-sans">{p.text}</pre>
      )}
      </div>
    </div>
  );
}

/** ::manifest-letter{company="…"} — the letter of the organisation, live. */
export function LetterDirective({ attributes }: PluginMessageDirectiveProps) {
  const companyId = (attributes.company ?? "").trim();
  const valid = /^[0-9a-f-]{36}$/i.test(companyId);
  const { letter, none, error } = useLetter(valid ? companyId : "");
  if (!valid) return <p className="text-xs text-muted-foreground">Письмо: не указана организация.</p>;
  if (error) return <p className="text-xs text-destructive">Письмо: {error}</p>;
  if (none) return <p className="text-xs text-muted-foreground">У организации нет черновика письма.</p>;
  if (!letter) return <p className="text-xs text-muted-foreground">Собираем письмо…</p>;
  return (
    <div className="my-2 max-w-3xl">
      <LetterView letter={letter} />
    </div>
  );
}
