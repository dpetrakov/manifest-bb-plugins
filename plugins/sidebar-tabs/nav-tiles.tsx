// Плитки разделов: навигация сайдбара (слот experimental_sidebarNavigation) рядом иконок, переносится в несколько рядов.
// Плитку можно перетащить: внутри сайдбара — переставить (порядок пишет bb, sidebar.pluginPanelOrder), за правый край
// сайдбара — открыть раздел в выбранной части рабочей зоны (перетаскивание bb, experimental_useSidebarNavigationSplit).
// «Настроить панель» открывает редактор bb: что показывать и в каком порядке.
import { NavigationIcon as RuntimeNavigationIcon, type NavItem, type NavState, useSidebarNavigation as runtimeNavigation, useSidebarNavigationSplit as runtimeSplit } from "./nav-runtime.ts";
import { Settings2 } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { mergeOrder, moveId, nearestSlot, PENDING_ORDER_MS, REORDER_THRESHOLD_PX, shownOrder, tileKey, type Rect } from "./tiles-model.ts";

type Navigation = NavState;
type Item = NavItem;
// NavTiles is registered only where the navigation slot exists (bb 0.45), and these come with it.
const useSidebarNavigation = runtimeNavigation!;
const useSidebarNavigationSplit = runtimeSplit!;
const NavigationIcon = RuntimeNavigationIcon!;
type Drag = { id: string; pointerId: number; x0: number; y0: number; order: readonly string[]; slots: Rect[]; engaged: boolean };

function Tile({ item, index, focusIndex, active, showShortcut, dragging, hintId, onPress, onKey, register, suppressClick, activate }: {
  item: Item; index: number; focusIndex: number; active: boolean; showShortcut: boolean; dragging: boolean; hintId: string;
  onPress: (event: ReactPointerEvent<HTMLButtonElement>, id: string) => void;
  onKey: (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => void;
  register: (index: number, element: HTMLButtonElement | null) => void;
  suppressClick: () => boolean;
  activate: Navigation["actions"]["activate"];
}) {
  const split = useSidebarNavigationSplit(item.id);
  const Accessory = item.experimental_Accessory;
  const unavailable = item.isDisabled || item.isLoading;
  return <li className="st-tile-cell" data-tile-id={item.id}>
    <button type="button" ref={(element) => register(index, element)} className="st-tile" tabIndex={index === focusIndex ? 0 : -1}
      aria-label={item.label} aria-current={active ? "page" : undefined} aria-disabled={unavailable || undefined} aria-describedby={hintId}
      aria-keyshortcuts={item.shortcut?.ariaKeyShortcuts} title={item.shortcut ? `${item.label} · ${item.shortcut.label}` : item.label}
      data-dragging={dragging || undefined} data-loading={item.isLoading || undefined}
      onPointerDown={(event) => { split.splitProps.onPointerDown?.(event); onPress(event, item.id); }}
      onClick={(event) => {
        if (suppressClick() || unavailable) return;
        activate(item.id, { openInSplit: event.metaKey || event.ctrlKey });
      }}
      onKeyDown={(event) => onKey(event, index)}>
      <NavigationIcon icon={item.icon} className="st-tile__icon" />
    </button>
    {Accessory && <span className="st-tile__badge"><Accessory /></span>}
    {showShortcut && item.shortcut && <kbd className="st-tile__key" aria-hidden="true">{item.shortcut.label}</kbd>}
  </li>;
}

export function NavTiles(_props: { isCompactViewport: boolean }) {
  const { items, activeItemId, isShortcutModifierHeld, actions } = useSidebarNavigation();
  const hintId = useId();
  const visible = useMemo(() => items.filter((item) => item.isVisible), [items]);
  const byId = useMemo(() => new Map(visible.map((item) => [item.id, item])), [visible]);
  const visibleIds = useMemo(() => visible.map((item) => item.id), [visible]);
  // A saved order is drawn at once and gives way to bb's order when it comes back (or after a while if it never does).
  const [pending, setPending] = useState<readonly string[] | null>(null);
  useEffect(() => {
    if (!pending) return;
    if (pending.every((id, index) => visibleIds[index] === id)) { setPending(null); return; }
    const timer = window.setTimeout(() => setPending(null), PENDING_ORDER_MS);
    return () => window.clearTimeout(timer);
  }, [pending, visibleIds]);
  const order = shownOrder(visibleIds, pending);
  const [preview, setPreview] = useState<readonly string[] | null>(null);
  const previewRef = useRef<readonly string[] | null>(null);
  const shown = (preview ?? order).map((id) => byId.get(id)).filter((item): item is Item => !!item);
  const [announcement, setAnnouncement] = useState("");

  const save = useCallback((next: readonly string[]) => {
    if (next.every((id, index) => order[index] === id)) return;
    setPending(next);
    actions.setOrder(mergeOrder(items, next));
  }, [actions, items, order]);

  // Roving focus: one tab stop for the whole row (tiles and «Настроить панель»), arrows inside it.
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const register = useCallback((index: number, element: HTMLButtonElement | null) => { buttons.current[index] = element; }, []);
  const activeIndex = Math.max(0, shown.findIndex((item) => item.id === activeItemId));
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const tabStop = Math.min(focusIndex ?? activeIndex, shown.length);
  const focusAfterMove = useRef<string | null>(null);
  useLayoutEffect(() => {
    const id = focusAfterMove.current;
    if (!id) return;
    focusAfterMove.current = null;
    const index = shown.findIndex((item) => item.id === id);
    if (index >= 0) { setFocusIndex(index); buttons.current[index]?.focus(); }
  });
  const onKey = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const isTile = index < shown.length;
    const key = tileKey(event.key, event.altKey, index, shown.length + 1);
    if (!key) return;
    event.preventDefault();
    if (key.kind === "focus") { setFocusIndex(key.index); buttons.current[key.index]?.focus(); return; }
    if (!isTile) return;
    const item = shown[index];
    const target = Math.min(key.index, shown.length - 1);
    if (target === index) return;
    focusAfterMove.current = item.id;
    save(moveId(order, item.id, target));
    setAnnouncement(`«${item.label}»: место ${target + 1} из ${shown.length}`);
  }, [shown, order, save]);

  // Reorder by dragging inside the sidebar. bb's own drag to a pane starts from the same press once the pointer leaves
  // the sidebar and sends Escape, which cancels the reorder.
  const drag = useRef<Drag | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const suppress = useRef(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  const onPress = useCallback((event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    suppress.current = false;
    if (event.button !== 0 || !event.isPrimary || event.pointerType === "touch" || shown.length < 2) return;
    cleanup.current?.();
    drag.current = { id, pointerId: event.pointerId, x0: event.clientX, y0: event.clientY, order, slots: [], engaged: false };
    const finish = (commit: boolean) => {
      const current = drag.current;
      cleanup.current?.();
      if (!current?.engaged) return;
      suppress.current = true;
      const next = previewRef.current;
      previewRef.current = null;
      setPreview(null);
      setDraggingId(null);
      if (commit && next) {
        save(next);
        const label = byId.get(current.id)?.label ?? "";
        setAnnouncement(`«${label}»: место ${next.indexOf(current.id) + 1} из ${next.length}`);
      }
    };
    const move = (moved: PointerEvent) => {
      const current = drag.current;
      if (!current || moved.pointerId !== current.pointerId) return;
      if (!current.engaged) {
        if (Math.hypot(moved.clientX - current.x0, moved.clientY - current.y0) < REORDER_THRESHOLD_PX) return;
        current.engaged = true;
        current.slots = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-tile-id]") ?? [], (cell) => cell.getBoundingClientRect());
        setDraggingId(current.id);
      }
      const slot = nearestSlot(current.slots, moved.clientX, moved.clientY);
      if (slot < 0) return;
      const next = moveId(current.order, current.id, slot);
      if (previewRef.current?.every((value, index) => next[index] === value)) return;
      previewRef.current = next;
      setPreview(next);
    };
    const up = (released: PointerEvent) => { if (released.pointerId === drag.current?.pointerId) finish(true); };
    const cancel = (cancelled: PointerEvent) => { if (cancelled.pointerId === drag.current?.pointerId) finish(false); };
    const escape = (pressed: KeyboardEvent) => { if (pressed.key === "Escape") finish(false); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", escape, true);
    cleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", escape, true);
      cleanup.current = null;
      drag.current = null;
    };
  }, [shown.length, order, save, byId]);
  const suppressClick = useCallback(() => {
    if (!suppress.current) return false;
    suppress.current = false;
    return true;
  }, []);

  return <nav data-sidebar-tiles="" className="st-tiles" aria-label="Разделы" data-reordering={draggingId ? "" : undefined}>
    <ul ref={listRef} role="toolbar" aria-label="Разделы" aria-orientation="horizontal" className="st-tiles__grid">
      {shown.map((item, index) => <Tile key={item.id} item={item} index={index} focusIndex={tabStop} active={item.id === activeItemId}
        showShortcut={isShortcutModifierHeld} dragging={item.id === draggingId} hintId={hintId}
        onPress={onPress} onKey={onKey} register={register} suppressClick={suppressClick} activate={actions.activate} />)}
      <li className="st-tile-cell">
        <button type="button" ref={(element) => register(shown.length, element)} className="st-tile st-tile--settings"
          tabIndex={tabStop === shown.length ? 0 : -1} aria-label="Настроить панель" title="Настроить панель: что показывать и в каком порядке"
          onClick={() => actions.openCustomize()} onKeyDown={(event) => onKey(event, shown.length)}>
          <Settings2 aria-hidden="true" width={16} height={16} strokeWidth={1.75} />
        </button>
      </li>
    </ul>
    <span id={hintId} className="st-sr">Перетащите плитку, чтобы переставить; за правый край сайдбара — чтобы открыть раздел рядом. Alt и стрелки — переставить с клавиатуры.</span>
    <span role="status" className="st-sr">{announcement}</span>
  </nav>;
}
