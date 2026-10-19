// Намерение «новый чат об организации» между страницей плагина и экраном нового треда BB
// (compose.tsx): sessionStorage вкладки, живёт 30 минут.
const KEY = "manifest:compose-intent";
const TTL_MS = 30 * 60_000;

/** What a new chat from BB's New thread screen is about: an organisation or the dashboard. */
export interface ComposeIntent {
  kind: "company" | "topic";
  /** organisation id; "" for the dashboard */
  id: string;
  title: string;
  at: number;
}

export function setComposeIntent(kind: ComposeIntent["kind"], id: string, title: string) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ kind, id, title, at: Date.now() } satisfies ComposeIntent));
  } catch {
    // no storage: the compose screen opens without the object
  }
}

export function readComposeIntent(): ComposeIntent | null {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null") as ComposeIntent | null;
    return v && (v.kind === "company" || v.kind === "topic") && Date.now() - v.at < TTL_MS ? v : null;
  } catch {
    return null;
  }
}

export function clearComposeIntent() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

// Последний открытый тред: рейл «Аутрич» только включает список слева и возвращает центр
// к нему (а не открывает второй реестр поверх чата).
const LAST = "manifest:last-thread";
const LAST_DASHBOARD = "manifest:last-dashboard-thread";
const RAIL = "manifest:rail-redirect-at";

/** The thread in view; a dashboard chat is also remembered for the «Дашборд» rail. */
export function rememberThread(threadId: string, dashboard = false) {
  try {
    window.sessionStorage.setItem(LAST, threadId);
    if (dashboard) window.sessionStorage.setItem(LAST_DASHBOARD, threadId);
  } catch {
    // no storage
  }
}

/**
 * Where the rail sends the centre: the last thread, or null for BB's New thread screen;
 * undefined when it already redirected a moment ago (browser «back» must not bounce).
 */
export function railTarget(section: "outreach" | "dashboard" = "outreach"): string | null | undefined {
  try {
    const at = Number(window.sessionStorage.getItem(RAIL) ?? 0);
    if (Date.now() - at < 3_000) return undefined;
    window.sessionStorage.setItem(RAIL, String(Date.now()));
    return window.sessionStorage.getItem(section === "dashboard" ? LAST_DASHBOARD : LAST);
  } catch {
    return null;
  }
}
