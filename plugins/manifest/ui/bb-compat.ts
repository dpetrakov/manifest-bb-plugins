/**
 * Public BB 0.46 / 0.48 boundary. Keep the package's 0.46 SDK pin: a newer host
 * supplies its own runtime. Feature-detect registration methods, never add a
 * field that an older collector rejects. No application data is converted.
 */
import { experimental_useAppPanel, useBbNavigate } from "@get-bb/plugin-sdk/app";
import { useCallback } from "react";

type Registration = { id: string; title: string; [key: string]: unknown };
type Slots = {
  navPanel(registration: Registration): void;
  experimental_tab?: (registration: Registration) => void;
  threadPanelAction?: (registration: Registration) => void;
  experimental_threadHeaderAction?: (registration: Registration) => void;
};
const slotsOf = (app: unknown) => (app as { slots: Slots }).slots;

export type ThreadPanelProps = { threadId: string; params: unknown };
export type ThreadHeaderProps = { threadId: string; projectId: string; isCompactViewport: boolean };

export function registerDashboard(app: unknown, registration: Registration, legacyAccessory: unknown, useBadge: () => unknown): void {
  const slots = slotsOf(app);
  slots.navPanel({ ...registration, ...(typeof slots.experimental_tab === "function"
    ? { experimental_useBadge: useBadge }
    : { experimental_sidebarAccessory: legacyAccessory }) });
}

export function registerThreadPanel(app: unknown, registration: Registration): void {
  const slots = slotsOf(app);
  if (typeof slots.experimental_tab === "function") {
    slots.experimental_tab({ ...registration, icon: registration.icon ?? "Globe", context: { kind: "thread" }, availability: "action" });
  } else if (typeof slots.threadPanelAction === "function") {
    slots.threadPanelAction(registration);
  } else throw new Error("BB does not support Manifest thread panels");
}

/**
 * BB 0.48 retains this renderer adapter. A placement:"header" item/run action
 * cannot preserve this component's live object title and compact focus control.
 * Keep that supported adapter isolated until a shared replacement is available.
 */
export function registerFocusHeader(app: unknown, registration: Registration): void {
  const slots = slotsOf(app);
  if (typeof slots.experimental_threadHeaderAction !== "function") throw new Error("BB does not support Manifest focus header");
  slots.experimental_threadHeaderAction(registration);
}

type OpenOptions = { actionId: string; title?: string; params?: unknown };
type Panel = { openTab?: (options: { tab: { id: string; context: { kind: "thread" }; availability: "action" }; title?: string; params?: unknown }) => boolean };
type Navigate = { openThreadPanel?: (options: OpenOptions) => boolean };

/** Both thread and New thread actions use a thread-context tab on their own surface. */
export function openObjectPanel(panel: unknown, navigate: unknown, options: OpenOptions): boolean {
  const current = panel as Panel;
  if (typeof current.openTab === "function") {
    const { actionId, ...rest } = options;
    return current.openTab({ tab: { id: actionId, context: { kind: "thread" }, availability: "action" }, ...rest });
  }
  const legacy = navigate as Navigate;
  return typeof legacy.openThreadPanel === "function" && legacy.openThreadPanel(options);
}

/** The hook resolves the caller's surface; never route a rejected open to another pane. */
export function useOpenThreadPanel() {
  const panel = experimental_useAppPanel();
  const navigate = useBbNavigate();
  return useCallback((options: OpenOptions) => openObjectPanel(panel, navigate, options), [panel, navigate]);
}
