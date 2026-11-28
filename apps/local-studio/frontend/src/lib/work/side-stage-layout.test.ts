import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSideDock, reorderSideTabs } from "./side-stage-layout.ts";

test("normalizes persisted Side Stage docking without changing the Chat/Work default", () => {
  assert.equal(normalizeSideDock("left"), "left");
  assert.equal(normalizeSideDock("right"), "right");
  assert.equal(normalizeSideDock("auto"), "auto");
  assert.equal(normalizeSideDock("unexpected"), "auto");
  assert.equal(normalizeSideDock(null), "auto");
});

test("reorders stable Side Stage tab identities in either direction", () => {
  const tabs = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  assert.deepEqual(reorderSideTabs(tabs, "a", "c"), [{ id: "b" }, { id: "c" }, { id: "a" }, { id: "d" }]);
  assert.deepEqual(reorderSideTabs(tabs, "d", "b"), [{ id: "a" }, { id: "d" }, { id: "b" }, { id: "c" }]);
  assert.equal(reorderSideTabs(tabs, "missing", "b"), tabs);
  assert.equal(reorderSideTabs(tabs, "a", "a"), tabs);
});
