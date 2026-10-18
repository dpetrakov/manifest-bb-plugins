import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { attachHost, listViews, openRegistry, REGISTRY_KEY, registerView, revision, subscribe, viewSlot } from "../sidebar-tabs-contract.ts";
import { tabIcon } from "../tabs-model.ts";

const view = (id, extra = {}) => ({ contract: 1, id, pluginId: id.split("/")[0], title: id, ...extra });
const element = (name) => ({ name });
const props = (extra = {}) => ({ activeThreadId: null, activeProjectId: null, isCompactViewport: false, isActive: true, onNavigate() {}, ...extra });

test("each window gets one registry; another contract major is left alone", () => {
  const scope = {};
  const first = openRegistry(scope);
  assert.equal(first.ok, true);
  assert.equal(openRegistry(scope).registry, first.registry);
  const foreign = { [REGISTRY_KEY]: { contract: 2 } };
  assert.deepEqual(openRegistry(foreign), { ok: false, reason: "incompatible", found: 2 });
  const refused = registerView(view("sessions/sessions"), foreign);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, "incompatible");
  assert.equal(foreign[REGISTRY_KEY].contract, 2, "an incompatible registry is not overwritten");
  assert.equal("publish" in attachHost(foreign), false);
  assert.deepEqual(listViews(foreign), []);
});

test("a reload's newer registration survives the older disposer", () => {
  const scope = {};
  const old = registerView(view("sessions/sessions"), scope);
  const fresh = registerView(view("sessions/sessions"), scope);
  assert.ok(old.ok && fresh.ok && fresh.generation > old.generation);
  old.dispose();
  assert.deepEqual(listViews(scope).map((entry) => entry.generation), [fresh.generation]);
  old.setBadge(5);
  assert.equal(listViews(scope)[0].badge, null, "a stale handle cannot change the live view");
  fresh.dispose();
  assert.deepEqual(listViews(scope), []);
  fresh.dispose();
});

test("ids live in the registering plugin's namespace; bad registrations are refused", () => {
  const scope = {};
  assert.equal(registerView(view("sessions/sessions"), scope).ok, true);
  const foreign = registerView({ contract: 1, id: "sessions/sessions", pluginId: "probe", title: "x" }, scope);
  assert.equal(foreign.ok, false);
  assert.equal(foreign.reason, "invalid", "another plugin cannot take an id outside its namespace");
  assert.equal(registerView({ contract: 2, id: "b/view", pluginId: "b", title: "B" }, scope).reason, "version");
  assert.equal(registerView({ contract: 1, id: "Bad Id", pluginId: "b", title: "B" }, scope).reason, "invalid");
  assert.equal(registerView({ contract: 1, id: "b/view", pluginId: "b", title: "  " }, scope).reason, "invalid");
  assert.deepEqual(listViews(scope).map((entry) => entry.registration.id), ["sessions/sessions"]);
});

test("a duplicate id from a different plugin keeps the first owner", () => {
  const scope = {};
  const first = registerView(view("shared/view"), scope);
  openRegistry(scope).registry.views.get("shared/view").registration.pluginId = "first";
  const second = registerView(view("shared/view"), scope);
  assert.equal(second.ok, false);
  assert.equal(second.reason, "duplicate");
  assert.equal(first.ok, true);
});

test("views come in tab order; badges are positive integers or nothing", () => {
  const scope = {};
  registerView(view("zeta/z", { title: "Z", order: 10 }), scope);
  const docs = registerView(view("docs/docs", { title: "Документы" }), scope);
  registerView(view("sessions/sessions", { title: "Сессии", order: 0 }), scope);
  assert.deepEqual(listViews(scope).map((entry) => entry.registration.id), ["sessions/sessions", "zeta/z", "docs/docs"]);
  docs.setBadge(3.7);
  assert.equal(listViews(scope).at(-1).badge, 3);
  docs.setBadge(0);
  assert.equal(listViews(scope).at(-1).badge, null);
  docs.setBadge(Number.NaN);
  assert.equal(listViews(scope).at(-1).badge, null);
});

test("an icon is optional and additive: with it, without it, and a wrong one never refuse a view", () => {
  const scope = {};
  const docs = registerView(view("docs/docs", { title: "Документы", icon: "FileText" }), scope);
  const sessions = registerView(view("sessions/sessions", { title: "Сессии", order: 0 }), scope);
  const unknown = registerView(view("probe/probe", { title: "Проба", icon: "NoSuchIcon" }), scope);
  const garbage = [42, "", "   ", null, { name: "History" }, Symbol("icon"), 1n].map((icon, index) => registerView(view(`junk/v${index}`, { icon }), scope));
  for (const result of [docs, sessions, unknown, ...garbage]) assert.equal(result.ok, true, "a view registers whatever its icon");
  const entry = (id) => listViews(scope).find((item) => item.registration.id === id).registration;
  assert.equal(entry("docs/docs").icon, "FileText");
  assert.equal(tabIcon(entry("docs/docs").icon), "FileText", "the host draws a known name");
  assert.equal("icon" in entry("sessions/sessions"), false, "without an icon the registration is as before");
  assert.equal(tabIcon(entry("sessions/sessions").icon), null);
  assert.equal(entry("probe/probe").icon, "NoSuchIcon", "the contract keeps any non-empty name; the host decides what it draws");
  assert.equal(tabIcon(entry("probe/probe").icon), null, "an unknown name: label alone, no fallback glyph");
  for (let index = 0; index < garbage.length; index++) assert.equal("icon" in entry(`junk/v${index}`), false, "anything but a non-empty string is dropped");
  assert.equal(registerView(view("trim/t", { icon: "  History " }), scope).ok, true);
  assert.equal(entry("trim/t").icon, "History");
  assert.equal(listViews(scope)[0].registration.id, "sessions/sessions", "the icon does not change tab order");
});

test("the host publishes slots; unchanged slots keep identity and a stale host cannot publish or detach", () => {
  const scope = {};
  let heard = 0;
  const off = subscribe(() => { heard += 1; }, scope);
  const host = attachHost(scope);
  const a = element("a");
  host.publish(new Map([["sessions/sessions", { generation: 7, element: a, props: props() }]]));
  const slot = viewSlot("sessions/sessions", undefined, scope);
  assert.equal(slot.element, a);
  const before = revision(scope);
  host.publish(new Map([["sessions/sessions", { generation: 7, element: a, props: props({ onNavigate: slot.props.onNavigate }) }]]));
  assert.equal(revision(scope), before, "republishing the same slot is not a change");
  assert.equal(viewSlot("sessions/sessions", undefined, scope), slot);
  assert.equal(viewSlot("sessions/sessions", 7, scope), slot);
  assert.equal(viewSlot("sessions/sessions", 6, scope), null, "an older instance of the view gets no slot");
  host.publish(new Map([["sessions/sessions", { generation: 8, element: a, props: props({ onNavigate: slot.props.onNavigate }) }]]));
  assert.notEqual(revision(scope), before, "a new generation is a change");
  const newer = attachHost(scope);
  host.publish(new Map([["sessions/sessions", { generation: 9, element: element("stale"), props: props() }]]));
  assert.equal(viewSlot("sessions/sessions", undefined, scope), null, "the newer host starts empty and the stale one is ignored");
  host.dispose();
  assert.notEqual(openRegistry(scope).registry.host, null, "the stale host's dispose leaves the newer host attached");
  newer.dispose();
  assert.equal(openRegistry(scope).registry.host, null);
  off();
  const count = heard;
  registerView(view("x/x"), scope);
  assert.equal(heard, count, "an unsubscribed listener hears nothing");
});

test("one failing listener does not keep the others from hearing the change", () => {
  const scope = {};
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  try {
    subscribe(() => { throw new Error("broken view"); }, scope);
    let heard = false;
    subscribe(() => { heard = true; }, scope);
    registerView(view("sessions/sessions"), scope);
    assert.equal(heard, true);
    assert.equal(errors.length, 1);
  } finally { console.error = original; }
});

/**
 * Copies of the contract in the plugins next to the host: ours in bb-workbench, the manifest plugin in the published
 * manifest-bb-plugins repository (which ships this host as is). Every copy present must equal the host's; this file is
 * the same in both repositories, so the published host needs no local edits (2026-10-18).
 */
const CONTRACT_COPIES = [
  "../../sessions/sidebar-tabs-contract.ts",
  "../../sidebar-tabs-probe/sidebar-tabs-contract.ts",
  "../../document-review/sidebar-tabs-contract.ts",
  "../../manifest/lib/sidebar-tabs-contract.ts",
];

test("every bundled copy of the contract is identical", () => {
  const url = (path) => new URL(path, import.meta.url);
  const host = readFileSync(url("../sidebar-tabs-contract.ts"), "utf8");
  const present = CONTRACT_COPIES.filter((copy) => existsSync(url(copy)));
  assert.ok(present.length > 0, "no plugin next to the host carries a copy of the contract");
  for (const copy of present) assert.equal(readFileSync(url(copy), "utf8"), host, `${copy} differs from the host's contract`);
});
