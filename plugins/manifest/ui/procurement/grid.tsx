// The table look of the procurement sheet, shared by its tabs: header cells, money with
// the currency sign and the «набор» mark.

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
