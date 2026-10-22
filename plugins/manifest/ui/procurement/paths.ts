// The procurement sheet section (ADR-051): its nav panel path and the sheet as an object.
export const NEEDS_PATH = "needs";
export const NEEDS_ID = "needs";
export const NEEDS_HUB = { kind: "needs" as const, id: "sheet", title: "Закупочный лист" };

/**
 * «Open a source in «Источники»» from anywhere (a card, «Покрытие», «Проверить»): the
 * sheet open in this window takes it at once (the event); one opened next reads it on mount.
 */
export const OPEN_SOURCE = "manifest:open-source";
let pendingSource: string | null = null;

/** Asks for a source; true when an open sheet took it. */
export function requestSource(sourceId: string): boolean {
  pendingSource = sourceId;
  const e = new CustomEvent(OPEN_SOURCE, { cancelable: true, detail: sourceId });
  window.dispatchEvent(e);
  if (e.defaultPrevented) pendingSource = null;
  return e.defaultPrevented;
}

/** The source asked for before the sheet opened (once). */
export function takeSource(): string | null {
  const s = pendingSource;
  pendingSource = null;
  return s;
}
