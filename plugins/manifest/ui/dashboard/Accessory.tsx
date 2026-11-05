// Счётчик «ждут нашего ответа + просрочено» у пункта навигации дашборда.
import { useAttentionCount } from "./state";

export function AttentionAccessory() {
  const n = useAttentionCount();
  if (!n) return null;
  return (
    <span
      className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive/15 px-1 text-[10px] font-semibold text-destructive"
      title="Ждут нашего ответа и просрочено"
    >
      {n}
    </span>
  );
}

/** Host-rendered navigation badge on BB 0.48; the same store powers the 0.46 accessory. */
export function attentionBadge(count: number | null) {
  return count && count > 0 ? { count, tone: "critical" as const, label: `Ждут нашего ответа и просрочено: ${count}` } : null;
}

export function useAttentionBadge() {
  return attentionBadge(useAttentionCount());
}
