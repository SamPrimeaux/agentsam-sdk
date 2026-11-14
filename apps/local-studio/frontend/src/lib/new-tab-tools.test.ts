import assert from "node:assert/strict";
import { test } from "node:test";
import { orderTools, parseToolUsage } from "./new-tab-tools.ts";

const tools = ["chat", "browser", "files", "terminal"].map((id) => ({ id }));

test("pinned tools lead in pin order, then recents by recency, then registry order", () => {
  const usage = { pinned: ["terminal", "chat"], opened: { files: 20, browser: 10, terminal: 99 } };
  assert.deepEqual(orderTools(tools, usage).map((t) => t.id), ["terminal", "chat", "files", "browser"]);
});

test("unknown pins are ignored and an unused account keeps registry order", () => {
  assert.deepEqual(orderTools(tools, { pinned: ["gone"], opened: {} }).map((t) => t.id), ["chat", "browser", "files", "terminal"]);
});

test("corrupt storage reads as empty usage", () => {
  assert.deepEqual(parseToolUsage("not json"), { pinned: [], opened: {} });
  assert.deepEqual(parseToolUsage(JSON.stringify({ pinned: ["a", 3], opened: { a: 1, b: "x" } })), { pinned: ["a"], opened: { a: 1 } });
  assert.deepEqual(parseToolUsage(null), { pinned: [], opened: {} });
});
