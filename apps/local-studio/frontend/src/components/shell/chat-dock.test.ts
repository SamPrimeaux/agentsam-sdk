import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateChatDockResize } from "./chat-dock.ts";

test("chat/stage divider resizes within its available bounds", () => {
  assert.deepEqual(calculateChatDockResize("left", 420, -80, 1000), { dock: "left", width: 500, docked: false });
  assert.deepEqual(calculateChatDockResize("left", 420, 400, 1000), { dock: "left", width: 280, docked: false });
});

test("dragging beyond the expanded stage limit docks AgentSam chat on the right", () => {
  assert.deepEqual(calculateChatDockResize("left", 1000, -90, 1000), { dock: "right", width: 1000, docked: true });
});

test("dragging beyond the collapsed stage limit docks AgentSam chat on the left", () => {
  assert.deepEqual(calculateChatDockResize("right", 280, 80, 1000), { dock: "left", width: 420, docked: true });
});

test("one pointer drag cannot bounce the chat pane repeatedly between sides", () => {
  assert.deepEqual(calculateChatDockResize("right", 1000, 900, 1000, true), { dock: "right", width: 280, docked: false });
});


test("ChatWorkspace moves the existing conversation pane instead of mounting a second assistant", async () => {
  const source = await readFile(new URL("./chat-workspace.tsx", import.meta.url), "utf8");
  assert.equal((source.match(/<ChatThread\s*\/>/g) ?? []).length, 1);
  assert.match(source, /chatDock === "left" \? \[chatPane, splitHandle, sidePane\] : \[sidePane, splitHandle, chatPane\]/);
  assert.match(source, /agentsam\.studio\.chatDock/);
  assert.match(source, /Move AgentSam chat to the right/);
});
