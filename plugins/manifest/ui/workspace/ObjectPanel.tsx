// Объект треда в боковой панели (W-18, ADR-049): крошки, «Чаты (N)» (на весь экран — кнопка ⤢ панели BB) и
// виджет по виду объекта. Одна вкладка на тред — её содержимое следует за фокусом.
import { useEffect, useState } from "react";
import {
  experimental_NewThreadComposer,
  useBbNavigate,
  useRpc,
  type PluginThreadHeaderActionProps,
  type PluginThreadPanelProps,
} from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { rpcContract } from "../../server";
import { CardView } from "../CardTab";
import { DashboardBody } from "../dashboard/DashboardPage";
import { errorText } from "../hooks";
import { Note } from "../RegistryList";
import { MailingView } from "../mail/MailingView";
import { TemplateEditor } from "../mail/TemplateEditor";
import { InboundView } from "./InboundView";
import { KindLabel } from "../manifest";
import { KIND_LABEL, useBesideHost, useFocus, useOpenObject, useOpenObjectPanel, useStartChat, type FocusKind, type FocusRef } from "./state";
import { MailHub } from "../mail/MailPage";
import { useRealtime } from "@get-bb/plugin-sdk/app";
import { FOCUS_CHANGED } from "./state";
import { rememberThread } from "./intent";

const NewThreadComposer = experimental_NewThreadComposer;

export function ObjectPanel({ threadId, params }: PluginThreadPanelProps) {
  const pin = pinOf(params);
  if (pin) return <PinnedObject pin={pin} threadId={threadId} />;
  return <FocusedObject threadId={threadId} />;
}

const PIN_KINDS: FocusKind[] = ["company", "mailing", "template", "topic", "inbound", "mail"];

/** A pinned object of a separate panel tab (params.pin), or null. */
export function pinOf(params: unknown): FocusRef | null {
  const p = params && typeof params === "object" && !Array.isArray(params) ? (params as { pin?: unknown }).pin : null;
  if (!p || typeof p !== "object") return null;
  const r = p as { kind?: unknown; id?: unknown; title?: unknown };
  if (typeof r.kind !== "string" || !PIN_KINDS.includes(r.kind as FocusKind) || typeof r.id !== "string") return null;
  return { kind: r.kind as FocusKind, id: r.id, title: typeof r.title === "string" ? r.title : "" };
}

/**
 * A second object beside the chat (its own «рядом» tab, по приёмке W-20): for reference — the
 * chat is about the main tab's object. Warm paper and an amber bar say so; «Сделать основной»
 * goes to this object's own chat (its last one or a new one), where it is the object.
 */
export function PinnedObject({ pin, threadId, mainTitle }: { pin: FocusRef; threadId?: string; mainTitle?: string | null }) {
  const { focus } = useFocus(threadId ?? "");
  const openObject = useOpenObject();
  const main = threadId ? (focus ? focus.title || KIND_LABEL[focus.kind] : null) : (mainTitle ?? null);
  return (
    <div className="@container mf-root mf-island mf-paper mf-beside flex h-full min-h-0 flex-col">
      <div className="mf-beside-bar flex items-center gap-2 px-3 py-1.5 text-xs">
        <span className="min-w-0 flex-1 truncate" title={main ? `Чат слева — о «${main}», эта карточка открыта рядом` : "Чат слева — не об этой карточке"}>
          <b>Рядом</b> · чат {main ? <>о «{main}»</> : "не о ней"}
        </span>
        <Button size="sm" className="h-7 flex-none" aria-label="Сделать основной: перейти в её чат" onClick={() => void openObject(pin)}>
          Сделать основной →
        </Button>
      </div>
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <KindLabel>{KIND_LABEL[pin.kind]}</KindLabel>
          <div className="truncate text-base font-bold leading-snug">{pin.title || KIND_LABEL[pin.kind]}</div>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ObjectBody focus={pin} threadId={threadId} />
      </div>
    </div>
  );
}

function FocusedObject({ threadId }: { threadId: string }) {
  const { focus, trail, error, setFocus, back, forget } = useFocus(threadId);
  const [chatsOpen, setChatsOpen] = useState(false);
  if (focus === undefined) return <PanelNote>{error ?? "Открываем…"}</PanelNote>;
  if (!focus) return <PanelNote>Этот чат не привязан к объекту Manifest. Объекты открываются из разделов «Аутрич», «Дашборд аутрича», «Почта аутрича».</PanelNote>;
  const open = (ref: FocusRef) => void setFocus(ref);
  return (
    <div className="@container mf-root mf-island mf-paper flex h-full min-h-0 flex-col">
      <header className="mf-surface flex flex-col gap-1 border-b border-border px-3 py-2">
        {trail.length > 0 ? (
          <nav aria-label="Цепочка объектов" className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
            {trail.slice(-3).map((r) => (
              <button key={`${r.kind}:${r.id}`} type="button" className="max-w-[12rem] truncate rounded px-1 py-0.5 hover:bg-state-hover" onClick={() => void back(r)}>
                ← {r.title || KIND_LABEL[r.kind]}
              </button>
            ))}
          </nav>
        ) : null}
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <KindLabel>{KIND_LABEL[focus.kind]}</KindLabel>
            <div className="truncate text-base font-bold leading-snug">{focus.title || KIND_LABEL[focus.kind]}</div>
          </div>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setChatsOpen(!chatsOpen)} aria-expanded={chatsOpen}>
            Чаты
          </Button>
        </div>
        {chatsOpen ? <ChatsList focus={focus} currentThreadId={threadId} /> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FocusBody focus={focus} threadId={threadId} onOpen={open} onBack={() => void forget(focus)} />
      </div>
    </div>
  );
}

/** Подсказка панели — на «бумаге» Manifest, как и виджеты. */
function PanelNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mf-island mf-paper h-full">
      <Note>{children}</Note>
    </div>
  );
}

/** The widget of an object outside the thread's focus: links open the object's own chat. */
export function ObjectBody({ focus, threadId }: { focus: FocusRef; threadId?: string }) {
  const openObject = useOpenObject();
  return <FocusBody focus={focus} threadId={threadId} onOpen={(ref) => void openObject(ref)} onBack={() => undefined} />;
}

function FocusBody({ focus, threadId, onOpen, onBack }: { focus: FocusRef; threadId?: string; onOpen: (ref: FocusRef) => void; onBack: () => void }) {
  switch (focus.kind) {
    case "mail":
      return <MailHub />;
    case "company":
      return <CardView key={focus.id} companyId={focus.id} embedded />;
    case "mailing":
      return (
        <div className="p-2">
          <MailingView
            key={focus.id}
            id={focus.id}
            onOpenCompany={(id) => onOpen({ kind: "company", id, title: "" })}
            onDeleted={onBack}
            embedded
          />
        </div>
      );
    case "template":
      return <TemplateEditor key={focus.id} templateId={focus.id.startsWith("new-") ? null : focus.id} threadId={threadId} embedded />;
    case "topic":
      return <DashboardBody topicId={focus.id || threadId || null} threadId={threadId} onOpenCompany={(id) => onOpen({ kind: "company", id, title: "" })} />;
    case "inbound":
      return <InboundView key={focus.id} id={focus.id} embedded onLinked={(c) => onOpen({ kind: "company", id: c.id, title: c.name })} />;
  }
}

/** Чаты объекта: перейти в другой или начать новый. */
export function ChatsList({ focus, currentThreadId }: { focus: FocusRef; currentThreadId?: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const start = useStartChat();
  const [chats, setChats] = useState<{ threadId: string; title: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    rpc.call("chats_list", { kind: focus.kind, id: focus.id }).then(
      (r) => setChats(r.chats),
      (e: unknown) => setError(errorText(e)),
    );
  }, [focus.id, focus.kind, rpc]);
  return (
    <div className="flex flex-col gap-2 py-1 text-xs">
      {error ? <p className="text-destructive">{error}</p> : null}
      {chats === null ? (
        <p className="text-muted-foreground">Загружаем…</p>
      ) : chats.length === 0 ? (
        <p className="text-muted-foreground">Чатов пока нет.</p>
      ) : (
        <ul className="flex flex-col">
          {chats.map((c) => (
            <li key={c.threadId}>
              <button
                type="button"
                disabled={c.threadId === currentThreadId}
                onClick={() => navigate.toThread(c.threadId)}
                className={cn("w-full truncate rounded px-2 py-1.5 text-left hover:bg-state-hover", c.threadId === currentThreadId && "font-semibold")}
              >
                {c.title}
                {c.threadId === currentThreadId ? " · этот" : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
      <NewThreadComposer
        draftKey={`manifest-new-${focus.kind}-${focus.id}`}
        placeholder={`Новый чат: ${focus.title || KIND_LABEL[focus.kind]}`}
        onSubmit={(request) => void start(focus, request as Parameters<typeof start>[1]).catch((e: unknown) => setError(errorText(e)))}
      />
    </div>
  );
}

const OPENED = "manifest:panel-opened:";

/**
 * Кнопка в шапке треда: что открыто справа; открывает панель сама — при первом
 * показе треда в этой вкладке браузера и когда объект сменился (агент создал рассылку,
 * человек открыл другой объект).
 */
export function FocusHeader({ threadId, isCompactViewport }: PluginThreadHeaderActionProps) {
  const { focus } = useFocus(threadId);
  useBesideHost(threadId);
  const openPanel = useOpenObjectPanel();
  useEffect(
    () => rememberThread(threadId, focus?.kind === "topic", !!focus && ["mail", "mailing", "template", "inbound"].includes(focus.kind)),
    [threadId, focus],
  );
  useEffect(() => {
    // On a phone the panel is a sheet over the chat: it opens by the button only.
    if (!focus || isCompactViewport) return;
    let opened = false;
    try {
      opened = window.sessionStorage.getItem(OPENED + threadId) === "1";
    } catch {
      opened = false;
    }
    if (opened) return;
    if (openPanel(focus.title || KIND_LABEL[focus.kind])) {
      try {
        window.sessionStorage.setItem(OPENED + threadId, "1");
      } catch {
        // no storage: the panel may open again next time
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.kind, focus?.id, threadId]);
  useRealtime(FOCUS_CHANGED, (payload) => {
    const p = payload as { threadId?: unknown; open?: unknown; focus?: FocusRef | null } | null;
    if (p?.threadId !== threadId || p.open !== true || !p.focus || isCompactViewport) return;
    openPanel(p.focus.title || KIND_LABEL[p.focus.kind]);
  });
  if (!focus) return null;
  return (
    <Button
      size="sm"
      variant="ghost"
      className="mf-focus-button h-8 max-w-[16rem] gap-1 px-2 text-xs"
      aria-label={`Открыть справа: ${KIND_LABEL[focus.kind]} ${focus.title}`}
      onClick={() => openPanel(focus.title || KIND_LABEL[focus.kind])}
    >
      <span className="text-muted-foreground">{isCompactViewport ? "◧" : `${KIND_LABEL[focus.kind]}:`}</span>
      {isCompactViewport ? null : <span className="truncate">{focus.title || "—"}</span>}
    </Button>
  );
}
