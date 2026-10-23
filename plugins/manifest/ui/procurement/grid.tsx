// The table look of the procurement sheet, shared by its tabs: header cells, money with
// the currency sign and the «набор» mark; a deep view with its sticky bar.
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { BackBar } from "../workspace/nav";

export const th = "py-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

const CURRENCY_SIGN: Record<string, string> = { KZT: "₸", INR: "₹", USD: "$", RUB: "₽", EUR: "€", GBP: "£", AED: "AED", CNY: "¥" };

/** A price for a table cell: whole units and the currency sign. */
export const money = (v: number | null | undefined, cur: string) =>
  v === null || v === undefined ? "—" : `${Math.round(v).toLocaleString("ru-RU")} ${CURRENCY_SIGN[cur] ?? cur}`.trim();

/** A set with battery and charger. */
export function KitMark() {
  return (
    <span className="flex-none rounded bg-[color-mix(in_oklab,var(--mf-blue)_12%,white)] px-1 text-[10px] font-medium text-[var(--mf-blue)]" title="Набор с аккумулятором и зарядным">
      набор
    </span>
  );
}

/** A group header row: the category with its counts. */
export function GroupRow({ colSpan, title, note }: { colSpan: number; title: string; note: string }) {
  return (
    <tr className="bg-[var(--mf-surface-strong)]">
      <td colSpan={colSpan} className="px-3 py-1 text-[11px] font-semibold">
        {title}
        <span className="ml-1.5 font-normal text-muted-foreground">{note}</span>
      </td>
    </tr>
  );
}

/** The scroll container of a procurement tab (NeedSheet marks it). */
export const SCROLL_ATTR = "data-mf-scroll";
export const scrollerOf = (el: Element | null) => el?.closest<HTMLElement>(`[${SCROLL_ATTR}]`) ?? null;

/**
 * A view one level deep in a tab (a country's assortment, an organisation's catalog): its
 * bar — «← back», what it is, its actions — sticks to the top of the tab while the person
 * scrolls, so the way back and the decision are always at hand. Table heads below stick
 * under the bar (`top-[var(--mf-sticky,0px)]`).
 */
export function DeepView({ back, onBack, title, meta, actions, children }: {
  back: string;
  onBack: () => void;
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <StickySection bar={<BackBar back={back} onBack={onBack} title={title} meta={meta} actions={actions} className="shadow-[0_1px_0_var(--mf-line-300)]" />}>
      {children}
    </StickySection>
  );
}

/** A bar that sticks to the top of the tab over its section; table heads stick under it. */
export function StickySection({ bar, children }: { bar: React.ReactNode; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setH(el.offsetHeight);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="flex flex-col" style={{ "--mf-sticky": `${h}px` } as React.CSSProperties}>
      <div ref={ref} className="sticky top-0 z-20">
        {bar}
      </div>
      {children}
    </div>
  );
}

/**
 * Going one level deep and back keeps the place: the list scrolls to the top for the deep
 * view and returns to where the person was.
 */
export function useDeep<T>(anchor: React.RefObject<HTMLElement | null>) {
  const [deep, setDeep] = useState<T | null>(null);
  const saved = useRef(0);
  const go = useCallback(
    (to: T | null) => {
      const sc = scrollerOf(anchor.current);
      if (to !== null) {
        if (sc && deep === null) saved.current = sc.scrollTop;
        setDeep(to);
        requestAnimationFrame(() => {
          const s = scrollerOf(anchor.current);
          if (s) s.scrollTop = 0;
        });
      } else {
        setDeep(null);
        requestAnimationFrame(() => {
          const s = scrollerOf(anchor.current);
          if (s) s.scrollTop = saved.current;
        });
      }
    },
    [anchor, deep],
  );
  return [deep, go] as const;
}
