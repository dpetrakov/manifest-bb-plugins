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
let withWork = false;
let withMail = false;
let revoked: string[] = [];

beforeEach(async () => {
  seen = [];
  revoked = [];
  withWork = false;
  withMail = false;
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
          ? { email: "op@example.com", contract: 1, can_view_outreach: true, can_manage_outreach: true, capabilities: [...(withWork ? ["outreach.work"] : []), ...(withMail ? ["outreach.mail"] : [])] }
          : m.params.name === "mail_mailing_create"
            ? { id: String(m.params.arguments.from_company ?? "") === "c1" ? "22222222-2222-2222-2222-222222222222" : "11111111-1111-1111-1111-111111111111", total: 1 }
          : m.params.name === "mail_preview"
            ? { subject: "Hi", text: "x", html: "<p>x</p>", missing: [], unknown: String(m.params.arguments.body).includes("{{bad}}") ? ["bad"] : [], problems: [] }
          : m.params.name === "outreach_list_companies"
            ? { items: [], total: 7, limit: 1, offset: 0 }
            : m.params.name === "outreach_batch_apply"
              ? { id: "b1", state: "applied", items: [{ company_id: "c1" }, { company_id: "c2" }] }
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
    experimental_declaredIconNames: ["dashboard", "id-card"],
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

    // Metadata alone is not enough: the plugin must have linked the thread to the company.
    const unlinked = (await h.behavior.callAgentTool("outreach_update_company", { id: "c1", status: "ready" }, { threadId: "thread-c1" })) as {
      isError: boolean;
    };
    expect(unlinked.isError).toBe(true);
    await h.behavior.callRpc("chat_link", { companyId: "c1", threadId: "thread-c1" });
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

describe("dashboard topics (W-15)", () => {
  const metaStore: Record<string, Record<string, unknown>> = {};
  const loadDash = async () => {
    withWork = true;
    for (const k of Object.keys(metaStore)) delete metaStore[k];
    metaStore["thread-dash"] = { kind: "dashboard", filter: {} };
    metaStore["thread-c1"] = { companyId: "c1" };
    const sections: { id: string; name: string }[] = [];
    const { bb, harness } = createFakePluginHost({
      pluginId: "manifest",
    experimental_declaredIconNames: ["dashboard", "id-card"],
      agentSkillIds: ["manifest-outreach"],
      sdk: {
        threads: {
          get: async ({ threadId }: { threadId: string }) => {
            if (threadId === "gone") throw new Error("not found");
            return { id: threadId, title: "Тема" } as never;
          },
          getPluginMetadata: async ({ threadId }: { threadId: string }) => (metaStore[threadId] ?? {}) as never,
          updatePluginMetadata: async ({ threadId, set }: { threadId: string; set?: Record<string, unknown> }) => {
            metaStore[threadId] = { ...(metaStore[threadId] ?? {}), ...(set ?? {}) };
            return metaStore[threadId] as never;
          },
        },
        threadSections: {
          list: async () => sections as never,
          create: async ({ name }: { name: string }) => {
            const x = { id: `sec-${sections.length + 1}`, name };
            sections.push(x);
            return x as never;
          },
        },
      },
    });
    await plugin(bb);
    await harness.behavior.callRpc("login", { url: base, email: "op@example.com", password: "correct horse battery" });
    return harness;
  };

  it("reports the work capability and configures dashboard topics", async () => {
    const h = await loadDash();
    const s = (await h.behavior.callRpc("status", null)) as { canWork: boolean };
    expect(s.canWork).toBe(true);
    const dash = await h.behavior.resolveAgentConfiguration(
      makePluginAgentConfigurationContext({ pluginMetadata: { kind: "dashboard" } }),
    );
    const names = dash.tools.map((t) => (typeof t === "string" ? t : t.name));
    expect(names).toEqual(expect.arrayContaining(["manifest_dashboard_show", "outreach_batch_preview", "outreach_queue", "outreach_metrics"]));
    expect(names).not.toContain("outreach_update_company");
    expect(names).not.toContain("outreach_log_touch");
    expect(names.some((n) => n.includes("batch_apply") || n.includes("batch_revert"))).toBe(false);
    expect(dash.instructions).toContain("::manifest-batch");
    const company = await h.behavior.resolveAgentConfiguration(
      makePluginAgentConfigurationContext({ pluginMetadata: { companyId: "c1", companyName: "THK" } }),
    );
    const cnames = company.tools.map((t) => (typeof t === "string" ? t : t.name));
    expect(cnames).toEqual(expect.arrayContaining(["outreach_log_touch", "outreach_set_next_action", "outreach_queue"]));
    expect(cnames).not.toContain("outreach_batch_preview");
  });

  it("refuses direct writes in a topic and tools of another kind", async () => {
    const h = await loadDash();
    const write = (await h.behavior.callAgentTool("outreach_update_company", { id: "c1", status: "ready" }, { threadId: "thread-dash" })) as {
      isError: boolean;
    };
    expect(write.isError).toBe(true);
    const touch = (await h.behavior.callAgentTool("outreach_log_touch", { company_id: "c1", channel: "email", direction: "out" }, { threadId: "thread-dash" })) as {
      isError: boolean;
    };
    expect(touch.isError).toBe(true);
    const preview = (await h.behavior.callAgentTool("outreach_batch_preview", { op: { kind: "set_owner", owner: "me" }, filter: { attention: "overdue" } }, { threadId: "thread-c1" })) as {
      isError: boolean;
    };
    expect(preview.isError).toBe(true);
    expect(seen.filter((x) => x.tool !== "manifest_whoami")).toHaveLength(0);
    const ok = await h.behavior.callAgentTool("outreach_batch_preview", { op: { kind: "set_owner", owner: "me" }, filter: { attention: "overdue" } }, { threadId: "thread-dash" });
    expect(String(JSON.stringify(ok))).not.toContain("isError\":true");
    expect(seen.at(-1)).toMatchObject({ tool: "outreach_batch_preview", actor: "agent" });
  });

  it("lets the agent set the topic filter and reports the count", async () => {
    const h = await loadDash();
    const out = await h.behavior.callAgentTool("manifest_dashboard_show", { filter: { country: "IN", attention: "overdue" } }, { threadId: "thread-dash" });
    expect(JSON.stringify(out)).toContain("7 организаций");
    expect(metaStore["thread-dash"].filter).toEqual({ country: "IN", attention: "overdue" });
    expect(h.inspection.realtimeSignals.some((x) => x.channel === "manifest-topic-filter")).toBe(true);
    const refused = (await h.behavior.callAgentTool("manifest_dashboard_show", { filter: {} }, { threadId: "thread-c1" })) as { isError: boolean };
    expect(refused.isError).toBe(true);
    expect(await h.behavior.callRpc("topic_filter_get", { threadId: "thread-dash" })).toEqual({ filter: { country: "IN", attention: "overdue" } });
  });

  it("keeps the topic index and the section", async () => {
    const h = await loadDash();
    expect(await h.behavior.callRpc("section_ensure", null)).toEqual({ sectionId: "sec-1" });
    expect(await h.behavior.callRpc("section_ensure", null)).toEqual({ sectionId: "sec-1" });
    await h.behavior.callRpc("topic_add", { threadId: "thread-dash", title: "Напоминания" });
    await expect(h.behavior.callRpc("topic_add", { threadId: "thread-c1", title: "x" })).rejects.toThrow(/не тема/);
    const list = (await h.behavior.callRpc("topics_list", null)) as { topics: { threadId: string }[] };
    expect(list.topics.map((t) => t.threadId)).toEqual(["thread-dash"]);
  });

  it("signals every company of an applied batch", async () => {
    const h = await loadDash();
    await h.behavior.callRpc("tool", { name: "outreach_batch_apply", args: { id: "b1" } });
    expect(seen.at(-1)).toMatchObject({ tool: "outreach_batch_apply", actor: "panel" });
    const companies = h.inspection.realtimeSignals.filter((x) => x.channel === "manifest-company-changed");
    expect(companies.length).toBe(2);
    expect(h.inspection.realtimeSignals.some((x) => x.channel === "manifest-registry-changed")).toBe(true);
  });
});

describe("mail (W-16)", () => {
  const metaStore: Record<string, Record<string, unknown>> = {};
  const loadMail = async () => {
    withWork = true;
    withMail = true;
    for (const k of Object.keys(metaStore)) delete metaStore[k];
    metaStore["thread-tpl"] = { kind: "template", templateId: "t1", draft: { subject: "Hi", body: "Hello" } };
    metaStore["thread-c1"] = { companyId: "c1" };
    const { bb, harness } = createFakePluginHost({
      pluginId: "manifest",
    experimental_declaredIconNames: ["dashboard", "id-card"],
      agentSkillIds: ["manifest-outreach"],
      sdk: {
        threads: {
          get: async ({ threadId }: { threadId: string }) => ({ id: threadId, title: "Шаблон" }) as never,
          getPluginMetadata: async ({ threadId }: { threadId: string }) => (metaStore[threadId] ?? {}) as never,
          updatePluginMetadata: async ({ threadId, set }: { threadId: string; set?: Record<string, unknown> }) => {
            metaStore[threadId] = { ...(metaStore[threadId] ?? {}), ...(set ?? {}) };
            return metaStore[threadId] as never;
          },
        },
      },
    });
    await plugin(bb);
    await harness.behavior.callRpc("login", { url: base, email: "op@example.com", password: "correct horse battery" });
    return harness;
  };

  it("reports the mail capability and configures template topics", async () => {
    const h = await loadMail();
    const s = (await h.behavior.callRpc("status", null)) as { canMail: boolean };
    expect(s.canMail).toBe(true);
    const tpl = await h.behavior.resolveAgentConfiguration(
      makePluginAgentConfigurationContext({ pluginMetadata: { kind: "template", templateId: "t1" } }),
    );
    const names = tpl.tools.map((t) => (typeof t === "string" ? t : t.name));
    expect(names).toEqual(expect.arrayContaining(["manifest_template_draft", "mail_preview", "mail_fields", "mail_template_get"]));
    expect(names).not.toContain("outreach_update_company");
    expect(names).not.toContain("mail_template_save");
    expect(names.some((n) => n.includes("send"))).toBe(false);
    const company = await h.behavior.resolveAgentConfiguration(
      makePluginAgentConfigurationContext({ pluginMetadata: { companyId: "c1", companyName: "THK" } }),
    );
    const cnames = company.tools.map((t) => (typeof t === "string" ? t : t.name));
    expect(cnames).toEqual(expect.arrayContaining(["mail_company_sender", "mail_company_sender_set", "mail_preview"]));
    expect(cnames).not.toContain("manifest_template_draft");
    expect(company.instructions).toContain("недоверенные");
    // W-17: the letter draft belongs to company chats only; the agent is told to show it by directive.
    expect(cnames).toEqual(expect.arrayContaining(["mail_draft_get", "mail_draft_create", "mail_draft_update", "mail_draft_discard"]));
    expect(names.some((n) => n.startsWith("mail_draft_"))).toBe(false);
    expect(company.instructions).toContain("::manifest-letter");
  });

  it("lets the agent prepare mailings in company chats and dashboard topics, not change companies there", async () => {
    const h = await loadMail();
    metaStore["thread-dash"] = { kind: "dashboard", filter: {} };
    await h.behavior.callRpc("chat_link", { companyId: "c1", threadId: "thread-c1" });
    const dash = await h.behavior.resolveAgentConfiguration(makePluginAgentConfigurationContext({ pluginMetadata: { kind: "dashboard" } }));
    const dnames = dash.tools.map((t) => (typeof t === "string" ? t : t.name));
    expect(dnames).toEqual(expect.arrayContaining(["mail_mailing_create", "mail_mailing_add", "mail_mailing_update", "mail_mailing_get"]));
    expect(dnames).not.toContain("mail_mailing_discard");
    expect(dash.instructions).toContain("::manifest-mailing");
    const tpl = await h.behavior.resolveAgentConfiguration(makePluginAgentConfigurationContext({ pluginMetadata: { kind: "template", templateId: "t1" } }));
    expect(tpl.tools.map((t) => (typeof t === "string" ? t : t.name)).some((n) => n.startsWith("mail_mailing"))).toBe(false);

    // A mailing made in the topic is editable there.
    const DASH = "11111111-1111-1111-1111-111111111111";
    await h.behavior.callAgentTool("mail_mailing_create", { template_id: "t1", filter: { country: "IN" } }, { threadId: "thread-dash" });
    expect(seen.at(-1)).toMatchObject({ tool: "mail_mailing_create", actor: "agent" });
    await h.behavior.callAgentTool("mail_mailing_add", { id: DASH, company_ids: ["c7", "c8"] }, { threadId: "thread-dash" });
    expect(seen.at(-1)).toMatchObject({ tool: "mail_mailing_add", actor: "agent" });
    expect(h.inspection.realtimeSignals.some((x) => x.channel === "manifest-mailing-changed")).toBe(true);
    // Someone else's mailing — refused, nothing sent to Manifest.
    const before = seen.length;
    const foreign = (await h.behavior.callAgentTool("mail_mailing_update", { id: DASH, body: "x" }, { threadId: "thread-c1" })) as { isError: boolean };
    expect(foreign.isError).toBe(true);
    const unknown = (await h.behavior.callAgentTool("mail_mailing_add", { id: "33333333-3333-3333-3333-333333333333", company_ids: ["c9"] }, { threadId: "thread-dash" })) as { isError: boolean };
    expect(unknown.isError).toBe(true);
    expect(seen.length).toBe(before);
    // Made by a person from c1's draft («Разослать и другим»): editable in c1's chat.
    await h.behavior.callRpc("tool", { name: "mail_mailing_create", args: { from_company: "c1" } });
    await h.behavior.callAgentTool("mail_mailing_update", { id: "22222222-2222-2222-2222-222222222222", body: "Hi" }, { threadId: "thread-c1" });
    expect(seen.at(-1)).toMatchObject({ tool: "mail_mailing_update", actor: "agent" });
    // Company writes in a dashboard topic stay refused.
    const write = (await h.behavior.callAgentTool("mail_company_sender_set", { company_id: "c1", sender_id: "s1" }, { threadId: "thread-dash" })) as { isError: boolean };
    expect(write.isError).toBe(true);
  });

  it("binds letter drafts to the organisation of the chat", async () => {
    const h = await loadMail();
    await h.behavior.callRpc("chat_link", { companyId: "c1", threadId: "thread-c1" });
    const other = (await h.behavior.callAgentTool("mail_draft_update", { company_id: "c2", body: "x" }, { threadId: "thread-c1" })) as { isError: boolean };
    expect(other.isError).toBe(true);
    const tpl = (await h.behavior.callAgentTool("mail_draft_create", { company_id: "c1", template_id: "t1" }, { threadId: "thread-tpl" })) as { isError: boolean };
    expect(tpl.isError).toBe(true);
    await h.behavior.callAgentTool("mail_draft_update", { company_id: "c1", body: "Dear {{person.name}}" }, { threadId: "thread-c1" });
    expect(seen.at(-1)).toMatchObject({ tool: "mail_draft_update", actor: "agent" });
    expect(h.inspection.realtimeSignals.some((x) => x.channel === "manifest-company-changed")).toBe(true);
  });

  it("lets the agent edit the draft only in a template topic", async () => {
    const h = await loadMail();
    const out = await h.behavior.callAgentTool("manifest_template_draft", { subject: "Hello {{company.name}}", body: "Dear {{bad}}" }, { threadId: "thread-tpl" });
    expect(JSON.stringify(out)).toContain("неизвестная подстановка bad");
    expect((metaStore["thread-tpl"].draft as { subject: string }).subject).toBe("Hello {{company.name}}");
    expect(seen.at(-1)).toMatchObject({ tool: "mail_preview", actor: "agent" });
    expect(await h.behavior.callRpc("draft_get", { threadId: "thread-tpl" })).toMatchObject({ draft: { subject: "Hello {{company.name}}" } });
    const refused = (await h.behavior.callAgentTool("manifest_template_draft", { body: "x" }, { threadId: "thread-c1" })) as { isError: boolean };
    expect(refused.isError).toBe(true);
  });

  it("refuses company mail writes from another company's chat", async () => {
    const h = await loadMail();
    await h.behavior.callRpc("chat_link", { companyId: "c1", threadId: "thread-c1" });
    const other = (await h.behavior.callAgentTool("mail_company_sender_set", { company_id: "c2", sender_id: "s1" }, { threadId: "thread-c1" })) as {
      isError: boolean;
    };
    expect(other.isError).toBe(true);
    await h.behavior.callAgentTool("mail_company_sender_set", { company_id: "c1", sender_id: "s1" }, { threadId: "thread-c1" });
    expect(seen.at(-1)).toMatchObject({ tool: "mail_company_sender_set", actor: "agent" });
  });
});
