// Shared frontend state of the plugin. All slots (sidebar view, page, card
// tab, settings) run from one bundle in one window, so module-level stores
// shared through useSyncExternalStore keep them in step.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { Status, rpcContract } from "../server";
import type { ListItem, ListResult } from "./types";

export const PANEL_PATH = "outreach";
export const PANEL_ID = "outreach";
export const COMPANY_CHANGED = "manifest-company-changed";
/** A mailing changed (W-17); same name as in server.ts. */
export const MAILING_CHANGED = "manifest-mailing-changed";
export const STATUS_CHANGED = "manifest-status-changed";

type Rpc = ReturnType<typeof useRpc<typeof rpcContract>>;

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Calls a Manifest tool through the plugin backend. */
export function useTool() {
  const rpc = useRpc<typeof rpcContract>();
  return useCallback(
    async <T>(name: string, args: Record<string, unknown> = {}): Promise<T> => {
      // RPC accepts strict JSON only: drop undefined (unset filters).
      const clean = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
      const { result } = await rpc.call("tool", { name, args: clean });
      return result as T;
    },
    [rpc],
  );
}

/** Connection status, refreshed on sign-in/out anywhere in the window. */
export function useStatus() {
  const rpc = useRpc<typeof rpcContract>();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    rpc.call("status", null).then(
      (s) => {
        setStatus(s);
        setError(null);
      },
      (e: unknown) => setError(errorText(e)),
    );
  }, [rpc]);
  useEffect(load, [load]);
  useRealtime(STATUS_CHANGED, load);
  return { status, error, reload: load, rpc: rpc as Rpc };
}

// ---- registry list: one store for the sidebar view and the page ----

export interface Filters {
  q: string;
  region: string;
  country: string;
  priority: string;
  status: string;
}

/**
 * Выборка дашборда (по приёмке W-20): пока на экране чат по дашборду, список слева
 * показывает организации его фильтра. Выборки — по тредам: у каждого чата по дашборду своя;
 * "" — экран нового треда. Список берёт выборку открытого треда; в другом треде — свой фильтр.
 */
export interface Selection {
  filter: Record<string, unknown>;
  label: string;
  key: string;
}

interface ListState {
  filters: Filters;
  /** Open thread of the window ("" — not a thread: New thread screen, pages). */
  scope: string;
  selections: Record<string, Selection>;
  /** Selection key a person unlinked by ×, per thread: a new dashboard filter links again. */
  dismissed: Record<string, string>;
  items: ListItem[];
  total: number;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
}

const PAGE = 50;
let state: ListState = {
  filters: { q: "", region: "", country: "", priority: "", status: "" },
  scope: "",
  selections: {},
  dismissed: {},
  items: [],
  total: 0,
  loading: false,
  error: null,
  selectedId: null,
};
const listeners = new Set<() => void>();
const emit = (next: Partial<ListState>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
let seq = 0;

/** The dashboard selection the list shows now, if any. */
export function activeSelection(s: ListState = state): Selection | null {
  const sel = s.selections[s.scope];
  return sel && s.dismissed[s.scope] !== sel.key ? sel : null;
}

/** Stores a thread's dashboard selection (null — none); true if the list must reload. */
export function putSelection(scope: string, sel: Selection | null): boolean {
  const prev = state.selections[scope];
  if (sel ? prev?.key === sel.key && prev.label === sel.label : !prev) return false;
  const before = activeSelection()?.key;
  const selections = { ...state.selections };
  if (sel) selections[scope] = sel;
  else delete selections[scope];
  emit({ selections });
  return activeSelection()?.key !== before;
}

/** Loads the registry page: the dashboard selection or the list's own filter. */
export function useRegistryLoad() {
  const tool = useTool();
  return useCallback(
    async (append = false) => {
      const my = ++seq;
      const f = state.filters;
      const sel = activeSelection();
      emit({ loading: true, error: null });
      try {
        const page = { limit: PAGE, offset: append ? state.items.length : 0 };
        const res = await tool<ListResult>(
          "outreach_list_companies",
          sel
            ? { ...sel.filter, ...page }
            : {
                q: f.q || undefined,
                region: f.region || undefined,
                country: f.country || undefined,
                priorities: f.priority ? [Number(f.priority)] : undefined,
                status: f.status || undefined,
                ...page,
              },
        );
        if (my !== seq) return;
        emit({ items: append ? [...state.items, ...res.items] : res.items, total: res.total, loading: false });
      } catch (e) {
        if (my !== seq) return;
        emit({ loading: false, error: errorText(e) });
      }
    },
    [tool],
  );
}

export function useRegistry() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);
  const load = useRegistryLoad();

  const setFilter = useCallback(
    (key: keyof Filters, value: string) => {
      emit({ filters: { ...state.filters, [key]: value } });
      void load();
    },
    [load],
  );

  const select = useCallback((id: string | null) => emit({ selectedId: id }), []);

  /** The window moved to another thread: its dashboard selection or the own filter. */
  const setScope = useCallback(
    (scope: string) => {
      if (state.scope === scope) return;
      const before = activeSelection()?.key;
      emit({ scope });
      if (activeSelection()?.key !== before) void load();
    },
    [load],
  );

  /** × on the banner: back to the own filter until the dashboard filter changes. */
  const unlink = useCallback(() => {
    const sel = activeSelection();
    if (!sel) return;
    emit({ dismissed: { ...state.dismissed, [state.scope]: sel.key } });
    void load();
  }, [load]);

  return { ...snapshot, selection: activeSelection(snapshot), load, setFilter, select, setScope, unlink };
}

/** Refetch on «company changed» (panel or agent edit). */
export function useCompanyChanged(handler: (companyId: string) => void) {
  useRealtime(COMPANY_CHANGED, (payload) => {
    const id = (payload as { companyId?: unknown } | null)?.companyId;
    if (typeof id === "string") handler(id);
  });
}
