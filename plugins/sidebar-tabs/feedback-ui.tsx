/**
 * Видимые элементы отклика (W-06b, EP-032-T02; дизайн-система «Отклик и обратная связь», D11–D15). Эталон — этот файл
 * в plugins/document-review; плагины держат дословные копии рядом с feedback.ts и feedback.css (тест сравнивает).
 * Логика времени (150 мс, 400 мс, 1 с, повтор, откат) — в feedback.ts; здесь только разметка: стили — feedback.css,
 * иконки — геометрия Lucide (ISC) прямо в SVG, потому что не у всех плагинов есть lucide-react.
 *
 *   <button {...busyProps(state)} onClick={() => start()}><BusyIcon><SendIcon/></BusyIcon>Передать</button>
 *   <button {...busyProps(state)}><span>Сохранить</span><BusyOverlay /></button>         — кнопка без иконки (D11)
 *   <div data-fb-row-busy={rowBusy || undefined}>…</div>                                — строка открывается (D12)
 *   <header data-fb-seam-busy={refreshing || undefined}>…</header>                       — догрузка по шву (D10/D15)
 *   <article data-fb-dim={switching || undefined}>…</article>                            — переход к другому объекту (D13)
 */
import type { ReactNode } from "react";

/** Состояние команды (совместимо с CommandState из feedback.ts). */
export type BusyState = { running: boolean; busy: boolean };

/**
 * Атрибуты элемента с командой: исполняется — aria-busy и aria-disabled (не disabled: фокус остаётся на месте),
 * индикатор виден — data-fb-busy. Обработчик сам игнорирует нажатие, пока команда исполняется (createCommand).
 */
export function busyProps(state: BusyState): { "aria-busy"?: true; "aria-disabled"?: true; "data-fb-busy"?: "" } {
  return {
    ...(state.running ? { "aria-busy": true as const, "aria-disabled": true as const } : {}),
    ...(state.busy ? { "data-fb-busy": "" as const } : {}),
  };
}

const svg = (size: number, className: string | undefined, children: ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>{children}</svg>
);

/** loader-circle (Lucide) — индикатор цветом текста; вращение и reduced motion — в feedback.css. */
export function FbSpinner({ size = 16 }: { size?: number }) {
  return svg(size, "fb-spin", <path d="M21 12a9 9 0 1 1-6.219-8.56" />);
}

/** Иконка кнопки, которая на время команды становится индикатором (ячейка той же ширины). */
export function BusyIcon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return <span className="fb-ico" style={{ width: size, height: size }}>{children}<FbSpinner size={size} /></span>;
}

/** Индикатор поверх прозрачной подписи для кнопки без иконки (D11); кнопке — busyProps. */
export function BusyOverlay({ size = 16 }: { size?: number }) {
  return <span className="fb-over" aria-hidden="true"><FbSpinner size={size} /></span>;
}

/** Скелет по форме результата: строки заданной ширины (в процентах). */
export function Skeleton({ widths = [72, 90, 56], label = "Загружаю…" }: { widths?: number[]; label?: string }) {
  return <div className="fb-skel-list" role="status" aria-label={label}>
    {widths.map((width, index) => <span key={index} className="fb-skel" style={{ width: `${width}%` }} />)}
  </div>;
}

/** Долгая операция: «Проверяю 3 из 6 · amber…», рельс доли и «Отменить» (Esc обрабатывает вызывающий). */
export function ProgressLine({ verb, done, total, current, onCancel, cancelLabel = "Отменить" }:
  { verb: string; done: number; total: number; current?: string | null; onCancel?: () => void; cancelLabel?: string }) {
  const share = total > 0 ? Math.min(1, done / total) : 0;
  return <div className="fb-progress" role="status" aria-live="polite">
    <span className="fb-grow">{verb} <b>{Math.min(done + 1, total)} из {total}</b>{current ? ` · ${current}…` : "…"}</span>
    {onCancel && <button type="button" className="fb-btn" onClick={onCancel}>{cancelLabel}</button>}
    <span className="fb-bar" style={{ width: `${Math.round(share * 100)}%` }} />
  </div>;
}

/** Ошибка на месте: что случилось и что делать, «Повторить». */
export function InlineError({ children, onRetry, retryLabel = "Повторить" }: { children: ReactNode; onRetry?: () => void; retryLabel?: string }) {
  return <div className="fb-error" aria-live="polite">
    {svg(16, undefined, <><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></>)}
    <span className="fb-grow">{children}</span>
    {onRetry && <button type="button" className="fb-btn" onClick={onRetry}>{retryLabel}</button>}
  </div>;
}

/** Тихая пометка у места данных: фоновое обновление не удалось, показаны данные на время `at`. */
export function StaleNote({ at, reason }: { at: number; reason?: string }) {
  const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(at);
  return <span className="fb-stale" title={reason}>
    {svg(14, undefined, <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>)}
    не обновлено · {time}
  </span>;
}
