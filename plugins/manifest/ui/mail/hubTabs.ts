// The mail hub as an object and «back to the list» of its objects (a template → «Шаблоны»,
// a mailing → «Рассылки», an inbound → «Неразобранные входящие»): the hub opens on that
// tab — at once when it is open in this window (the event), on mount otherwise.
import { useCallback } from "react";
import { useOpenObject } from "../workspace/state";

export const MAIL_HUB = { kind: "mail" as const, id: "hub", title: "Почта аутрича" };

export const OPEN_MAIL_TAB = "manifest:open-mail-tab";
let pendingTab: string | null = null;

/** Asks the hub to show a tab. */
export function requestMailTab(tab: string) {
  pendingTab = tab;
  window.dispatchEvent(new CustomEvent(OPEN_MAIL_TAB, { detail: tab }));
}

/** The tab asked for before the hub opened (once). */
export function takeMailTab(): string | null {
  const t = pendingTab;
  pendingTab = null;
  return t;
}

/** Opens the mail hub on a tab. */
export function useOpenMailTab() {
  const openObject = useOpenObject();
  return useCallback(
    (tab: string) => {
      requestMailTab(tab);
      void openObject(MAIL_HUB);
    },
    [openObject],
  );
}
