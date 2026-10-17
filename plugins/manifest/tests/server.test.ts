// Backend of the plugin on the SDK fake host, against a fake Manifest
// (login + MCP) served from a local HTTP server.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFakePluginHost, makePluginAgentConfigurationContext } from "@get-bb/plugin-sdk/testing";
import plugin from "../server";

interface Seen {
  auth?: string;
  actor?: string;
  tool?: string;
  args?: Record<string, unknown>;
}

let srv: Server;
let base = "";
let seen: Seen[] = [];
let revoked: string[] = [];

beforeEach(async () => {
  seen = [];
  revoked = [];
  srv = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const json = (status: number, obj: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (req.url === "/api/plugin/auth/login") {
      const b = JSON.parse(body);
      if (b.password !== "correct horse battery") return json(401, { detail: "неверный email или пароль" });
      return json(200, { token: "mfp_ok", email: b.email.toLowerCase(), expires_at: "2027-01-01T00:00:00Z" });
    }
    if (req.url === "/api/plugin/auth/logout") {
      revoked.push(String(req.headers.authorization));
      res.writeHead(204).end();
      return;
    }
    if (req.url === "/api/mcp") {
      if (req.headers.authorization !== "Bearer mfp_ok") return json(401, {});
      const m = JSON.parse(body);
      seen.push({ auth: req.headers.authorization, actor: String(req.headers["x-manifest-actor-kind"]), tool: m.params.name, args: m.params.arguments });
      const result =
        m.params.name === "manifest_whoami"
          ? { email: "op@example.com", contract: 1, can_view_outreach: true, can_manage_outreach: true }
          : m.params.name === "outreach_delete_contact"
            ? null
            : { company: { id: "c1", display_name: "THK" }, ok: true };
      if (result === null) return json(200, { jsonrpc: "2.0", id: m.id, result: { isError: true, content: [{ type: "text", text: "не найдено" }] } });
      return json(200, { jsonrpc: "2.0", id: m.id, result: { structuredContent: result, content: [{ type: "text", text: JSON.stringify(result) }] } });
    }
    json(404, {});
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((r) => srv.close(() => r())));

async function load(settings: Record<string, string> = {}) {
  const { bb, harness } = createFakePluginHost({
    pluginId: "manifest",
    settings,
    agentSkillIds: ["manifest-outreach"],
    sdk: {
      threads: {
        get: async ({ threadId }: { threadId: string }) => ({ id: threadId }) as never,
        getPluginMetadata: async ({ threadId }: { threadId: string }) => (threadId === "thread-c1" ? { companyId: "c1" } : {}) as never,
      },
    },
  });
  await plugin(bb);
  return harness;
}

describe("sign-in", () => {
  it("is not connected without a token", async () => {
    const h = await load();
    const s = (await h.behavior.callRpc("status", null)) as { connected: boolean; problem: string };
    expect(s.connected).toBe(false);
    expect(s.problem).toBe("unauthorized");
  });

  it("exchanges the password for a token and keeps only the token", async () => {
    const h = await load();
    const s = (await h.behavior.callRpc("login", { url: `${base}/`, email: "OP@example.com", password: "correct horse battery" })) as {
      connected: boolean;
      email: string;
      canManage: boolean;
    };
    expect(s).toMatchObject({ connected: true, email: "op@example.com", canManage: true });
    const stored = JSON.stringify(h.inspection.settings ?? {});
    expect(stored).not.toContain("correct horse battery");
    expect(seen[0]).toMatchObject({ tool: "manifest_whoami", actor: "panel" });
  });

  it("reports a wrong password and signs out with revocation", async () => {
    const h = await load();
    await expect(h.behavior.callRpc("login", { url: base, email: "op@example.com", password: "nope" })).rejects.toThrow(/неверный/);
    await h.behavior.callRpc("login", { url: base, email: "op@example.com", password: "correct horse battery" });
    const s = (await h.behavior.callRpc("logout", null)) as { connected: boolean };
    expect(s.connected).toBe(false);
    expect(revoked).toEqual(["Bearer mfp_ok"]);
  });
});

describe("panels and agent", () => {
  // Sign in once so the token is bound to the fake Manifest address.
  const connected = async () => {
    const h = await load();
    await h.behavior.callRpc("login", { url: base, email: "op@example.com", password: "correct horse battery" });
    return h;
  };

  it("proxies allowed tools as the panel and signals card changes", async () => {
    const h = await connected();
    await h.behavior.callRpc("tool", { name: "outreach_add_comment", args: { company_id: "c1", body: "x" } });
    expect(seen.at(-1)).toMatchObject({ tool: "outreach_add_comment", actor: "panel" });
    expect(h.inspection.realtimeSignals.some((s) => s.channel === "manifest-company-changed")).toBe(true);
    await expect(h.behavior.callRpc("tool", { name: "drop_database", args: {} })).rejects.toThrow(/недоступен/);
  });

  it("gives Manifest tools only to organisation chats, labelled as agent", async () => {
    const h = await connected();
    const plain = await h.behavior.resolveAgentConfiguration(makePluginAgentConfigurationContext());
    expect(plain.tools).toHaveLength(0);
    const chat = await h.behavior.resolveAgentConfiguration(
      makePluginAgentConfigurationContext({ pluginMetadata: { companyId: "c1", companyName: 'THK "Powertools"' } }),
    );
    expect(chat.tools.length).toBe(8);
    expect(chat.skills).toEqual(["manifest-outreach"]);
    expect(chat.instructions).toContain('"c1"');
    expect(chat.instructions).toContain('\\"Powertools\\"');

    const out = await h.behavior.callAgentTool("outreach_update_company", { id: "c1", status: "ready" }, { threadId: "thread-c1" });
    expect(String(out)).toContain("THK");
    expect(seen.at(-1)).toMatchObject({ tool: "outreach_update_company", actor: "agent" });

    const foreign = (await h.behavior.callAgentTool("outreach_add_comment", { company_id: "c2", body: "x" }, { threadId: "thread-c1" })) as {
      isError: boolean;
      content: { text: string }[];
    };
    expect(foreign.isError).toBe(true);
    expect(foreign.content[0].text).toContain("только организацию");
    const read = await h.behavior.callAgentTool("outreach_get_company", { id: "c2" }, { threadId: "thread-c1" });
    expect(String(read)).toContain("THK");

    const err = (await h.behavior.callAgentTool("outreach_delete_contact", { company_id: "c1", contact_id: "x" }, { threadId: "thread-c1" })) as {
      isError: boolean;
      content: { text: string }[];
    };
    expect(err.isError).toBe(true);
    expect(err.content[0].text).toContain("не найдено");
  });

  it("does not send the token to a changed address", async () => {
    const h = await connected();
    await h.behavior.setSettings({ manifestUrl: "https://other.example" });
    const s = (await h.behavior.callRpc("status", null)) as { connected: boolean; problem: string };
    expect(s.connected).toBe(false);
    expect(s.problem).toBe("unauthorized");
    expect(seen.filter((x) => x.tool === "manifest_whoami")).toHaveLength(1);
  });

  it("remembers the chat of an organisation", async () => {
    const h = await connected();
    expect(await h.behavior.callRpc("chat_get", { companyId: "c1" })).toEqual({ threadId: null });
    await h.behavior.callRpc("chat_link", { companyId: "c1", threadId: "th_1" });
    expect(await h.behavior.callRpc("chat_get", { companyId: "c1" })).toEqual({ threadId: "th_1" });
  });
});
