// The sidebar navigation API of bb 0.45 (slot, hooks, icon) — removed in bb 0.46, where bb draws its own navigation
// rail. Taken from the runtime when it is there (the bundle reads SDK names off the runtime object, so a missing one is
// undefined, not a load error) and typed here, so the plugin compiles against SDK 0.6.15 and 0.6.49 alike (EP-097).
import * as sdkApp from "@get-bb/plugin-sdk/app";
import type { ComponentType, PointerEvent as ReactPointerEvent } from "react";

export type NavIcon = unknown;
export type NavItem = {
  id: string; label: string; icon: NavIcon; isDisabled: boolean; isVisible: boolean; isLoading: boolean;
  shortcut: { label: string; ariaKeyShortcuts: string } | null; experimental_Accessory: ComponentType | null;
};
export type NavState = {
  items: readonly NavItem[]; activeItemId: string | null; isShortcutModifierHeld: boolean;
  actions: { activate(itemId: string, options: { openInSplit: boolean }): void; setOrder(itemIds: readonly string[]): void; openCustomize(): void };
};
export type NavSplit = { splitProps: { onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void } };
export type NavSlot = (registration: { id: string; title: string; description?: string; component: ComponentType<{ isCompactViewport: boolean }> }) => void;

const runtime = sdkApp as unknown as Record<string, unknown>;
/** Present on bb 0.45 only; NavTiles is registered (and these are called) only when the slot exists. */
export const useSidebarNavigation = runtime.experimental_useSidebarNavigation as (() => NavState) | undefined;
export const useSidebarNavigationSplit = runtime.experimental_useSidebarNavigationSplit as ((itemId: string) => NavSplit) | undefined;
export const NavigationIcon = runtime.experimental_SidebarNavigationIcon as ComponentType<{ icon: NavIcon; className?: string }> | undefined;
/** The navigation slot of `app.slots`, or undefined on bb 0.46+. */
export function navigationSlot(slots: object): NavSlot | undefined {
  const slot = (slots as Record<string, unknown>).experimental_sidebarNavigation;
  return typeof slot === "function" ? (slot as NavSlot).bind(slots) : undefined;
}
