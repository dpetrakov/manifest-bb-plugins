// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { useStatus } from "../ui/hooks";
import { NeedSheet } from "../ui/procurement/NeedSheet";

const connected = {
  connected: true, url: "https://manifest.example", email: "op@example.com",
  canView: true, canManage: true, canProcurement: true, canProcurementManage: false,
  canAssortment: false, problem: null, message: "",
};
const offline = { ...connected, connected: false, canProcurement: false,
  problem: "unavailable", message: "Manifest недоступен: ECONNRESET" };

function Probe() {
  const { status, error, reload } = useStatus();
  return <div><span>{error || (status?.connected ? "online" : status?.message || "loading")}</span><button onClick={reload}>check</button></div>;
}

afterEach(() => { vi.useRealTimers(); });

describe("connection recovery", () => {
  it("rechecks unavailable status on focus and stops after recovery", async () => {
    vi.useFakeTimers();
    let online = false;
    const status = vi.fn(() => online ? connected : offline);
    const r = renderSlot({ component: Probe }, {}, { rpc: { status } as never });
    await act(async () => {});
    expect(screen.getByText(offline.message)).toBeTruthy();
    online = true;
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(screen.getByText("online")).toBeTruthy();
    const count = status.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(status.mock.calls.length).toBe(count);
    r.lifecycle.unmount();
  });

  it("recovers a rejected status RPC on the timer without calling tools", async () => {
    vi.useFakeTimers();
    let online = false;
    const status = vi.fn(async () => { if (!online) throw new Error("RPC timeout"); return connected; });
    const tool = vi.fn();
    const r = renderSlot({ component: Probe }, {}, { rpc: { status, tool } as never });
    await act(async () => {});
    expect(screen.getByText("RPC timeout")).toBeTruthy();
    online = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(screen.getByText("online")).toBeTruthy();
    expect(tool).not.toHaveBeenCalled();
    r.lifecycle.unmount();
    const count = status.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(status.mock.calls.length).toBe(count);
  });

  it("does not repeatedly retry invalid credentials", async () => {
    vi.useFakeTimers();
    const status = vi.fn(() => ({ ...offline, problem: "unauthorized", message: "Войдите снова" }));
    const r = renderSlot({ component: Probe }, {}, { rpc: { status } as never });
    await act(async () => {});
    const count = status.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(status.mock.calls.length).toBe(count);
    r.lifecycle.unmount();
  });

  it("opens the sheet after manual reconnection without remounting the panel", async () => {
    let online = false;
    const reads: string[] = [];
    const r = renderSlot({ component: NeedSheet }, {}, { rpc: {
      status: () => online ? connected : offline,
      tool: ({ name }: { name: string }) => {
        reads.push(name);
        return { result: { items: [], sources: [] } };
      },
    } as never });
    const retry = await screen.findByRole("button", { name: "Повторить подключение" });
    online = true;
    fireEvent.click(retry);
    expect(await screen.findByText("0 поз. · 0 шт")).toBeTruthy();
    expect(reads).toContain("procurement_needs");
    expect(reads.every((name) => ["procurement_needs", "assortment_coverage", "assortment_queue"].includes(name))).toBe(true);
    r.lifecycle.unmount();
  });
});
