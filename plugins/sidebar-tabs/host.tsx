import { useSdk, type PluginThreadListProps } from "@get-bb/plugin-sdk/app";
import { useSidebarNavigation } from "./nav-runtime.ts";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { toast } from "sonner";
import { attachHost, listViews, openRegistry, revision, subscribe, type HostHandle, type ViewSlot } from "./sidebar-tabs-contract.ts";
import { AUTOMATIC, availability, badgeLabel, badgeText, createModeSwitch, follow, modeOf, neighbour, NO_SELECTION, pick, PROVIDER_KEY, routeKey, STANDARD, tabIcon, tabsVisible, type Mode, type Selection, type TabIcon } from "./tabs-model.ts";
import { TabIconGlyph } from "./icons.tsx";
import { idleCommand, type CommandState } from "./feedback.ts";
import { busyProps, BusyOverlay } from "./feedback-ui.tsx";

type Sdk = ReturnType<typeof useSdk>;

/**
 * bb 0.46 removed the sidebar navigation hooks (navigation rail): there the active item is unknown and the page path
 * (`routePrefixes`) decides alone. The choice is fixed per runtime, so the hook order never changes between renders.
 */
const navigation = useSidebarNavigation;
const useActiveNavItem: () => string | null = navigation ? () => navigation().activeItemId : () => null;

/** Tabs and the manual pick belong to this window: module state survives the host's remounts, sessionStorage a reload. */
const SELECTION_KEY = "sidebar-tabs:selection";
let windowSelection: Selection = (() => {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SELECTION_KEY) ?? "null") as Partial<Selection> | null;
    if (typeof stored?.active !== "string" && typeof stored?.wanted !== "string") return NO_SELECTION;
    return { active: typeof stored.active === "string" ? stored.active : null, routeKey: typeof stored.routeKey === "string" ? stored.routeKey : null,
      fallback: stored.fallback !== false, wanted: typeof stored.wanted === "string" ? stored.wanted : null };
  } catch { return NO_SELECTION; }
})();
function rememberSelection(next: Selection) {
  windowSelection = next;
  try { sessionStorage.setItem(SELECTION_KEY, JSON.stringify(next)); } catch { /* private mode: module state is enough */ }
}

/** The icon the host draws for a view; an icon it does not know is said once per view and name, and the tab shows its label alone. */
const iconWarned = new Set<string>();
function drawnIcon(registration: { id: string; icon?: unknown }): TabIcon | null {
  const icon = tabIcon(registration.icon);
  if (icon || registration.icon === undefined) return icon;
  const asked = typeof registration.icon === "string" ? JSON.stringify(registration.icon) : `of type ${typeof registration.icon}`;
  const key = `${registration.id}:${asked}`;
  if (!iconWarned.has(key)) { iconWarned.add(key); console.warn(`[sidebar-tabs] view ${registration.id}: no icon ${asked}, the tab shows its label alone`); }
  return icon;
}

/** Re-render on every registry change. */
function useRegistryRevision() {
  return useSyncExternalStore(subscribe, revision, revision);
}

/** The address bar, for views that follow path prefixes. bb navigates with pushState, which fires no event, so poll lightly. */
function usePathname(enabled: boolean) {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  useEffect(() => {
    if (!enabled) return;
    const read = () => setPathname(window.location.pathname);
    read();
    const timer = window.setInterval(read, 750);
    window.addEventListener("popstate", read);
    return () => { window.clearInterval(timer); window.removeEventListener("popstate", read); };
  }, [enabled]);
  return enabled ? pathname : window.location.pathname;
}


/** The sidebar list slot: tab strip, one element per registered view, and a way out when there is nothing to show. */
export function TabsHost({ activeThreadId, activeProjectId, isCompactViewport, onNavigate }: PluginThreadListProps) {
  useRegistryRevision();
  // Element ids for tabs and panels: a per-host prefix and a number per view id, so no two view ids can collide.
  const idPrefix = useId();
  const viewNumbers = useRef(new Map<string, number>());
  const domId = (viewId: string, part: "tab" | "panel") => {
    let number = viewNumbers.current.get(viewId);
    if (number === undefined) { number = viewNumbers.current.size; viewNumbers.current.set(viewId, number); }
    return `sidebar-tabs${idPrefix}${part}-${number}`;
  };
  const compatible = openRegistry().ok;
  const views = listViews();
  const following = useMemo(() => views.map((entry) => ({ id: entry.registration.id, follows: entry.registration.follows ?? {} })), [views.map((entry) => `${entry.registration.id}:${entry.generation}`).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeItemId = useActiveNavItem();
  const pathname = usePathname(following.some((view) => view.follows.routePrefixes?.length));
  const route = { activeThreadId, navItemId: activeItemId, pathname };

  const [selection, setSelection] = useState<Selection>(() => follow(windowSelection, following, route));
  const next = follow(selection, following, route);
  if (next !== selection) setSelection(next);
  useEffect(() => rememberSelection(selection), [selection]);

  // The host speaks for this window; a remount (mode switch, plugin reload) attaches a newer generation.
  const host = useRef<HostHandle | null>(null);
  const [mountedAt] = useState(() => Date.now());
  useLayoutEffect(() => {
    const attached = attachHost();
    if ("publish" in attached) host.current = attached;
    else console.warn(`[sidebar-tabs] ${attached.message}`);
    return () => { if ("publish" in attached) attached.dispose(); host.current = null; };
  }, []);

  // A stable onNavigate: bb may hand a new function every render, and a changed slot re-renders every view.
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;
  const navigate = useCallback(() => navigateRef.current(), []);

  const elements = useRef(new Map<string, HTMLDivElement>());
  useLayoutEffect(() => {
    const slots = new Map<string, ViewSlot>();
    for (const view of views) {
      const element = elements.current.get(view.registration.id);
      if (!element) continue;
      slots.set(view.registration.id, { generation: view.generation, element, props: { activeThreadId, activeProjectId, isCompactViewport, isActive: view.registration.id === selection.active, onNavigate: navigate } });
    }
    host.current?.publish(slots);
  });

  // Focus that sat in a view that went away or was hidden moves to the selected tab, never to the page body.
  // It is only ever recovered from nowhere (body) or from a hidden element of this host: focus elsewhere is the user's.
  // Native events: React focus events from a provider's portal bubble through the provider's tree, not this one.
  const rootRef = useRef<HTMLDivElement>(null);
  const focusInside = useRef(false);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const moved = (event: FocusEvent) => { focusInside.current = event.target instanceof Node && root.contains(event.target); };
    const left = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node) return; // the document-level focusin decides
      // Focus went nowhere: recover it only if its element was removed or hidden, not when the user clicked away.
      const from = event.target as Element;
      window.setTimeout(() => { if (from.isConnected && from.getClientRects().length && document.activeElement !== from) focusInside.current = false; }, 0);
    };
    document.addEventListener("focusin", moved);
    root.addEventListener("focusout", left);
    return () => { document.removeEventListener("focusin", moved); root.removeEventListener("focusout", left); };
  }, []);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !focusInside.current) return;
    const active = document.activeElement;
    const lost = !active || active === document.body || (root.contains(active) && !active.getClientRects().length);
    if (!lost) return;
    const target = selection.active ? document.getElementById(domId(selection.active, "tab")) ?? elements.current.get(selection.active)
      : root.querySelector<HTMLElement>("[data-sidebar-tabs-unavailable] button") ?? root;
    target?.focus({ preventScroll: true });
  });

  // Waiting turns into «nothing to show» without another registry change, so tick once past the grace period.
  const [, setTick] = useState(0);
  const state = availability(views.length, Date.now() - mountedAt, compatible);
  useEffect(() => {
    if (state !== "waiting") return;
    const timer = window.setTimeout(() => setTick((tick) => tick + 1), 2600);
    return () => window.clearTimeout(timer);
  }, [state]);

  const ids = views.map((view) => view.registration.id);
  const onTabKey = (event: ReactKeyboardEvent) => {
    const target = neighbour(ids, selection.active, event.key);
    if (!target) return;
    event.preventDefault();
    setSelection((current) => pick(current, following, target));
    document.getElementById(domId(target, "tab"))?.focus();
  };
  const showTabs = tabsVisible(views.length);

  return <div ref={rootRef} tabIndex={-1} className="flex min-h-full flex-col outline-none" data-sidebar-tabs-host="" data-sidebar-tabs-route={routeKey(route)}>
    {showTabs && <div className="st-strip">
      <div role="tablist" aria-label="Представления сайдбара" onKeyDown={onTabKey} className="st-seg">
        {views.map((view) => {
          const id = view.registration.id;
          const selected = id === selection.active;
          const icon = drawnIcon(view.registration);
          return <button key={id} id={domId(id, "tab")} type="button" role="tab" aria-selected={selected} aria-controls={domId(id, "panel")}
            tabIndex={selected ? 0 : -1} onClick={() => setSelection((current) => pick(current, following, id))} className="st-tab">
            {icon && <TabIconGlyph name={icon} />}
            <span className="st-tab__label">{view.registration.title}</span>
            {view.badge !== null && <>
              <span className="st-count st-count--waiting" aria-hidden="true">{badgeText(view.badge)}</span>
              <span className="st-sr">, {badgeLabel(view.badge)}</span>
            </>}
          </button>;
        })}
      </div>
    </div>}
    {views.map((view) => {
      const id = view.registration.id;
      const selected = id === selection.active;
      return <div key={`${id}:${view.generation}`} id={domId(id, "panel")} data-sidebar-tabs-view={id}
        role={showTabs ? "tabpanel" : "region"} aria-labelledby={showTabs ? domId(id, "tab") : undefined} aria-label={showTabs ? undefined : view.registration.title}
        tabIndex={-1} hidden={!selected} className="min-h-0 flex-1 outline-none"
        ref={(element) => { if (element) elements.current.set(id, element); else elements.current.delete(id); }} />;
    })}
    {state !== "ready" && <Unavailable state={state} />}
  </div>;
}

/** No view to show: say why and offer bb's own list, so the sidebar is never a dead end. */
function Unavailable({ state }: { state: "waiting" | "empty" | "incompatible" }) {
  const sdk = useSdk();
  modeSdk = sdk;
  const command = useModeSwitchState();
  if (state === "waiting") return <div role="status" aria-label="Загрузка представлений" className="flex flex-col gap-2 px-3 py-2">
    <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
    <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
  </div>;
  return <div role="status" data-sidebar-tabs-unavailable="" className="flex flex-col gap-2 px-3 py-2 text-sm text-muted-foreground">
    <span>{state === "incompatible" ? "Представления сайдбара говорят на другой версии договора." : "Нет подключённых представлений сайдбара: плагин «Сессии» выключен или не загрузился."}</span>
    <button type="button" onClick={() => void switchMode("standard")} {...busyProps(command)}
      className="self-start rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span>Штатный список</span><BusyOverlay size={14} />
    </button>
  </div>;
}

/** The global mode lives in the server-synced preference; read it fresh, never trust a cached guess. */
export async function readMode(sdk: Sdk): Promise<{ mode: Mode; value: unknown; revision: number }> {
  const { preferences } = await sdk.system.uiPreferences.list();
  const { value, revision: rev } = preferences[PROVIDER_KEY];
  return { mode: modeOf(value), value, revision: rev };
}

/**
 * Write only the list preference, guarded by its revision; one retry when another window wrote first. `known` — the
 * state just read by the caller: the first attempt does not read it again (W-06b); the retry always reads fresh.
 */
export async function setMode(sdk: Sdk, mode: Mode, known?: { mode: Mode; revision: number }) {
  for (let attempt = 0; ; attempt++) {
    const current = attempt === 0 && known ? known : await readMode(sdk);
    if (current.mode === mode) return;
    try {
      await sdk.system.uiPreferences.set({ key: PROVIDER_KEY, value: mode === "standard" ? STANDARD : AUTOMATIC, expectedRevision: current.revision });
      return;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
}

/**
 * «Мои» is `__automatic__`: the first installed list other than bb's. Another list plugin (say, sessions 0.1 during a
 * rollback) would win it instead of this host; say so rather than leave the user guessing.
 */
function warnIfAnotherList() {
  const opened = openRegistry();
  if (opened.ok && opened.registry.host) return;
  toast.warning("«Мои» открыл не вкладки сайдбара", {
    description: "В bb установлен ещё один список. Выберите «Вкладки сайдбара» в Settings → Appearance → Sidebar или отключите другой список.",
  });
}

const TOGGLE_EVENT = "sidebar-tabs:toggle-mode";
/** Fired by the footer item, which gets no SDK; {@link ModeToggleListener} handles it once per window. */
export const requestModeToggle = () => { window.dispatchEvent(new CustomEvent(TOGGLE_EVENT, { cancelable: true })); };

/**
 * One switch of the list per window (W-06b, П1): the footer item and «Штатный список» share it, so presses while it
 * runs are ignored instead of racing parallel writes; a failure says why and offers to repeat it.
 */
let modeSdk: Sdk | null = null;
let modeState: CommandState = idleCommand;
const modeListeners = new Set<() => void>();
const modeSwitch = createModeSwitch({
  read: () => readMode(modeSdk!),
  write: (mode, known) => setMode(modeSdk!, mode, known),
}, { onChange: (state) => { modeState = state; for (const listener of modeListeners) listener(); } });
async function switchMode(target: Mode | "toggle") {
  if (!modeSdk || modeSwitch.state.running) return;
  const result = await modeSwitch.start(target);
  if (result?.from === "standard" && result.to === "mine") window.setTimeout(warnIfAnotherList, 4000);
  const { error } = modeSwitch.state;
  if (!result && error) toast.error("Не удалось переключить список", { description: error instanceof Error ? error.message : String(error),
    action: { label: "Повторить", onClick: () => void switchMode(target) } });
}
function useModeSwitchState(): CommandState {
  return useSyncExternalStore((listener) => { modeListeners.add(listener); return () => { modeListeners.delete(listener); }; }, () => modeState, () => modeState);
}

/** App-wide and invisible: flips «мои / штатные» when the footer item asks, in either mode. */
export function ModeToggleListener() {
  const sdk = useSdk();
  modeSdk = sdk;
  useEffect(() => {
    const toggle = (event: Event) => {
      // A second listener (an older bundle mid-reload) sees the claim and stays out: one click, one switch.
      if (event.defaultPrevented) return;
      event.preventDefault();
      void switchMode("toggle");
    };
    window.addEventListener(TOGGLE_EVENT, toggle);
    return () => window.removeEventListener(TOGGLE_EVENT, toggle);
  }, [sdk]);
  return null;
}
