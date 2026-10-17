/**
 * Отклик на действия пользователя (W-06b, EP-032) — одна реализация шкалы дизайн-системы для всех плагинов
 * bb-workbench («Отклик и обратная связь» в docs/plugins/document-review/design/design-system.md).
 *
 * Эталон — этот файл в plugins/document-review; плагины держат его дословные копии (feedback.ts в корне плагина),
 * тест document-review сравнивает копии с эталоном. Здесь только логика состояний; вид (индикатор в кнопке, полоса
 * в строке, скелет) — классы `.fb-*` слоя плагина по согласованному демошиту.
 *
 * - `createCommand` — команда с ожиданием: признак «исполняется» сразу, индикатор — через 150 мс и держится ≥ 400 мс,
 *   «долго» — после 1 с, повтор во время исполнения не запускает команду второй раз, отмена через AbortSignal.
 * - `createOptimistic` — оптимистичное значение по ключу: новое значение сразу, запись — по одной на ключ, промежуточные
 *   схлопываются (побеждает последнее), при сбое — откат к последнему подтверждённому и сообщение.
 * - `createCoalesced` — загрузка по одной за раз; просьбы во время загрузки дают одну завершающую.
 * - `createLatest` — отбрасывание ответов на устаревшие запросы (переключили документ, проект, фильтр).
 * - `useCommand`, `useOptimisticValue`, `useCoalesced` — тонкие обёртки для React.
 * - `useDelayedFlag`, `useSlowFlag` — та же шкала для состояний, которые не команды (документ открывается, пометки
 *   догружаются): флаг через 150 мс и не короче 400 мс после показа; «долго» — после 1 с.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Шкала дизайн-системы: задержка показа индикатора, его минимальное время, порог «долго» (мс). */
export const FEEDBACK = { delayMs: 150, minMs: 400, slowMs: 1000 } as const;

/** Часы для тестов; по умолчанию — глобальные. */
export type Clock = { now: () => number; setTimeout: (run: () => void, ms: number) => unknown; clearTimeout: (handle: unknown) => void };
const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type CommandState = {
  /** Команда исполняется (с первого кадра): элемент — aria-busy и aria-disabled, повтор игнорируется. */
  running: boolean;
  /** Индикатор виден: исполнение дольше `delayMs`; после показа держится не меньше `minMs`. */
  busy: boolean;
  /** Исполнение дольше `slowMs`: пояснение и, где можно, «Отменить». */
  slow: boolean;
  /** Ошибка последнего запуска (сбрасывается при следующем). */
  error: unknown;
};
export const idleCommand: CommandState = { running: false, busy: false, slow: false, error: null };

export type CommandOptions = { delayMs?: number; minMs?: number; slowMs?: number; clock?: Clock; onChange?: (state: CommandState) => void };

export function createCommand<A extends unknown[], R>(run: (signal: AbortSignal, ...args: A) => Promise<R>, options: CommandOptions = {}) {
  const clock = options.clock ?? systemClock;
  const delayMs = options.delayMs ?? FEEDBACK.delayMs;
  const minMs = options.minMs ?? FEEDBACK.minMs;
  const slowMs = options.slowMs ?? FEEDBACK.slowMs;
  let state: CommandState = idleCommand;
  let controller: AbortController | null = null;
  const set = (next: Partial<CommandState>) => { state = { ...state, ...next }; options.onChange?.(state); };
  return {
    get state() { return state; },
    /** Запуск; во время исполнения — `undefined` без второго вызова `run`. Ошибка не бросается — она в `state.error`. */
    async start(...args: A): Promise<R | undefined> {
      if (state.running) return undefined;
      const own = new AbortController();
      controller = own;
      let shownAt: number | null = null;
      set({ running: true, busy: false, slow: false, error: null });
      const showTimer = clock.setTimeout(() => { shownAt = clock.now(); set({ busy: true }); }, delayMs);
      const slowTimer = clock.setTimeout(() => set({ slow: true }), slowMs);
      let result: R | undefined;
      let error: unknown = null;
      try { result = await run(own.signal, ...args); } catch (cause) { error = cause; }
      clock.clearTimeout(showTimer);
      clock.clearTimeout(slowTimer);
      if (shownAt !== null) {
        const left = minMs - (clock.now() - shownAt);
        if (left > 0) await new Promise<void>((resolve) => { clock.setTimeout(resolve, left); });
      }
      if (controller === own) controller = null;
      set({ running: false, busy: false, slow: false, error });
      return error === null ? result : undefined;
    },
    /** Отмена текущего запуска (операции чтения > 1 с); `run` получает сигнал. */
    cancel() { controller?.abort(); },
  };
}

export type OptimisticOptions<K, V> = {
  /** Показать значение (сразу — новое; при сбое — подтверждённое). */
  show: (key: K, value: V) => void;
  /** Сбой записи: значение уже возвращено к подтверждённому; `retry` повторяет последнюю просьбу. */
  onError?: (key: K, error: unknown, retry: () => void) => void;
};

export function createOptimistic<K, V>(commit: (key: K, value: V) => Promise<unknown>, options: OptimisticOptions<K, V>) {
  const confirmed = new Map<K, V>();
  const wanted = new Map<K, V>();
  const writing = new Set<K>();
  async function flush(key: K): Promise<void> {
    if (writing.has(key) || !wanted.has(key)) return;
    writing.add(key);
    const value = wanted.get(key) as V;
    wanted.delete(key);
    try {
      await commit(key, value);
      confirmed.set(key, value);
    } catch (error) {
      // Newer wishes made during the failed write are dropped too: the shown value returns to the confirmed one.
      const latest = wanted.has(key) ? wanted.get(key) as V : value;
      wanted.delete(key);
      if (confirmed.has(key)) options.show(key, confirmed.get(key) as V);
      options.onError?.(key, error, () => { void apply(key, latest); });
    } finally {
      writing.delete(key);
    }
    if (wanted.has(key)) await flush(key);
  }
  /** `current` — подтверждённое значение до первого изменения ключа (то, что показано сейчас). */
  function apply(key: K, value: V, current?: V): Promise<void> {
    if (!confirmed.has(key) && current !== undefined) confirmed.set(key, current);
    wanted.set(key, value);
    options.show(key, value);
    return flush(key);
  }
  return { apply, pending: (key: K) => writing.has(key) || wanted.has(key), confirmed: (key: K) => confirmed.get(key) };
}

/** Одна загрузка за раз; просьбы во время загрузки схлопываются в одну, которая начнётся после неё. */
export function createCoalesced(load: () => Promise<void>) {
  let running: Promise<void> | null = null;
  let again = false;
  return function run(): Promise<void> {
    if (running) { again = true; return running; }
    running = load().finally(() => {
      running = null;
      if (again) { again = false; void run(); }
    });
    return running;
  };
}

/** Токен запроса: ответ применяется, только если с тех пор не начался новый запрос того же места. */
export function createLatest() {
  let current = 0;
  return { begin: () => ++current, isCurrent: (token: number) => token === current };
}

// ── React ─────────────────────────────────────────────────────────────────────────────────────────────

/** Команда для элемента интерфейса: `state` — для aria-busy, индикатора и пояснения; `start` — обработчик нажатия. */
export function useCommand<A extends unknown[], R>(run: (signal: AbortSignal, ...args: A) => Promise<R>, options: Omit<CommandOptions, "onChange"> = {}) {
  const [state, setState] = useState<CommandState>(idleCommand);
  const runRef = useRef(run);
  runRef.current = run;
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const command = useMemo(() => createCommand<A, R>((signal, ...args) => runRef.current(signal, ...args),
    { ...options, onChange: (next) => { if (mounted.current) setState(next); } }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const start = useCallback((...args: A) => command.start(...args), [command]);
  return { state, start, cancel: command.cancel };
}

/** Оптимистичные значения по ключу: `values` — показанные, `apply(key, value, current)` — изменить. */
export function useOptimisticValue<K, V>(commit: (key: K, value: V) => Promise<unknown>, onError?: (key: K, error: unknown, retry: () => void) => void) {
  const [values, setValues] = useState<ReadonlyMap<K, V>>(new Map());
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const optimistic = useMemo(() => createOptimistic<K, V>((key, value) => commitRef.current(key, value), {
    show: (key, value) => setValues((current) => new Map(current).set(key, value)),
    onError: (key, error, retry) => errorRef.current?.(key, error, retry),
  }), []);
  return { values, apply: optimistic.apply, pending: optimistic.pending };
}

/** `createCoalesced` с актуальной функцией загрузки. */
export function useCoalesced(load: () => Promise<void>) {
  const loadRef = useRef(load);
  loadRef.current = load;
  return useMemo(() => createCoalesced(() => loadRef.current()), []);
}

/** `active` дольше `delayMs` → true; после показа держится не меньше `minMs` (без мигания на быстрых ответах). */
export function useDelayedFlag(active: boolean, delayMs: number = FEEDBACK.delayMs, minMs: number = FEEDBACK.minMs): boolean {
  const [shown, setShown] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (active) {
      if (shown) return;
      const timer = setTimeout(() => { shownAt.current = Date.now(); setShown(true); }, delayMs);
      return () => clearTimeout(timer);
    }
    if (!shown) return;
    const left = minMs - (Date.now() - shownAt.current);
    if (left <= 0) { setShown(false); return; }
    const timer = setTimeout(() => setShown(false), left);
    return () => clearTimeout(timer);
  }, [active, shown, delayMs, minMs]);
  return shown;
}

/** `active` дольше 1 с — пора пояснить ожидание; гаснет сразу, как ожидание кончилось. */
export function useSlowFlag(active: boolean): boolean {
  return useDelayedFlag(active, FEEDBACK.slowMs, 0);
}
