// Рабочее место аутрича (W-18, ADR-049, docs/outreach/workspace.md): фокус треда на
// клиенте — что открыто справа, цепочка, открытие панели и новый чат по объекту.
import { useCallback, useEffect, useRef, useState } from "react";
import { useBbNavigate, useRealtime, useRpc, useSdk } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../../server";
import { DASHBOARD_PATH } from "../dashboard/state";
import { PANEL_PATH, errorText, useTool } from "../hooks";
import { setComposeIntent } from "./intent";
import { MAIL_PATH } from "../mail/common";

/** Same name as FOCUS_CHANGED in server.ts. */
export const FOCUS_CHANGED = "manifest-focus-changed";
/** The threadPanelAction that shows the object of a thread. */
export const OBJECT_PANEL = "object";
/**
 * A second object beside the thread's own (Cmd/Ctrl-click, «Рядом»): its own panel action —
 * BB reuses an action's tab, so with the same action the card replaced the dashboard (по
 * приёмке W-20). One «beside» tab per screen; the next organisation replaces it there.
 */
export const BESIDE_PANEL = "object-beside";
export const BESIDE_NEW_PANEL = "company-beside";

export type FocusKind = "company" | "mailing" | "template" | "topic" | "inbound" | "mail";
export interface FocusRef {
  kind: FocusKind;
  id: string;
  title: string;
}

export const KIND_LABEL: Record<FocusKind, string> = {
  company: "Организация",
  mailing: "Рассылка",
  template: "Шаблон",
  topic: "Дашборд аутрича",
  inbound: "Входящее письмо",
  mail: "Почта аутрича",
};

const THREAD_TITLE: Record<FocusKind, string> = {
  company: "Аутрич",
  mailing: "Рассылка",
  template: "Шаблон",
  topic: "Дашборд",
  inbound: "Письмо",
  mail: "Почта",
};

/** The focus and chain of a thread, live. */
export function useFocus(threadId: string) {
  const rpc = useRpc<typeof rpcContract>();
  const [focus, setFocusState] = useState<FocusRef | null | undefined>(undefined);
  const [trail, setTrail] = useState<FocusRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const load = useCallback(() => {
    const my = ++seq.current;
    rpc.call("focus_get", { threadId }).then(
      (r) => {
        if (my !== seq.current) return;
        setFocusState(r.focus as FocusRef | null);
        setTrail(r.trail as FocusRef[]);
        setError(null);
      },
      (e: unknown) => my === seq.current && setError(errorText(e)),
    );
  }, [rpc, threadId]);
  useEffect(() => {
    setFocusState(undefined);
    load();
  }, [load]);
  useRealtime(FOCUS_CHANGED, (payload) => {
    const p = payload as { threadId?: unknown; focus?: unknown; trail?: unknown } | null;
    if (p?.threadId !== threadId) return;
    seq.current++;
    setFocusState((p.focus as FocusRef | null) ?? null);
    setTrail(Array.isArray(p.trail) ? (p.trail as FocusRef[]) : []);
  });
  const setFocus = useCallback(
    async (ref: FocusRef) => {
      const r = await rpc.call("focus_set", { threadId, focus: ref });
      setFocusState(r.focus as FocusRef | null);
      setTrail(r.trail as FocusRef[]);
    },
    [rpc, threadId],
  );
  const back = useCallback(
    async (ref: { kind: string; id: string }) => {
      const r = await rpc.call("focus_back", { threadId, kind: ref.kind, id: ref.id });
      setFocusState(r.focus as FocusRef | null);
      setTrail(r.trail as FocusRef[]);
    },
    [rpc, threadId],
  );
  const forget = useCallback(
    async (ref: { kind: string; id: string }) => {
      const r = await rpc.call("focus_forget", { threadId, kind: ref.kind, id: ref.id });
      setFocusState(r.focus as FocusRef | null);
      setTrail(r.trail as FocusRef[]);
    },
    [rpc, threadId],
  );
  return { focus, trail, error, setFocus, back, forget, reload: load };
}

/**
 * Opens (or brings forward) the object tab in the side panel of the thread this
 * component lives in. One tab per thread: its content follows the focus.
 */
export function useOpenObjectPanel() {
  const navigate = useBbNavigate();
  return useCallback(
    (title?: string) => navigate.openThreadPanel({ actionId: OBJECT_PANEL, title: title ? title.slice(0, 60) : "Manifest", params: { v: 1 } }),
    [navigate],
  );
}

/** Page of the object «on the whole screen» (Развернуть). */
export function fullPagePath(ref: FocusRef, threadId: string): { path: string; subPath: string } {
  switch (ref.kind) {
    case "company":
      return { path: PANEL_PATH, subPath: `${ref.id}/full` };
    case "mailing":
      return { path: MAIL_PATH, subPath: `mailing/${ref.id}` };
    case "template":
      return { path: MAIL_PATH, subPath: ref.id.startsWith("new-") ? "tpl/new" : `tpl/${ref.id}` };
    case "topic":
      return { path: DASHBOARD_PATH, subPath: ref.id || threadId };
    case "inbound":
      return { path: MAIL_PATH, subPath: `inbound/${ref.id}` };
    case "mail":
      return { path: MAIL_PATH, subPath: "" };
  }
}

/**
 * A new chat about an object: the thread gets the object as its focus (through the
 * plugin backend — trusted) and opens in the main area; its side panel opens there.
 */
export function useStartChat() {
  const sdk = useSdk();
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  return useCallback(
    async (ref: FocusRef, request: Parameters<typeof sdk.threads.spawn>[0]) => {
      const { sectionId } = await rpc.call("section_ensure", null).catch(() => ({ sectionId: null }));
      const metadata: Record<string, string | FocusRef> = { focus: { ...ref } };
      if (ref.kind === "company") Object.assign(metadata, { companyId: ref.id, companyName: ref.title });
      const thread = await sdk.threads.spawn({
        ...request,
        title: `${THREAD_TITLE[ref.kind]}: ${ref.title || KIND_LABEL[ref.kind]}`.slice(0, 120),
        pluginMetadata: metadata,
        ...(sectionId ? { sectionId } : {}),
      } as unknown as Parameters<typeof sdk.threads.spawn>[0]);
      await rpc.call("focus_set", { threadId: thread.id, focus: ref });
      if (ref.kind === "company") await rpc.call("chat_link", { companyId: ref.id, threadId: thread.id });
      navigate.toThread(thread.id);
      return thread.id;
    },
    [navigate, rpc, sdk],
  );
}

/**
 * Opens an object (organisation, mailing, template, inbound message, mail hub) the same
 * way everywhere: its latest chat with the object on the right, or — without chats —
 * BB's New thread screen with the object in its side panel (compose.tsx).
 */
export function useOpenObject() {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  return useCallback(
    async (ref: FocusRef) => {
      const { chats } = ref.id ? await rpc.call("chats_list", { kind: ref.kind, id: ref.id }).catch(() => ({ chats: [] })) : { chats: [] };
      const last = chats[0];
      if (last) {
        await rpc.call("focus_set", { threadId: last.threadId, focus: { ...ref, title: ref.title.slice(0, 200) } });
        navigate.toThread(last.threadId);
        return;
      }
      setComposeIntent(ref.kind, ref.id, ref.title);
      const { sectionId } = await rpc.call("section_ensure", null).catch(() => ({ sectionId: null }));
      navigate.toCompose({ focusPrompt: true, ...(sectionId ? { placement: { sectionId, pinned: false } } : {}) });
    },
    [navigate, rpc],
  );
}

/** An organisation: its latest chat or BB's New thread screen with the card on the right. */
export function useOpenCompany() {
  const open = useOpenObject();
  const tool = useTool();
  return useCallback(
    (companyId: string, title = "") => {
      void (async () => {
        let name = title;
        if (!name) {
          name = await tool<{ company?: { display_name?: string } }>("outreach_get_company", { id: companyId }).then(
            (c) => c?.company?.display_name ?? "",
            () => "",
          );
        }
        await open({ kind: "company", id: companyId, title: name });
      })();
    },
    [open, tool],
  );
}

/**
 * A second object beside the chat: a separate tab of the side panel (Cmd/Ctrl-click or
 * dragging a row out of the list). The thread's own object stays as it is.
 */
export function useOpenPinned() {
  const navigate = useBbNavigate();
  return useCallback(
    /** `inThread` — the caller knows the surface (the sidebar list): its panel action goes first. */
    (ref: FocusRef, inThread?: boolean) => {
      const params = { v: 1, pin: { kind: ref.kind, id: ref.id, title: ref.title.slice(0, 200) } };
      const title = (ref.title || KIND_LABEL[ref.kind]).slice(0, 60);
      // In a thread — its panel; on the New thread screen — that screen's panel.
      const order = inThread === false ? [BESIDE_NEW_PANEL, BESIDE_PANEL] : [BESIDE_PANEL, BESIDE_NEW_PANEL];
      for (const actionId of order) if (navigate.openThreadPanel({ actionId, title, params })) return true;
      return false;
    },
    [navigate],
  );
}
