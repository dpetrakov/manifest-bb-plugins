// Вкладка «Поставщики» хоста левого сайдбара sidebar-tabs (контракт v1).
// Без хоста ничего не рисуется: реестр доступен пунктом навигации «Аутрич».
import { Component, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { registerView, revision, subscribe, viewSlot } from "@/lib/sidebar-tabs-contract";
import { useAttentionCount } from "./dashboard/state";
import { RegistryList } from "./RegistryList";

export const PLUGIN_ID = "manifest";
const VIEW_ID = `${PLUGIN_ID}/outreach`;

export function SidebarView() {
  const [generation, setGeneration] = useState<number | null>(null);
  const [badge, setBadge] = useState<((n: number | null) => void) | null>(null);
  const count = useAttentionCount();
  useLayoutEffect(() => {
    const result = registerView({
      contract: 1,
      id: VIEW_ID,
      pluginId: PLUGIN_ID,
      title: "Поставщики",
      order: 20,
      icon: "Search",
      follows: { routePrefixes: [`/plugins/${PLUGIN_ID}/`] },
    });
    if (!result.ok) {
      console.warn(`[manifest] sidebar view not registered: ${result.message}`);
      return;
    }
    setGeneration(result.generation);
    setBadge(() => result.setBadge);
    return () => {
      result.dispose();
      setGeneration(null);
      setBadge(null);
    };
  }, []);
  // Счётчик «ждут нашего ответа + просрочено» на вкладке (§6.5).
  useLayoutEffect(() => {
    badge?.(count ? count : null);
  }, [badge, count]);
  useSyncExternalStore(subscribe, revision, revision);
  const slot = generation === null ? null : viewSlot(VIEW_ID, generation);
  if (!slot) return null;
  return createPortal(
    <div data-bb-plugin={PLUGIN_ID} className="h-full">
      <ViewBoundary>
        <RegistryList onNavigate={() => slot.props.onNavigate()} />
      </ViewBoundary>
    </div>,
    slot.element,
  );
}

/** A broken list stays inside its tab: the host and other tabs keep working. */
class ViewBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
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
