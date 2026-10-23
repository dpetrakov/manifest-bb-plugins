// One way to move inside a section of the panel («Почта аутрича», «Закупочный лист»): the
// section's tabs are always on top, and an object or a list one level deep has a single
// compact line «← where you came from · what is open» with its actions on the right.
import { cn } from "@/lib/utils";

/** The tabs of a section; a person always sees where in the section they are. */
export function SectionTabs({
  tabs,
  active,
  onSelect,
  label,
}: {
  tabs: readonly (readonly [string, string])[];
  active: string;
  onSelect: (key: string) => void;
  label: string;
}) {
  return (
    <nav className="mf-surface flex flex-none gap-1 overflow-x-auto border-b border-border px-1.5 @[24rem]:px-3" aria-label={label}>
      {tabs.map(([k, title]) => (
        <button
          key={k}
          type="button"
          onClick={() => onSelect(k)}
          aria-current={active === k ? "page" : undefined}
          className={cn(
            "-mb-px flex-none whitespace-nowrap border-b-2 px-2 py-2 text-xs @[24rem]:px-3",
            active === k ? "border-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {title}
        </button>
      ))}
    </nav>
  );
}

/**
 * «← back · title» in one line (it wraps only on a phone with long actions): the way back
 * and what is open never take a screen of their own.
 */
export function BackBar({
  back,
  onBack,
  title,
  kind,
  meta,
  actions,
  className,
}: {
  back: string;
  onBack: () => void;
  title: React.ReactNode;
  /** What the object is («Шаблон», «Рассылка»), small before the title. */
  kind?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mf-surface flex flex-col gap-0.5 border-b border-border px-3 py-1.5 text-xs", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          className="-ml-1 flex-none rounded px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-state-hover hover:text-foreground"
          onClick={onBack}
          title={`Назад: ${back}`}
        >
          ← {back}
        </button>
        <span aria-hidden className="text-muted-foreground/60">·</span>
        {/* At least 8rem for what is open: on a phone the actions wrap to the next line. */}
        <span className="flex min-w-[8rem] flex-1 items-center gap-1.5">
          {kind ? <span className="flex-none text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{kind}</span> : null}
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-bold leading-snug">{title}</span>
        </span>
        {actions ? <span className="flex flex-none flex-wrap items-center gap-1.5">{actions}</span> : null}
      </div>
      {meta ? <div className="text-[11px] text-muted-foreground">{meta}</div> : null}
    </div>
  );
}
