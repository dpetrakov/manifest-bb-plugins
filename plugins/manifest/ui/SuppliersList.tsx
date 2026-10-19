// Список потенциальных поставщиков в сайдбаре bb (с 0.5.0 вместо вкладки хоста
// sidebar-tabs). Плагин сам регистрирует список тредов `manifest/suppliers`, а кнопка
// в подвале сайдбара переключает список: поставщики ↔ то, что было до этого
// (список bb, вкладки сайдбара и т. п.). Раздел «Аутрич» включает список сам.
//
// Слот списка тредов в bb — эксклюзивный: в режиме «автоматически» (`__automatic__`)
// bb берёт первый сторонний список. Чтобы поставщики не перехватывали сайдбар, когда
// их не включали, список при показе «не по выбору» сразу возвращает прежний.
import { Component, useEffect, useLayoutEffect, type ReactNode } from "react";
import { useSdk, type PluginThreadListProps } from "@get-bb/plugin-sdk/app";
import { RegistryList } from "./RegistryList";

export const PLUGIN_ID = "manifest";
export const SUPPLIERS_LIST = `${PLUGIN_ID}/suppliers`;
export const PROVIDER_KEY = "sidebar.threadListProvider";
const STANDARD = "thread-list/thread-list";
const AUTOMATIC = "__automatic__";
const SIDEBAR_TABS = "sidebar-tabs/tabs";
/** Подпись кнопки в подвале — по ней же её находит стиль (suppliers.css). */
export const FOOTER_LABEL = "Потенциальные поставщики";
const PREV_KEY = "manifest:sidebar-previous-list";
const TOGGLE_EVENT = "manifest:suppliers-list";

type Sdk = ReturnType<typeof useSdk>;
type Target = "toggle" | "on" | "off";

async function readList(sdk: Sdk): Promise<{ value: string; revision: number }> {
  const { preferences } = await sdk.system.uiPreferences.list();
  const p = preferences[PROVIDER_KEY] as { value: unknown; revision: number };
  return { value: typeof p.value === "string" ? p.value : AUTOMATIC, revision: p.revision };
}

/** Куда вернуть сайдбар: что было до поставщиков; «автоматически» — явно, чтобы не выбрать снова нас. */
async function previousList(sdk: Sdk): Promise<string> {
  let prev: string | null = null;
  try {
    prev = window.localStorage.getItem(PREV_KEY);
  } catch {
    prev = null;
  }
  if (prev && prev !== AUTOMATIC && prev !== SUPPLIERS_LIST) return prev;
  try {
    const { plugins } = await sdk.plugins.list();
    if (plugins.some((p) => p.id === "sidebar-tabs" && p.enabled)) return SIDEBAR_TABS;
  } catch {
    // нет доступа к списку плагинов — штатный список bb
  }
  return STANDARD;
}

/** Переключить список; одна запись по ревизии и одна попытка при гонке с другим окном. */
export async function switchSuppliersList(sdk: Sdk, target: Target): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cur = await readList(sdk);
    const on = cur.value === SUPPLIERS_LIST;
    const want = target === "toggle" ? !on : target === "on";
    if (want === on) return;
    let value: string;
    if (want) {
      try {
        window.localStorage.setItem(PREV_KEY, cur.value);
      } catch {
        // без localStorage вернёмся к спискам по умолчанию
      }
      value = SUPPLIERS_LIST;
    } else {
      value = await previousList(sdk);
    }
    try {
      await sdk.system.uiPreferences.set({ key: PROVIDER_KEY, value, expectedRevision: cur.revision });
      return;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
}

/** Кнопка подвала не получает SDK: она шлёт событие, слушатель в оверлее переключает. */
export const requestSuppliersToggle = () => {
  window.dispatchEvent(new CustomEvent(TOGGLE_EVENT, { cancelable: true, detail: "toggle" }));
};

/** Показать поставщиков (раздел «Аутрич» и т. п.). */
export const requestSuppliersShow = () => {
  window.dispatchEvent(new CustomEvent(TOGGLE_EVENT, { cancelable: true, detail: "on" }));
};

let busy = false;

/** Оверлей: слушает кнопку подвала и просьбы показать список. */
export function SuppliersSwitch() {
  const sdk = useSdk();
  useEffect(() => {
    const handle = (event: Event) => {
      // Второй слушатель (старая сборка во время перезагрузки) видит, что событие занято.
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (busy) return;
      busy = true;
      const target = ((event as CustomEvent).detail as Target) ?? "toggle";
      switchSuppliersList(sdk, target)
        .catch((error: unknown) => console.warn("[manifest] список поставщиков не переключился", error))
        .finally(() => {
          busy = false;
        });
    };
    window.addEventListener(TOGGLE_EVENT, handle);
    return () => window.removeEventListener(TOGGLE_EVENT, handle);
  }, [sdk]);
  return null;
}

/** Список тредов «Потенциальные поставщики». */
export function SuppliersList({ onNavigate, activeThreadId }: PluginThreadListProps) {
  const sdk = useSdk();
  // Пока список показан, кнопка подвала — «включена» (плотнее тон, рамка).
  useLayoutEffect(() => {
    document.documentElement.dataset.manifestSuppliers = "on";
    return () => {
      delete document.documentElement.dataset.manifestSuppliers;
    };
  }, []);
  // Показали «автоматически», а не по выбору: вернуть прежний список.
  useEffect(() => {
    let alive = true;
    void readList(sdk)
      .then(async (cur) => {
        if (!alive || cur.value === SUPPLIERS_LIST) return;
        const value = await previousList(sdk);
        if (value !== SUPPLIERS_LIST) await sdk.system.uiPreferences.set({ key: PROVIDER_KEY, value, expectedRevision: cur.revision });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [sdk]);
  return (
    <div data-bb-plugin={PLUGIN_ID} className="h-full">
      <ListBoundary>
        <RegistryList onNavigate={onNavigate} activeThreadId={activeThreadId} />
      </ListBoundary>
    </div>
  );
}

/** Сломанный список не роняет сайдбар. */
class ListBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex flex-col gap-2 px-3 py-2 text-sm text-muted-foreground">
        <span>Реестр не отрисовался: {this.state.error.message}</span>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="self-start rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-state-hover"
        >
          Повторить
        </button>
      </div>
    );
  }
}
