// Плитки разделов (навигация сайдбара): чистая логика порядка и перетаскивания, без React и DOM — её проверяют тесты.

/** Pointer travel before a press on a tile becomes a reorder drag (a click below it). */
export const REORDER_THRESHOLD_PX = 6;
/** How long a saved order waits to come back from bb before the tiles show bb's order again. */
export const PENDING_ORDER_MS = 4000;

export type Rect = { left: number; top: number; right: number; bottom: number };

/** `ids` with `id` moved to position `to` (clamped); the same array when nothing moves. */
export function moveId(ids: readonly string[], id: string, to: number): readonly string[] {
  const from = ids.indexOf(id);
  if (from < 0) return ids;
  const target = Math.max(0, Math.min(ids.length - 1, to));
  if (target === from) return ids;
  const next = ids.filter((item) => item !== id);
  next.splice(target, 0, id);
  return next;
}

/**
 * The slot of the grid snapshot (taken when the drag started) under the pointer, or the nearest one. Slots do not move
 * while the tiles are rearranged in them, so the target does not flicker as the preview reflows.
 */
export function nearestSlot(slots: readonly Rect[], x: number, y: number): number {
  let best = -1;
  let bestDistance = Infinity;
  slots.forEach((slot, index) => {
    const dx = x < slot.left ? slot.left - x : x > slot.right ? x - slot.right : 0;
    const dy = y < slot.top ? slot.top - y : y > slot.bottom ? y - slot.bottom : 0;
    // Rows first: a pointer between two rows belongs to the row it is closer to, then to the nearest tile in it.
    const distance = dy * 100 + dx;
    if (distance < bestDistance) { best = index; bestDistance = distance; }
  });
  return best;
}

/**
 * The full order to save: the visible items take their new order in the positions visible items held; hidden items
 * keep their places, so hiding something later does not shuffle the rest.
 */
export function mergeOrder(all: readonly { id: string; isVisible: boolean }[], visibleOrder: readonly string[]): string[] {
  const queue = visibleOrder.filter((id) => all.some((item) => item.id === id && item.isVisible));
  const rest = all.filter((item) => item.isVisible && !queue.includes(item.id)).map((item) => item.id);
  const fill = [...queue, ...rest];
  return all.map((item) => (item.isVisible ? fill.shift() ?? item.id : item.id));
}

/** The order to draw: a saved order still on its way to bb wins while it holds exactly the same tiles. */
export function shownOrder(visible: readonly string[], pending: readonly string[] | null): readonly string[] {
  if (!pending || pending.length !== visible.length || !pending.every((id) => visible.includes(id))) return visible;
  return pending;
}

/** Keyboard on a tile: arrows and Home/End move focus; with Alt (Option) the arrows move the tile itself. */
export type TileKey = { kind: "focus"; index: number } | { kind: "move"; index: number } | null;
export function tileKey(key: string, alt: boolean, index: number, count: number): TileKey {
  const step = key === "ArrowLeft" || key === "ArrowUp" ? -1 : key === "ArrowRight" || key === "ArrowDown" ? 1 : 0;
  if (alt && step) return { kind: "move", index: Math.max(0, Math.min(count - 1, index + step)) };
  if (step) return { kind: "focus", index: (index + step + count) % count };
  if (key === "Home") return { kind: "focus", index: 0 };
  if (key === "End") return { kind: "focus", index: count - 1 };
  return null;
}
