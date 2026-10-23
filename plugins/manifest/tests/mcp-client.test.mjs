import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { CONTRACT_VERSION, ManifestError, callTool, login, normalizeBaseUrl } from "../lib/mcp-client.ts";
import { AGENT_TOOLS, PANEL_TOOLS, agentText, companyOf, quote } from "../lib/tools.ts";

function serve(handler) {
  return new Promise((resolve) => {
    const srv = createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      handler(req, body ? JSON.parse(body) : null, res);
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}
const url = (srv) => `http://127.0.0.1:${srv.address().port}`;
const json = (res, status, obj) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
};

test("normalizeBaseUrl", () => {
  assert.equal(normalizeBaseUrl(" manifest.example.com/ "), "https://manifest.example.com");
  assert.equal(normalizeBaseUrl("http://localhost:8090///"), "http://localhost:8090");
  assert.equal(normalizeBaseUrl(""), "");
  assert.equal(normalizeBaseUrl("http://127.0.0.1:18090"), "http://127.0.0.1:18090");
  assert.throws(() => normalizeBaseUrl("http://manifest.example.com"), /https/);
});

test("callTool sends bearer, actor kind and parses structured content", async () => {
  let seen;
  const srv = await serve((req, body, res) => {
    seen = { auth: req.headers.authorization, actor: req.headers["x-manifest-actor-kind"], path: req.url, body };
    json(res, 200, { jsonrpc: "2.0", id: body.id, result: { structuredContent: { ok: 1 }, content: [{ type: "text", text: "{\"ok\":1}" }] } });
  });
  try {
    const r = await callTool(url(srv), "mfp_x", "outreach_get_company", { id: "c1" }, "agent");
    assert.deepEqual(r.structured, { ok: 1 });
    assert.equal(seen.auth, "Bearer mfp_x");
    assert.equal(seen.actor, "agent");
    assert.equal(seen.path, "/api/mcp");
    assert.equal(seen.body.method, "tools/call");
    assert.deepEqual(seen.body.params, { name: "outreach_get_company", arguments: { id: "c1" } });
  } finally {
    srv.close();
  }
});

test("callTool maps 401, tool errors and network failures", async () => {
  const srv = await serve((req, body, res) => {
    if (body.params.name === "deny") return json(res, 401, {});
    json(res, 200, { jsonrpc: "2.0", id: body.id, result: { isError: true, content: [{ type: "text", text: "не найдено" }] } });
  });
  try {
    await assert.rejects(callTool(url(srv), "t", "deny", {}, "panel"), (e) => e instanceof ManifestError && e.code === "unauthorized");
    await assert.rejects(callTool(url(srv), "t", "x", {}, "panel"), (e) => e.code === "tool" && e.message === "не найдено");
  } finally {
    srv.close();
  }
  await assert.rejects(callTool("http://127.0.0.1:1", "t", "x", {}, "panel"), (e) => e.code === "unavailable");
  await assert.rejects(callTool("", "", "x", {}, "panel"), (e) => e.code === "unauthorized");
});

test("login returns the token or the server detail", async () => {
  const srv = await serve((req, body, res) => {
    if (body.password === "good password!") {
      return json(res, 200, { token: "mfp_t", email: body.email.toLowerCase(), expires_at: "2027-01-01T00:00:00Z" });
    }
    json(res, 401, { detail: "неверный email или пароль" });
  });
  try {
    const ok = await login(url(srv), "A@B.C", "good password!", "dev");
    assert.equal(ok.token, "mfp_t");
    assert.equal(ok.email, "a@b.c");
    await assert.rejects(login(url(srv), "a@b.c", "bad", "dev"), (e) => e.code === "unauthorized" && /неверный/.test(e.message));
  } finally {
    srv.close();
  }
});

test("tools helpers", () => {
  assert.equal(CONTRACT_VERSION, 1);
  assert.equal(companyOf({ company_id: "c1" }), "c1");
  assert.equal(companyOf({ id: "c2" }), "c2");
  assert.equal(companyOf({}), null);
  assert.equal(quote('a"b\nc'), '"a\\"b c"');
  assert.match(agentText("x".repeat(100), "", 10), /обрезано/);
  // Every agent tool is a Manifest tool the panels may call — except the plugin's own
  // (local), which run Manifest tools of their own (the file from a thread → mail_file_upload).
  for (const name of Object.keys(AGENT_TOOLS)) assert.ok(AGENT_TOOLS[name].local || PANEL_TOOLS.has(name), name);
  assert.ok(AGENT_TOOLS.mail_file_from_thread.local && PANEL_TOOLS.has("mail_file_upload"));
  assert.ok(AGENT_TOOLS.outreach_update_company.write && !AGENT_TOOLS.outreach_get_company.write);
});

// Live contract check against a running Manifest core (optional):
// MANIFEST_URL, MANIFEST_EMAIL, MANIFEST_PASSWORD.
const live = process.env;
test("live: contract v1 against MANIFEST_URL", { skip: !live.MANIFEST_URL }, async () => {
  const base = live.MANIFEST_URL;
  const { token } = await login(base, live.MANIFEST_EMAIL, live.MANIFEST_PASSWORD, "plugin test");
  const who = await callTool(base, token, "manifest_whoami", {}, "panel");
  assert.equal(who.structured.contract, CONTRACT_VERSION);
  const list = await callTool(base, token, "outreach_list_companies", { country: "DE", limit: 5 }, "panel");
  assert.ok(list.structured.total >= 1);
  for (const name of Object.keys(AGENT_TOOLS)) {
    // Every agent tool exists on the server under the same name: an unknown
    // tool is a protocol error, a missing argument is only a tool error.
    const r = await callTool(base, token, name, {}, "panel").catch((e) => e);
    assert.ok(!(r instanceof ManifestError && r.code === "protocol"), `${name}: ${r.message}`);
  }
});

test("names why Manifest is not reached", async () => {
  const { netReason } = await import("../lib/mcp-client.ts");
  const timeout = Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
  assert.match(netReason(timeout), /за 10 с.*UND_ERR_CONNECT_TIMEOUT/);
  const dns = Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND m.example" } });
  assert.match(netReason(dns), /DNS/);
  assert.equal(netReason(new Error("boom")), "boom");
});
