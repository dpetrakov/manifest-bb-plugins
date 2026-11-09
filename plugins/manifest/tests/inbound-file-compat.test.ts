// File bytes bypass bounded model output and are written to the requesting thread host.
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "../server";

async function setup(file: Record<string, unknown>, toolName = "mail_inbound_file", saveMode = "ok") {
  let published = false;
  const writes: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    const send = (value: unknown) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
    if (req.url === "/api/plugin/auth/login") return send({ token: "mfp_ok", email: "op@example.com" });
    const result = input.method === "tools/list"
      ? { tools: ["manifest_whoami", ...(published ? [toolName] : [])].map(name => ({ name, description: "Download attachment", inputSchema: { type: "object", additionalProperties: true } })) }
      : { structuredContent: input.params.name === "manifest_whoami" ? { contract: 1, can_view_outreach: true, capabilities: ["outreach.mail"] } : file };
    send({ jsonrpc: "2.0", id: input.id, result });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const { bb, harness } = createFakePluginHost({ pluginId: "manifest", experimental_declaredIconNames: ["dashboard", "id-card"], agentSkillIds: ["manifest-outreach"], sdk: {
    threads: { getPluginMetadata: async () => ({}) as never,
      storageLocation: async ({ threadId }: { threadId: string }) => ({ hostId: "remote-agent-host", storageRootPath: `/thread-storage/${threadId}` }) as never },
    files: { write: async (args: Record<string, unknown>) => {
      writes.push(args);
      if (saveMode === "offline") throw new Error("Машина агента недоступна");
      if (saveMode === "conflict") return { outcome: "conflict", currentSha256: null } as never;
      const bytes = Buffer.from(String(args.content), "base64");
      return { outcome: "written", sha256: saveMode === "corrupt" ? "0".repeat(64) : createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length } as never;
    } },
  } });
  await plugin(bb);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await harness.behavior.callRpc("login", { url, email: "op@example.com", password: "test" });
  published = true;
  await harness.behavior.callRpc("status", null);
  return { harness, writes, close: async () => { await harness.lifecycle.dispose(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}

const payload = (bytes: Buffer, over = {}) => ({ filename: "Quote.pdf", content_type: "application/pdf", size: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"), content_base64: bytes.toString("base64"), untrusted: true, ...over });

it.each([80_000, 1024 * 1024, 20 * 1024 * 1024])("saves all %i bytes on the thread's remote host without base64 in model output", async (size) => {
  const bytes = Buffer.alloc(size, 0xff);
  bytes.set(Buffer.from("%PDF-1.7\n"));
  const h = await setup(payload(bytes, { filename: "../../other\\Quote.pdf" }));
  try {
    const result = await h.harness.behavior.callAgentTool("mail_inbound_file", { id: "local-message", attachment_id: "att-quote" }, { threadId: "any-project-thread" });
    const output = JSON.parse(result as string);
    expect(output).toMatchObject({ filename: "Quote.pdf", size, sha256: payload(bytes).sha256, untrusted: true });
    expect(output.path).toMatch(/^\/thread-storage\/any-project-thread\/Attachments\/Manifest\/[a-f0-9-]+\/Quote.pdf$/);
    expect(JSON.stringify(output).length).toBeLessThan(1000);
    expect(output.content_base64).toBeUndefined();
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]).toMatchObject({ hostId: "remote-agent-host", rootPath: "/thread-storage/any-project-thread", contentEncoding: "base64", expectedSha256: null, createParents: true, mode: 0o600 });
    expect(Buffer.compare(Buffer.from(String(h.writes[0].content), "base64"), bytes)).toBe(0);
  } finally { await h.close(); }
});

it.each(["truncated", "wrong-hash", "wrong-size"])("refuses %s payloads before creating a file", async (kind) => {
  const file = payload(Buffer.alloc(90_000, 0xff));
  if (kind === "truncated") file.content_base64 = file.content_base64.slice(0, 60_000);
  if (kind === "wrong-hash") file.sha256 = "0".repeat(64);
  if (kind === "wrong-size") file.size++;
  const h = await setup(file);
  try {
    const result = await h.harness.behavior.callAgentTool("mail_inbound_file", { id: "i1", attachment_id: "a1" }, { threadId: "t1" });
    expect(result).toMatchObject({ isError: true });
    expect(h.writes).toHaveLength(0);
  } finally { await h.close(); }
});

it.each(["offline", "conflict", "corrupt"])("reports %s host writes as errors", async (mode) => {
  const h = await setup(payload(Buffer.alloc(90_000)), "mail_inbound_file", mode);
  try {
    const result = await h.harness.behavior.callAgentTool("mail_inbound_file", { id: "i1", attachment_id: "a1" }, { threadId: "t1" });
    expect(result).toMatchObject({ isError: true });
  } finally { await h.close(); }
});

it("also saves outgoing attachments without sending binary content to the model", async () => {
  const h = await setup({ filename: "RFQ.xlsx", content_type: "application/octet-stream", content_base64: Buffer.alloc(90_000).toString("base64"), rows: 125 }, "mail_file");
  try {
    const result = await h.harness.behavior.callAgentTool("mail_file", { message_id: "m1", position: 0 }, { threadId: "t1" });
    expect(JSON.parse(result as string)).toMatchObject({ filename: "RFQ.xlsx", size: 90_000 });
    expect(h.writes).toHaveLength(1);
  } finally { await h.close(); }
});
