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

interface ListState {
  filters: Filters;
  items: ListItem[];
  total: number;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
}

const PAGE = 50;
let state: ListState = {
  filters: { q: "", region: "", country: "", priority: "", status: "" },
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

export function useRegistry() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);
  const tool = useTool();

  const load = useCallback(
    async (append = false) => {
      const my = ++seq;
      const f = state.filters;
      emit({ loading: true, error: null });
      try {
        const res = await tool<ListResult>("outreach_list_companies", {
          q: f.q || undefined,
          region: f.region || undefined,
          country: f.country || undefined,
          priorities: f.priority ? [Number(f.priority)] : undefined,
          status: f.status || undefined,
          limit: PAGE,
          offset: append ? state.items.length : 0,
        });
        if (my !== seq) return;
        emit({ items: append ? [...state.items, ...res.items] : res.items, total: res.total, loading: false });
      } catch (e) {
        if (my !== seq) return;
        emit({ loading: false, error: errorText(e) });
      }
    },
    [tool],
  );

  const setFilter = useCallback(
    (key: keyof Filters, value: string) => {
      emit({ filters: { ...state.filters, [key]: value } });
      void load();
    },
    [load],
  );

  const select = useCallback((id: string | null) => emit({ selectedId: id }), []);

  return { ...snapshot, load, setFilter, select };
}

/** Refetch on «company changed» (panel or agent edit). */
export function useCompanyChanged(handler: (companyId: string) => void) {
  useRealtime(COMPANY_CHANGED, (payload) => {
    const id = (payload as { companyId?: unknown } | null)?.companyId;
    if (typeof id === "string") handler(id);
  });
}
