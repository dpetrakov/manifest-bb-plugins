import assert from "node:assert/strict";
import test from "node:test";
import { mergeOrder, moveId, nearestSlot, shownOrder, tileKey } from "../tiles-model.ts";

test("a tile moves to a position, clamped; nothing moves for an unknown id or the same place", () => {
  const ids = ["a", "b", "c", "d"];
  assert.deepEqual(moveId(ids, "a", 2), ["b", "c", "a", "d"]);
  assert.deepEqual(moveId(ids, "d", 0), ["d", "a", "b", "c"]);
  assert.deepEqual(moveId(ids, "b", 99), ["a", "c", "d", "b"]);
  assert.equal(moveId(ids, "b", 1), ids);
  assert.equal(moveId(ids, "x", 0), ids);
});

test("the drop slot is the tile under the pointer, else the nearest one in the closer row", () => {
  // Two rows of 40 px tiles with 4 px gaps: three on top, one below.
  const tile = (col, row) => ({ left: col * 44, top: row * 44, right: col * 44 + 40, bottom: row * 44 + 40 });
  const slots = [tile(0, 0), tile(1, 0), tile(2, 0), tile(0, 1)];
  assert.equal(nearestSlot(slots, 60, 20), 1);
  assert.equal(nearestSlot(slots, 42, 20), 0, "in the gap: the nearer tile");
  assert.equal(nearestSlot(slots, 200, 20), 2, "past the row end: its last tile");
  assert.equal(nearestSlot(slots, 120, 60), 3, "under an empty cell of the second row: the second row");
  assert.equal(nearestSlot(slots, 20, -30), 0);
  assert.equal(nearestSlot([], 0, 0), -1);
});

test("saving keeps hidden items in their places", () => {
  const all = [
    { id: "__bb__/new-thread", isVisible: false }, { id: "vps", isVisible: true }, { id: "__bb__/skills", isVisible: false },
    { id: "projects", isVisible: true }, { id: "plan", isVisible: true },
  ];
  assert.deepEqual(mergeOrder(all, ["plan", "vps", "projects"]), ["__bb__/new-thread", "plan", "__bb__/skills", "vps", "projects"]);
  assert.deepEqual(mergeOrder(all, ["projects"]), ["__bb__/new-thread", "projects", "__bb__/skills", "vps", "plan"], "missing visible ids keep their order");
  assert.deepEqual(mergeOrder(all, ["__bb__/skills", "ghost", "plan"]), ["__bb__/new-thread", "plan", "__bb__/skills", "vps", "projects"], "hidden and unknown ids are ignored");
});

test("a pending order is drawn only while it holds the same tiles", () => {
  assert.deepEqual(shownOrder(["a", "b"], ["b", "a"]), ["b", "a"]);
  assert.deepEqual(shownOrder(["a", "b"], null), ["a", "b"]);
  assert.deepEqual(shownOrder(["a", "b", "c"], ["b", "a"]), ["a", "b", "c"]);
  assert.deepEqual(shownOrder(["a", "c"], ["b", "a"]), ["a", "c"]);
});

test("arrows move focus around, Alt+arrows move the tile, Home/End jump", () => {
  assert.deepEqual(tileKey("ArrowRight", false, 3, 4), { kind: "focus", index: 0 });
  assert.deepEqual(tileKey("ArrowLeft", false, 0, 4), { kind: "focus", index: 3 });
  assert.deepEqual(tileKey("ArrowDown", false, 1, 4), { kind: "focus", index: 2 });
  assert.deepEqual(tileKey("ArrowLeft", true, 0, 4), { kind: "move", index: 0 });
  assert.deepEqual(tileKey("ArrowRight", true, 1, 4), { kind: "move", index: 2 });
  assert.deepEqual(tileKey("End", false, 0, 4), { kind: "focus", index: 3 });
  assert.equal(tileKey("Enter", false, 0, 4), null);
});
