// Состояние дашборда аутрича (W-15, docs/outreach/dashboard.md §6): темы —
// треды bb с меткой kind=dashboard, у каждой свой фильтр в метке треда; данные
// виджетов считает Manifest (outreach_metrics, outreach_queue, outreach_feed).
// Изменения приходят сигналами realtime: правка где угодно — дашборд обновляется.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { Topic, rpcContract } from "../../server";
import type { Filter } from "../../lib/tools";
import { errorText, putSelection, useRegistryLoad, useStatus, useTool } from "../hooks";
import { requestSuppliersShow } from "../SuppliersList";
import type { FeedItem, Metrics, Queue, Segment } from "../types";

export const DASHBOARD_PATH = "dashboard";
export const DASHBOARD_ID = "dashboard";
export const REGISTRY_CHANGED = "manifest-registry-changed";
export const TOPIC_FILTER = "manifest-topic-filter";
export const TOPICS_CHANGED = "manifest-topics-changed";

export type { Filter, Topic };

/** Drops empty values: RPC takes strict JSON and the server treats "" as a value. */
export function cleanFilter(f: Filter): Filter {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out as Filter;
}

/** Topics of the dashboard (bb threads in the «Аутрич» section). */
export function useTopics() {
  const rpc = useRpc<typeof rpcContract>();
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    rpc.call("topics_list", null).then(
      (r) => {
        setTopics(r.topics);
        setError(null);
      },
      (e: unknown) => setError(errorText(e)),
    );
  }, [rpc]);
  useEffect(reload, [reload]);
  useRealtime(TOPICS_CHANGED, reload);
  return { topics, error, reload };
}

/** The filter of a topic: from the thread metadata, live on agent changes. */
export function useTopicFilter(threadId: string | null) {
  const rpc = useRpc<typeof rpcContract>();
  const [filter, setLocal] = useState<Filter>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setLocal({});
    setError(null);
    if (!threadId) return;
    let alive = true;
    rpc.call("topic_filter_get", { threadId }).then(
      (r) => alive && setLocal(r.filter),
      (e: unknown) => alive && setError(errorText(e)),
    );
    return () => {
      alive = false;
    };
  }, [rpc, threadId]);
  useRealtime(TOPIC_FILTER, (payload) => {
    const p = payload as { threadId?: unknown; filter?: unknown } | null;
    if (threadId && p?.threadId === threadId && p.filter && typeof p.filter === "object") setLocal(p.filter as Filter);
  });
  const setFilter = useCallback(
    async (next: Filter) => {
      const clean = cleanFilter(next);
      setLocal(clean);
      if (!threadId) return;
      try {
        await rpc.call("topic_filter_set", { threadId, filter: clean });
      } catch (e) {
        setError(errorText(e));
      }
    },
    [rpc, threadId],
  );
  return { filter, setFilter, error };
}

/** Threads whose dashboard already opened the list: the person may close it again. */
const listShownFor = new Set<string>();

/**
 * Dashboard → list (по приёмке W-20): a non-empty dashboard filter becomes the selection of
 * the left list for the thread the dashboard is in; the list opens once per thread. An
 * unmounted panel tab keeps it (the person looks at a card next to the dashboard); only
 * the New thread screen ("") drops it on leaving.
 */
export function useDashboardSelection(scope: string, filter: Filter, label: string) {
  const load = useRegistryLoad();
  const clean = cleanFilter(filter);
  const key = JSON.stringify(clean);
  useEffect(() => {
    const empty = key === "{}";
    const reload = putSelection(scope, empty ? null : { filter: JSON.parse(key) as Record<string, unknown>, label, key });
    if (!empty && !listShownFor.has(scope)) {
      listShownFor.add(scope);
      requestSuppliersShow();
    }
    if (reload) void load();
  }, [key, label, load, scope]);
  useEffect(
    () => () => {
      if (scope !== "") return;
      listShownFor.delete(scope);
      if (putSelection(scope, null)) void load();
    },
    [load, scope],
  );
}

export interface DashboardData {
  metrics: Metrics | null;
  queue: Queue | null;
  feed: FeedItem[];
  seenAt: string | null;
  loading: boolean;
  error: string | null;
}

/** Metrics, queue and the «what changed» feed for a filter. */
export function useDashboardData(filter: Filter) {
  const tool = useTool();
  const rpc = useRpc<typeof rpcContract>();
  const { status } = useStatus();
  const [data, setData] = useState<DashboardData>({ metrics: null, queue: null, feed: [], seenAt: null, loading: true, error: null });
  const seq = useRef(0);
  const seenAt = useRef<string | null | undefined>(undefined);
  const key = JSON.stringify(filter);
  const ready = !!status?.connected && status.canView && status.canWork;

  const load = useCallback(async () => {
    if (!ready) return;
    const my = ++seq.current;
    setData((d) => ({ ...d, loading: true }));
    try {
      if (seenAt.current === undefined) {
        // «Что изменилось с прошлого визита»: время прошлого визита помним в
        // плагине и сдвигаем на текущий визит.
        seenAt.current = (await rpc.call("seen_get", null)).at;
        void rpc.call("seen_set", { at: new Date().toISOString() });
      }
      const f = JSON.parse(key) as Filter;
      const since = seenAt.current ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [metrics, queue, feed] = await Promise.all([
        tool<Metrics>("outreach_metrics", { filter: f }),
        tool<Queue>("outreach_queue", { filter: f, per_group: 15 }),
        tool<{ items: FeedItem[] }>("outreach_feed", { filter: f, since, limit: 30 }),
      ]);
      if (my !== seq.current) return;
      setData({ metrics, queue, feed: feed.items, seenAt: seenAt.current ?? null, loading: false, error: null });
    } catch (e) {
      if (my !== seq.current) return;
      setData((d) => ({ ...d, loading: false, error: errorText(e) }));
    }
  }, [key, ready, rpc, tool]);

  useEffect(() => {
    void load();
  }, [load]);
  // Правки из карточки, веба через агента или пачки — перечитать.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtime(REGISTRY_CHANGED, () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void load(), 400);
  });
  return { ...data, reload: load, ready };
}

/** Saved segments of the team. */
export function useSegments() {
  const tool = useTool();
  const [segments, setSegments] = useState<Segment[]>([]);
  const reload = useCallback(() => {
    tool<{ items: Segment[] }>("outreach_segments", {}).then(
      (r) => setSegments(r.items),
      () => setSegments([]),
    );
  }, [tool]);
  useEffect(reload, [reload]);
  useRealtime(REGISTRY_CHANGED, reload);
  return { segments, reload };
}

// ---- attention counter: «ждут ответа + просрочено» (§6.5) ----
// One store for the sidebar tab badge and the navigation accessory: the
// counter is fetched once per change, not per component.

let attention: number | null = null;
const attentionListeners = new Set<() => void>();
let attentionTimer: ReturnType<typeof setTimeout> | null = null;
let attentionLoad: (() => Promise<void>) | null = null;
let attentionInFlight = false;
let attentionAt = 0;

const subscribeAttention = (l: () => void) => {
  attentionListeners.add(l);
  return () => attentionListeners.delete(l);
};

export function useAttentionCount(): number | null {
  const count = useSyncExternalStore(subscribeAttention, () => attention, () => attention);
  const tool = useTool();
  const { status } = useStatus();
  const ready = !!status?.connected && status.canView && status.canWork;
  const load = useCallback(async () => {
    if (!ready) return;
    // Sidebar tab and navigation item share the counter: one request at a time,
    // and not more often than every few seconds.
    if (attentionInFlight || Date.now() - attentionAt < 5_000) return;
    attentionInFlight = true;
    try {
      const m = await tool<Metrics>("outreach_metrics", { filter: {} });
      attention = m.checks.waiting_reply + m.checks.overdue;
    } catch {
      attention = null;
    } finally {
      attentionInFlight = false;
      attentionAt = Date.now();
    }
    attentionListeners.forEach((l) => l());
  }, [ready, tool]);
  useEffect(() => {
    attentionLoad = load;
    void load();
    const every = setInterval(() => void load(), 10 * 60_000);
    return () => {
      clearInterval(every);
      if (attentionLoad === load) attentionLoad = null;
    };
  }, [load]);
  useRealtime(REGISTRY_CHANGED, () => {
    if (attentionTimer) clearTimeout(attentionTimer);
    attentionTimer = setTimeout(() => {
      attentionAt = 0;
      void attentionLoad?.();
    }, 1500);
  });
  return count;
}
