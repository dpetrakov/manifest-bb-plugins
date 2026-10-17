import assert from "node:assert/strict";
import test from "node:test";
import { availability, AUTOMATIC, badgeLabel, badgeText, TAB_ICONS, tabIcon, createModeSwitch, EMPTY_GRACE_MS, follow, NO_SELECTION, migratedValue, modeOf, neighbour, pick, routeKey, routeOwner, STANDARD, tabsVisible, toggleTarget } from "../tabs-model.ts";

const sessions = { id: "sessions/sessions", follows: { threads: true } };
const docs = { id: "docs/docs", follows: { navItems: ["docs/documents"], routePrefixes: ["/plugins/docs/"] } };
const views = [sessions, docs];
const route = (extra = {}) => ({ activeThreadId: null, navItemId: null, pathname: "/", ...extra });

test("«мои / штатные»: only bb's list is standard; mine never pins the host", () => {
  assert.equal(modeOf(STANDARD), "standard");
  assert.equal(modeOf("__builtin__"), "standard");
  for (const value of [AUTOMATIC, "sidebar-tabs/tabs", "sessions/sessions", undefined, null]) assert.equal(modeOf(value), "mine");
  assert.equal(toggleTarget("mine"), STANDARD);
  assert.equal(toggleTarget("standard"), AUTOMATIC);
});

test("only the retired sessions list is migrated; bb's list and other choices stay", () => {
  assert.equal(migratedValue("sessions/sessions"), AUTOMATIC);
  for (const value of [STANDARD, AUTOMATIC, "sidebar-tabs/tabs", "other/list"]) assert.equal(migratedValue(value), null);
});

test("opening a thread selects Сессии; the owner's page selects its tab", () => {
  const start = NO_SELECTION;
  const inThread = follow(start, views, route({ activeThreadId: "thr_1" }));
  assert.equal(inThread.active, "sessions/sessions");
  const onDocs = follow(inThread, views, route({ navItemId: "docs/documents", pathname: "/plugins/docs/documents" }));
  assert.equal(onDocs.active, "docs/docs");
  assert.equal(follow(inThread, views, route({ pathname: "/plugins/docs/documents/a.md" })).active, "docs/docs");
  assert.equal(follow(onDocs, views, route({ activeThreadId: "thr_2" })).active, "sessions/sessions");
});

test("a manual pick stays until the route changes, and changes no route", () => {
  let selection = follow(NO_SELECTION, views, route({ activeThreadId: "thr_1" }));
  selection = pick(selection, views, "docs/docs");
  assert.equal(selection.active, "docs/docs");
  assert.equal(selection.routeKey, routeKey(route({ activeThreadId: "thr_1" })));
  assert.equal(follow(selection, views, route({ activeThreadId: "thr_1" })), selection, "re-rendering the same route keeps the pick");
  assert.equal(follow(selection, views, route({ activeThreadId: "thr_2" })).active, "sessions/sessions");
  assert.equal(pick(selection, views, "missing/view"), selection);
});

test("a route nobody claims keeps the current tab", () => {
  const selection = { active: "docs/docs", routeKey: "thread:thr_1", fallback: false, wanted: null };
  assert.equal(follow(selection, views, route({ pathname: "/settings" })).active, "docs/docs");
  assert.equal(routeOwner(views, route({ pathname: "/settings" })), null);
});

test("a view that goes away gives way to the first one; no views means no tab", () => {
  const selection = { active: "docs/docs", routeKey: "path:/", fallback: false, wanted: null };
  assert.equal(follow(selection, [sessions], route()).active, "sessions/sessions");
  assert.equal(follow(selection, [], route()).active, null);
  assert.equal(follow({ active: null, routeKey: "path:/", fallback: true, wanted: null }, [docs], route()).active, "docs/docs");
});

test("load order does not decide the tab: a default gives way, a real choice stays", () => {
  const probeFirst = follow(NO_SELECTION, [docs], route());
  assert.deepEqual(probeFirst, { active: "docs/docs", routeKey: "path:/", fallback: true, wanted: null });
  assert.equal(follow(probeFirst, [sessions, docs], route()).active, "sessions/sessions", "the first view in order wins over a default");
  const inThread = follow(NO_SELECTION, [docs], route({ activeThreadId: "thr_1" }));
  assert.equal(inThread.active, "docs/docs");
  assert.equal(follow(inThread, [sessions, docs], route({ activeThreadId: "thr_1" })).active, "sessions/sessions", "a late owner takes its route");
  const picked = pick(probeFirst, [docs], "docs/docs");
  assert.equal(picked.fallback, false, "picking the defaulted tab makes it a choice");
  assert.equal(follow(picked, [sessions, docs], route()).active, "docs/docs");
});

test("a real choice survives its view going away and coming back on the same route", () => {
  const thread = route({ activeThreadId: "thr_1" });
  let selection = pick(follow(NO_SELECTION, views, thread), views, "docs/docs");
  // window reload: the host mounts before any provider, then sessions registers before docs
  selection = follow(selection, [], thread);
  assert.equal(selection.active, null);
  assert.equal(selection.wanted, "docs/docs");
  selection = follow(selection, [sessions], thread);
  assert.equal(selection.active, "sessions/sessions", "meanwhile the route's owner is shown");
  selection = follow(selection, [sessions, docs], thread);
  assert.equal(selection.active, "docs/docs", "the choice comes back with its view");
  assert.equal(selection.wanted, null);
  // the wish does not outlive a route change
  const gone = follow(pick(selection, views, "docs/docs"), [sessions], thread);
  assert.equal(gone.wanted, "docs/docs");
  const moved = follow(gone, [sessions], route({ activeThreadId: "thr_2" }));
  assert.equal(moved.wanted, null);
  assert.equal(follow(moved, [sessions, docs], route({ activeThreadId: "thr_2" })).active, "sessions/sessions");
});

test("tabs appear only with a choice; empty becomes a dead end only after the grace period", () => {
  assert.equal(tabsVisible(1), false);
  assert.equal(tabsVisible(2), true);
  assert.equal(availability(0, 0, true), "waiting");
  assert.equal(availability(0, EMPTY_GRACE_MS, true), "empty");
  assert.equal(availability(1, 0, true), "ready");
  assert.equal(availability(2, 0, false), "incompatible");
});

test("arrow keys wrap, Home and End jump", () => {
  const ids = ["a", "b", "c"];
  assert.equal(neighbour(ids, "a", "ArrowRight"), "b");
  assert.equal(neighbour(ids, "c", "ArrowRight"), "a");
  assert.equal(neighbour(ids, "a", "ArrowLeft"), "c");
  assert.equal(neighbour(ids, "b", "Home"), "a");
  assert.equal(neighbour(ids, "a", "End"), "c");
  assert.equal(neighbour(ids, "a", "Enter"), null);
  assert.equal(neighbour([], null, "ArrowRight"), null);
});

test("«мои ↔ штатные»: повтор во время переключения не запускает вторую запись; направление — от свежего чтения", async () => {
  let release;
  const writes = [];
  let mode = "mine";
  const io = {
    read: async () => ({ mode, revision: 7 }),
    write: (next, known) => { writes.push([next, known.revision]); return new Promise((resolve) => { release = () => { mode = next; resolve(); }; }); },
  };
  const states = [];
  const command = createModeSwitch(io, { onChange: (state) => states.push(state.running) });
  const first = command.start("toggle");
  const second = command.start("toggle");
  const third = command.start("standard");
  assert.equal(await second, undefined);
  assert.equal(await third, undefined);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(writes, [["standard", 7]]);
  assert.equal(command.state.running, true);
  release();
  assert.deepEqual(await first, { from: "mine", to: "standard" });
  assert.equal(command.state.running, false);
  assert.deepEqual(await command.start("standard"), { from: "standard", to: "standard" }, "уже штатный — без записи");
  assert.equal(writes.length, 1);
  const failing = createModeSwitch({ read: async () => { throw new Error("offline"); }, write: async () => {} });
  assert.equal(await failing.start("toggle"), undefined);
  assert.match(failing.state.error.message, /offline/);
});

test("tab icons: lucide-react names and their kebab-case form; anything else draws nothing", async () => {
  assert.equal(tabIcon("FileText"), "FileText");
  assert.equal(tabIcon("file-text"), "FileText");
  assert.equal(tabIcon("history"), "History");
  assert.equal(tabIcon(" History "), "History");
  assert.equal(tabIcon("folder-git-2"), "FolderGit2");
  for (const wrong of ["NoSuchIcon", "Zap", "", "file_text", "x".repeat(65), undefined, null, 7, {}, ["History"]]) assert.equal(tabIcon(wrong), null);
  const lucide = await import("lucide-react");
  for (const name of TAB_ICONS) assert.ok(lucide[name], `lucide-react has ${name}`);
});

test("tab counter: Russian numbers and plural for screen readers", () => {
  assert.equal(badgeText(3), "3");
  assert.equal(badgeText(1200), "1\u00a0200");
  assert.equal(badgeLabel(1), "1 ждёт вас");
  assert.equal(badgeLabel(2), "2 ждут вас");
  assert.equal(badgeLabel(5), "5 ждут вас");
  assert.equal(badgeLabel(21), "21 ждёт вас");
});
