import { describe, expect, it, vi } from "vitest";
import { openObjectPanel, registerDashboard, registerFocusHeader, registerThreadPanel } from "../ui/bb-compat";
import { attentionBadge } from "../ui/dashboard/Accessory";

const component = () => null;
const registration = { id: "object", title: "Manifest", component, layout: "flush" };

describe("BB 0.46 and 0.48 public runtime boundary", () => {
  it("keeps the 0.46 accessory without sending an unknown modern key", () => {
    const navPanel = vi.fn();
    const app = { slots: { navPanel } };
    registerDashboard(app, { id: "dashboard", title: "Dashboard" }, component, () => null);
    expect(navPanel).toHaveBeenCalledWith({ id: "dashboard", title: "Dashboard", experimental_sidebarAccessory: component });
    expect(navPanel.mock.calls[0][0]).not.toHaveProperty("experimental_useBadge");
  });
  it("registers a host badge on 0.48 without the ignored legacy accessory", () => {
    const navPanel = vi.fn();
    const useBadge = () => attentionBadge(4);
    registerDashboard({ slots: { navPanel, experimental_tab: vi.fn() } }, { id: "dashboard", title: "Dashboard" }, component, useBadge);
    expect(navPanel.mock.calls[0][0]).toEqual({ id: "dashboard", title: "Dashboard", experimental_useBadge: useBadge });
    expect(useBadge()).toEqual({ count: 4, tone: "critical", label: "Ждут нашего ответа и просрочено: 4" });
    expect(attentionBadge(0)).toBeNull();
    expect(attentionBadge(null)).toBeNull();
  });
  it("preserves legacy panel identity on 0.46", () => {
    const threadPanelAction = vi.fn();
    registerThreadPanel({ slots: { threadPanelAction } }, registration);
    expect(threadPanelAction).toHaveBeenCalledWith(registration);
  });
  it("uses the same identity and component as a new action tab on 0.48", () => {
    const experimental_tab = vi.fn();
    const threadPanelAction = vi.fn();
    registerThreadPanel({ slots: { experimental_tab, threadPanelAction } }, registration);
    expect(experimental_tab).toHaveBeenCalledWith({ ...registration, icon: "Globe", context: { kind: "thread" }, availability: "action" });
    expect(threadPanelAction).not.toHaveBeenCalled();
  });
  it("retains the supported custom focus header adapter", () => {
    const experimental_threadHeaderAction = vi.fn();
    registerFocusHeader({ slots: { experimental_threadHeaderAction } }, registration);
    expect(experimental_threadHeaderAction).toHaveBeenCalledWith(registration);
  });
  it("fails clearly instead of silently losing panels on an unsupported host", () => {
    expect(() => registerThreadPanel({ slots: {} }, registration)).toThrow("thread panels");
    expect(() => registerFocusHeader({ slots: {} }, registration)).toThrow("focus header");
  });
  it.each(["object", "object-beside", "company-new", "company-beside"])("opens %s on the caller's modern thread/new-thread surface", (actionId) => {
    const openTab = vi.fn(() => true);
    const openThreadPanel = vi.fn(() => true);
    const params = { v: 1, pin: { kind: "company", id: "fixture", title: "Fixture" } };
    expect(openObjectPanel({ openTab }, { openThreadPanel }, { actionId, title: "Fixture", params })).toBe(true);
    expect(openTab).toHaveBeenCalledWith({ tab: { id: actionId, context: { kind: "thread" }, availability: "action" }, title: "Fixture", params });
    expect(openThreadPanel).not.toHaveBeenCalled();
  });
  it("does not redirect a rejected modern open into another legacy pane", () => {
    const openThreadPanel = vi.fn(() => true);
    expect(openObjectPanel({ openTab: () => false }, { openThreadPanel }, { actionId: "object" })).toBe(false);
    expect(openThreadPanel).not.toHaveBeenCalled();
  });
  it("preserves the legacy surface navigation and decline result", () => {
    const openThreadPanel = vi.fn(() => false);
    const options = { actionId: "object", params: { v: 1 } };
    expect(openObjectPanel({}, { openThreadPanel }, options)).toBe(false);
    expect(openThreadPanel).toHaveBeenCalledWith(options);
    expect(openObjectPanel({}, {}, options)).toBe(false);
  });
});
