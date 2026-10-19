// Примитивы виджетов в стиле Manifest (EP-101, демошит docs/brand/manifest-bb-widgets-demo.html).
// Классы — ui/manifest/manifest.css; цвет статуса — только здесь, не утилитами по месту.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Светофор (брендбук §5): ok — готово/ушло, info — в очереди/идёт, warning — не уйдёт, error — не доставлено/блок, muted — отменено. */
export type Tone = "ok" | "info" | "warning" | "error" | "muted";

export function StatusDot({ tone, title, className }: { tone: Tone; title?: string; className?: string }) {
  return <span className={cn("mf-dot", `mf-dot--${tone}`, className)} title={title} aria-hidden={title ? undefined : true} />;
}

/** Точка + текст: состояние всегда с подписью, не только цветом. */
export function Status({ tone, children, className, title }: { tone: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)} title={title}>
      <StatusDot tone={tone} />
      <span className="min-w-0">{children}</span>
    </span>
  );
}

export type BadgeTone = "ok" | "info" | "warn" | "err" | "muted" | "volt" | "sandbox" | "live";

export function Badge({ tone, children, className, title }: { tone: BadgeTone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span className={cn("mf-badge", `mf-badge--${tone}`, className)} title={title}>
      {children}
    </span>
  );
}

/** Режим юрлица (Д-3): песочница — бирюзовая штриховка, бой — чёрный с салатовым. */
export function ModeBadge({ sandbox }: { sandbox: boolean }) {
  return sandbox ? (
    <Badge tone="sandbox" title="Песочница: письма настоящим адресатам не уходят">
      песочница
    </Badge>
  ) : (
    <Badge tone="live" title="Боевой режим: письма уходят настоящим адресатам">
      бой
    </Badge>
  );
}

/** Белая карточка с рамкой внутри панели; title — заголовок карточки (13 px, 720). */
export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={cn("mf-card flex flex-col gap-2 p-3", className)}>
      {title || actions ? (
        <div className="flex items-center gap-2">
          {title ? <h4 className="m-0 min-w-0 flex-1 text-[13px] font-bold">{title}</h4> : <span className="flex-1" />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Знак Manifest (docs/brand/manifest-mark.svg). */
export function ManifestMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 180 180" className={cn("size-4 flex-none", className)} aria-hidden="true" focusable="false">
      <g transform="translate(14 18)">
        <path d="M8 136V10h31l16 16H26v110H8Z" fill="#2E3433" />
        <path d="M24 136V24h28l39 42-16 17-27-30v83H24Z" fill="#111315" />
        <path d="M124 136V54L98 84 82 67l42-43h28v112h-28Z" fill="#111315" />
        <path d="M83 67l42-43h28L99 83 83 67Z" fill="#D7FF3F" />
      </g>
    </svg>
  );
}

/** Подпись вида объекта со знаком: «Рассылка», «Письмо»… */
export function KindLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground", className)}>
      <ManifestMark className="size-3.5" />
      {children}
    </span>
  );
}

/** Оболочка чипа в ленте чата: островок, белая карточка, полоса слева (бирюзовая в песочнице). */
export function ChipShell({ sandbox, children, className }: { sandbox?: boolean; children: ReactNode; className?: string }) {
  return <span className={cn("mf-island mf-chip my-1 flex max-w-full flex-col gap-1.5 px-2.5 py-2 text-xs", sandbox && "mf-chip--sandbox", className)}>{children}</span>;
}

/** Подтверждение действия — карточка внутри чипа или виджета. */
export function ConfirmCard({ title, children, actions, className }: { title: ReactNode; children?: ReactNode; actions: ReactNode; className?: string }) {
  return (
    <div className={cn("mf-confirm flex flex-col gap-1.5 px-2.5 py-2 text-xs", className)} role="group">
      <b className="text-[12px]">{title}</b>
      {children}
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

/** Сегментная полоса прогресса: доли в процентах по тону. */
export function Progress({ parts, className }: { parts: { tone: "ok" | "info" | "error" | "warning"; value: number }[]; className?: string }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  if (total <= 0) return <div className={cn("mf-progress", className)} />;
  return (
    <div className={cn("mf-progress", className)} aria-hidden="true">
      {parts.map((p, i) => (p.value > 0 ? <i key={i} className={p.tone} style={{ width: `${(p.value / total) * 100}%` }} /> : null))}
    </div>
  );
}

/** Статус организации → тон бейджа (Д-4: ответ — салатовый, главный результат аутрича). */
export const COMPANY_STATUS_TONE: Record<string, BadgeTone> = {
  new: "muted",
  to_qualify: "warn",
  ready: "ok",
  contacted: "info",
  replied: "volt",
  qualified: "ok",
  handed_over: "ok",
  rejected: "muted",
  do_not_contact: "err",
};
