/** Pure decisions of the sidebar-tabs host: which tab is selected, and what the «мои / штатные» switch writes. */
import type { ViewFollow } from "./sidebar-tabs-contract.ts";
import { createCommand, type CommandOptions } from "./feedback.ts";

/** The UI preference that picks the sidebar list for every window of this bb. */
export const PROVIDER_KEY = "sidebar.threadListProvider";
/** bb's own list. */
export const STANDARD = "thread-list/thread-list";
/**
 * «Мои»: the first installed list other than bb's, falling back to bb's. Pinning the host instead would leave an
 * empty «No thread list plugin is enabled» sidebar while the host is disabled.
 */
export const AUTOMATIC = "__automatic__";
/** This host's own list slot. */
export const HOST_PROVIDER = "sidebar-tabs/tabs";
/** What «мои» was before the host: sessions' own list slot, no longer registered. */
export const LEGACY_SESSIONS = "sessions/sessions";

export type Mode = "mine" | "standard";

/** The mode a preference value stands for. Legacy `__builtin__` is bb's list too. */
export function modeOf(value: unknown): Mode {
  return value === STANDARD || value === "__builtin__" ? "standard" : "mine";
}

/** What the switch writes to leave `mode`. */
export function toggleTarget(mode: Mode): string {
  return mode === "mine" ? STANDARD : AUTOMATIC;
}

export type ModeIo = {
  /** The preference as it is now (fresh read). */
  read: () => Promise<{ mode: Mode; revision: number }>;
  /** Write `mode`, guarded by the revision just read. */
  write: (mode: Mode, known: { mode: Mode; revision: number }) => Promise<void>;
};

/**
 * «Мои ↔ штатные» (footer) and «Штатный список» (host): one switch per window at a time (W-06b, П1) — presses while it
 * runs are ignored instead of racing parallel revision-guarded writes. The result says which way it went.
 */
export function createModeSwitch(io: ModeIo, options: CommandOptions = {}) {
  return createCommand(async (_signal, target: Mode | "toggle") => {
    const current = await io.read();
    const to: Mode = target === "toggle" ? (current.mode === "mine" ? "standard" : "mine") : target;
    if (to !== current.mode) await io.write(to, current);
    return { from: current.mode, to };
  }, options);
}

/** A value that names a list nobody registers any more, rewritten to the same choice; null leaves the value alone. */
export function migratedValue(value: unknown): string | null {
  return value === LEGACY_SESSIONS ? AUTOMATIC : null;
}

export interface Route {
  activeThreadId: string | null;
  /** Active sidebar navigation item, `<pluginId>/<panelId>`, when bb reports it. */
  navItemId: string | null;
  pathname: string;
}

export interface FollowingView {
  id: string;
  follows: ViewFollow;
}

/** Opening a different thread or page is a new route; re-renders on the same one are not. */
export function routeKey(route: Route): string {
  if (route.activeThreadId) return `thread:${route.activeThreadId}`;
  if (route.navItemId) return `nav:${route.navItemId}`;
  return `path:${route.pathname}`;
}

/** The view that claims the route, in tab order. */
export function routeOwner(views: readonly FollowingView[], route: Route): string | null {
  for (const view of views) {
    const { threads, navItems, routePrefixes } = view.follows;
    if (route.activeThreadId && threads) return view.id;
    if (!route.activeThreadId && route.navItemId && navItems?.includes(route.navItemId)) return view.id;
    if (!route.activeThreadId && routePrefixes?.some((prefix) => prefix && route.pathname.startsWith(prefix))) return view.id;
  }
  return null;
}

export interface Selection {
  /** Selected view id; null when no view is available. */
  active: string | null;
  /** Route the selection last followed. */
  routeKey: string | null;
  /**
   * The tab was chosen by default (first view), not by the route or the user. Providers load in any order, so a
   * default gives way to a view that claims the route or comes first once it registers; a real choice stays.
   */
  fallback: boolean;
  /**
   * A real choice whose view is missing for now (window reload, provider reload): it comes back when the view
   * registers again, until the route changes.
   */
  wanted: string | null;
}

export const NO_SELECTION: Selection = { active: null, routeKey: null, fallback: true, wanted: null };

/**
 * Follow the route: a new route selects the view that claims it. Otherwise a manual pick stays until the route
 * changes. A selected view that went away gives way to the first available one, so no tab is left empty.
 */
export function follow(selection: Selection, views: readonly FollowingView[], route: Route): Selection {
  const key = routeKey(route);
  const available = (id: string | null) => id !== null && views.some((view) => view.id === id);
  let { active, fallback, wanted } = selection;
  if (key !== selection.routeKey) {
    wanted = null;
    const owner = routeOwner(views, route);
    if (owner) { active = owner; fallback = false; }
  } else if (fallback) {
    // Same route, tab chosen by default: the user's earlier choice first, then the route's owner, then tab order.
    const owner = routeOwner(views, route);
    if (available(wanted)) { active = wanted; fallback = false; wanted = null; }
    else if (owner) { active = owner; fallback = wanted !== null; } // stands in while the wanted view is away
    else active = views[0]?.id ?? null;
  }
  if (!available(active)) {
    if (!fallback && active !== null) wanted = active;
    active = views[0]?.id ?? null;
    fallback = true;
  }
  return active === selection.active && key === selection.routeKey && fallback === selection.fallback && wanted === selection.wanted
    ? selection : { active, routeKey: key, fallback, wanted };
}

/** A manual pick: changes only the tab, never the page. */
export function pick(selection: Selection, views: readonly FollowingView[], id: string): Selection {
  return views.some((view) => view.id === id) && (selection.active !== id || selection.fallback || selection.wanted !== null)
    ? { ...selection, active: id, fallback: false, wanted: null } : selection;
}

/** The tab strip appears only when there is a choice; a single view keeps the whole height. */
export function tabsVisible(viewCount: number): boolean {
  return viewCount > 1;
}

/** Providers load after the host; until this passes, no views means «still loading», not «nothing installed». */
export const EMPTY_GRACE_MS = 2500;

export type Availability = "ready" | "waiting" | "empty" | "incompatible";

export function availability(viewCount: number, sinceMountMs: number, compatible: boolean): Availability {
  if (!compatible) return "incompatible";
  if (viewCount > 0) return "ready";
  return sinceMountMs < EMPTY_GRACE_MS ? "waiting" : "empty";
}

/** Next tab for arrow keys, wrapping; Home/End jump. */
export function neighbour(ids: readonly string[], current: string | null, key: string): string | null {
  if (!ids.length) return null;
  const index = Math.max(0, current === null ? 0 : ids.indexOf(current));
  if (key === "Home") return ids[0];
  if (key === "End") return ids[ids.length - 1];
  if (key === "ArrowRight" || key === "ArrowDown") return ids[(index + 1) % ids.length];
  if (key === "ArrowLeft" || key === "ArrowUp") return ids[(index - 1 + ids.length) % ids.length];
  return null;
}

/**
 * Lucide icons the host draws before tab labels (contract v1 `icon`, W-07). A short list, not all of Lucide: the host
 * bundles only these (icons.tsx maps each name to its artwork; the type keeps the two in step). bb's own
 * experimental_Icon is not used: it draws a lightning bolt for names it does not know.
 */
export const TAB_ICONS = [
  "History", "FileText", "Files", "Folder", "FolderGit2", "Layers3", "ListTodo", "ListChecks", "Server", "Rocket",
  "Inbox", "MessageSquare", "Bot", "GitBranch", "Bell", "Search", "FlaskConical",
] as const;
export type TabIcon = (typeof TAB_ICONS)[number];
const TAB_ICON_SET: ReadonlySet<string> = new Set(TAB_ICONS);

/**
 * The icon a registration asks for, when the host draws it: a lucide-react name (`FileText`) or its kebab-case form
 * (`file-text`). Anything else — an unknown name, not a string — gives null: the tab shows its label alone.
 */
export function tabIcon(value: unknown): TabIcon | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const name = value.trim().split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  return TAB_ICON_SET.has(name) ? (name as TabIcon) : null;
}

const countFormat = new Intl.NumberFormat("ru-RU");
const plural = new Intl.PluralRules("ru");

/** The counter beside a tab label: what waits for the user (D29 «ждёт вас»). */
export function badgeText(count: number): string {
  return countFormat.format(count);
}

/** The counter for screen readers, read after the tab label: «2 ждут вас», «1 ждёт вас», «21 ждёт вас». */
export function badgeLabel(count: number): string {
  return `${countFormat.format(count)} ${plural.select(count) === "one" ? "ждёт" : "ждут"} вас`;
}
