// Рабочее место аутрича (W-18, ADR-049, docs/outreach/workspace.md): фокус треда на
// клиенте — что открыто справа, цепочка, открытие панели и новый чат по объекту.
import { useCallback, useEffect, useRef, useState } from "react";
import { useBbNavigate, useRealtime, useRpc, useSdk } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../../server";
import { DASHBOARD_PATH } from "../dashboard/state";
import { PANEL_PATH, errorText } from "../hooks";
import { MAIL_PATH } from "../mail/common";

/** Same name as FOCUS_CHANGED in server.ts. */
export const FOCUS_CHANGED = "manifest-focus-changed";
/** The threadPanelAction that shows the object of a thread. */
export const OBJECT_PANEL = "object";

export type FocusKind = "company" | "mailing" | "template" | "topic" | "inbound";
export interface FocusRef {
  kind: FocusKind;
  id: string;
  title: string;
}

export const KIND_LABEL: Record<FocusKind, string> = {
  company: "Организация",
  mailing: "Рассылка",
  template: "Шаблон",
  topic: "Тема дашборда",
  inbound: "Входящее письмо",
};

const THREAD_TITLE: Record<FocusKind, string> = {
  company: "Аутрич",
  mailing: "Рассылка",
  template: "Шаблон",
  topic: "Тема",
  inbound: "Письмо",
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
      return { path: PANEL_PATH, subPath: ref.id };
    case "mailing":
      return { path: MAIL_PATH, subPath: `mailing/${ref.id}` };
    case "template":
      return { path: MAIL_PATH, subPath: ref.id.startsWith("new-") ? "tpl/new" : `tpl/${ref.id}` };
    case "topic":
      return { path: DASHBOARD_PATH, subPath: ref.id || threadId };
    case "inbound":
      return { path: MAIL_PATH, subPath: `inbound/${ref.id}` };
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
 * Opens an organisation from a page (pult): its latest chat with the card on the right,
 * or — without chats — its page with the card and «Новый чат».
 */
export function useOpenCompany() {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  return useCallback(
    (companyId: string, title = "") => {
      void rpc
        .call("chats_list", { kind: "company", id: companyId })
        .then(async ({ chats }) => {
          const last = chats[0];
          if (!last) {
            navigate.toPluginPanel(PANEL_PATH, { subPath: companyId });
            return;
          }
          await rpc.call("focus_set", { threadId: last.threadId, focus: { kind: "company", id: companyId, title: title.slice(0, 200) } });
          navigate.toThread(last.threadId);
        })
        .catch(() => navigate.toPluginPanel(PANEL_PATH, { subPath: companyId }));
    },
    [navigate, rpc],
  );
}
