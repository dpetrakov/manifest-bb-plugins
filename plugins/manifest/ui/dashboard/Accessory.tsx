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
