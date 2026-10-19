// Намерение «новый чат об организации» между страницей плагина и экраном нового треда BB
// (compose.tsx): sessionStorage вкладки, живёт 30 минут.
const KEY = "manifest:compose-intent";
const TTL_MS = 30 * 60_000;

/** What a new chat from BB's New thread screen is about: an organisation or the dashboard. */
export type IntentKind = "company" | "mailing" | "template" | "topic" | "inbound" | "mail";
export const INTENT_EVENT = "manifest:compose-intent";

/** What a new chat from BB's New thread screen is about. */
export interface ComposeIntent {
  kind: IntentKind;
  /** the object id; "" for the dashboard, the mail hub and a new template */
  id: string;
  title: string;
  at: number;
}

export function setComposeIntent(kind: IntentKind, id: string, title: string) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ kind, id, title, at: Date.now() } satisfies ComposeIntent));
  } catch {
    // no storage: the compose screen opens without the object
  }
  // The banner and the panel of an open New thread screen follow the new object.
  window.dispatchEvent(new Event(INTENT_EVENT));
}

export function readComposeIntent(): ComposeIntent | null {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null") as ComposeIntent | null;
    const kinds: IntentKind[] = ["company", "mailing", "template", "topic", "inbound", "mail"];
    return v && kinds.includes(v.kind) && Date.now() - v.at < TTL_MS ? v : null;
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
  window.dispatchEvent(new Event(INTENT_EVENT));
}

// Последний открытый тред: рейл «Аутрич» только включает список слева и возвращает центр
// к нему (а не открывает второй реестр поверх чата).
const LAST = "manifest:last-thread";
const LAST_DASHBOARD = "manifest:last-dashboard-thread";
const RAIL = "manifest:rail-redirect-at";

/** The thread in view; a dashboard chat is also remembered for the «Дашборд» rail. */
const LAST_MAIL = "manifest:last-mail-thread";

export function rememberThread(threadId: string, dashboard = false, mail = false) {
  try {
    window.sessionStorage.setItem(LAST, threadId);
    if (dashboard) window.sessionStorage.setItem(LAST_DASHBOARD, threadId);
    if (mail) window.sessionStorage.setItem(LAST_MAIL, threadId);
  } catch {
    // no storage
  }
}

/**
 * Where the rail sends the centre: the last thread, or null for BB's New thread screen;
 * undefined when it already redirected a moment ago (browser «back» must not bounce).
 */
export function railTarget(section: "outreach" | "dashboard" | "mail" = "outreach"): string | null | undefined {
  try {
    const at = Number(window.sessionStorage.getItem(RAIL) ?? 0);
    if (Date.now() - at < 3_000) return undefined;
    window.sessionStorage.setItem(RAIL, String(Date.now()));
    return window.sessionStorage.getItem(section === "dashboard" ? LAST_DASHBOARD : section === "mail" ? LAST_MAIL : LAST);
  } catch {
    return null;
  }
}
