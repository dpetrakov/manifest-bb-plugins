// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer";
import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { InboundAttachmentList } from "../ui/mail/attachments";
import { CompanyMail } from "../ui/mail/CompanyMail";
import { CompanyInboundFiles } from "../ui/mail/CompanyInboundFiles";
import { InboundView } from "../ui/workspace/InboundView";

const bytes = Buffer.alloc(80_000, 0xff);
const file = { filename: "Quotation.pdf", content_type: "application/pdf", size: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"), content_base64: bytes.toString("base64") };
const attachment = { id: "att-1", filename: file.filename, size: file.size };
const inbound = { id: "in-1", attachments: [attachment], received_at: "2026-11-09T10:00:00Z", subject: "STIHL quotation", from_address: "quotes@supplier.example", from_name: "Supplier", company_id: "c1", company_name: "Supplier", body_text: "Our quotation", reply_text: "Our quotation", triage: "linked", kind: "reply" };
const status = () => ({ connected: true, canView: true, canManage: false, canMail: true });
let blobs: NodeBlob[];

beforeEach(() => {
  blobs = [];
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL(blob: NodeBlob) { blobs.push(blob); return "blob:quotation"; }
    static revokeObjectURL() { /* browser cleanup */ }
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("shows incoming files in the company card and downloads complete bytes for a viewer", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  renderSlot({ component: () => <CompanyMail companyId="c1" /> }, {}, { rpc: {
    status,
    tool: ({ name, args }: { name: string; args: Record<string, unknown> }) => {
      calls.push({ name, args });
      if (name === "mail_company_sender") return { result: { source: "none", sender: null, legal_entity: null } };
      if (name === "mail_inbound_list") return { result: { items: [inbound], total: 1 } };
      if (name === "mail_inbound_file") return { result: file };
      if (name === "mail_draft_get") throw new Error("у организации нет черновика письма");
      return { result: { items: [] } };
    },
  } as never });
  const section = await screen.findByRole("region", { name: "Вложения из входящих" });
  expect(await within(section).findByText(file.filename)).toBeTruthy();
  expect(within(section).getByText(/quotes@supplier.example/)).toBeTruthy();
  fireEvent.click(within(section).getByRole("button", { name: `Скачать ${file.filename}` }));
  await waitFor(() => expect(blobs).toHaveLength(1));
  expect(Buffer.compare(Buffer.from(await blobs[0].arrayBuffer()), bytes)).toBe(0);
  expect(calls).toContainEqual({ name: "mail_inbound_list", args: { company_id: "c1", limit: 50, offset: 0 } });
  expect(calls).toContainEqual({ name: "mail_inbound_file", args: { id: "in-1", attachment_id: "att-1" } });
});

it("also exposes file downloads on an individual incoming message", async () => {
  renderSlot({ component: () => <InboundView id="in-1" /> }, {}, { rpc: { status,
    tool: ({ name }: { name: string }) => ({ result: name === "mail_inbound_get" ? inbound : file }),
  } as never });
  fireEvent.click(await screen.findByRole("button", { name: `Скачать ${file.filename}` }));
  await waitFor(() => expect(blobs).toHaveLength(1));
});

it("shows loading, preserves the file list on error, and allows retry", async () => {
  let reject: (e: Error) => void = () => undefined;
  let attempts = 0;
  renderSlot({ component: () => <InboundAttachmentList inboundId="in-1" attachments={[attachment]} /> }, {}, { rpc: {
    tool: () => {
      attempts++;
      return attempts === 1 ? new Promise((_, fail) => { reject = fail; }) : { result: file };
    },
  } as never });
  const button = screen.getByRole("button", { name: `Скачать ${file.filename}` }) as HTMLButtonElement;
  fireEvent.click(button);
  await waitFor(() => expect(button.disabled).toBe(true));
  expect(screen.getByText("Скачиваем…")).toBeTruthy();
  reject(new Error("Вложение недоступно: срок хранения истёк"));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("срок хранения"));
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  await waitFor(() => expect(blobs).toHaveLength(1));
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each(["size", "hash"])("refuses a broken %s before offering a browser download", async (kind) => {
  renderSlot({ component: () => <InboundAttachmentList inboundId="in-1" attachments={[attachment]} /> }, {}, { rpc: {
    tool: () => ({ result: { ...file, ...(kind === "size" ? { content_base64: file.content_base64.slice(0, 60_000) } : { sha256: "0".repeat(64) }) } }),
  } as never });
  fireEvent.click(screen.getByRole("button", { name: `Скачать ${file.filename}` }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(blobs).toHaveLength(0);
});

it("paginates through messages even when the first page has no attachments", async () => {
  const offsets: number[] = [];
  renderSlot({ component: () => <CompanyInboundFiles companyId="c1" /> }, {}, { rpc: {
    tool: ({ args }: { args: { offset: number } }) => {
      offsets.push(args.offset);
      return { result: { items: args.offset === 0 ? Array.from({ length: 50 }, (_, i) => ({ ...inbound, id: `empty-${i}`, attachments: [] })) : [inbound], total: 51 } };
    },
  } as never });
  expect(await screen.findByText("В просмотренных письмах вложений нет.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Показать ещё письма" }));
  expect(await screen.findByText(file.filename)).toBeTruthy();
  expect(offsets).toEqual([0, 50]);
  expect(screen.queryByRole("button", { name: "Показать ещё письма" })).toBeNull();
});

it("recovers from a failed company file list without losing the company filter", async () => {
  let attempts = 0;
  renderSlot({ component: () => <CompanyInboundFiles companyId="c1" /> }, {}, { rpc: {
    tool: ({ args }: { args: { company_id: string } }) => {
      expect(args.company_id).toBe("c1");
      if (++attempts === 1) throw new Error("Шлюз временно недоступен");
      return { result: { items: [inbound], total: 1 } };
    },
  } as never });
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
  expect(await screen.findByText(file.filename)).toBeTruthy();
});
