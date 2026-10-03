import assert from "node:assert/strict";
import test from "node:test";
import { buildStudioSystemMessages, studioRunModeInstruction } from "./studio-chat-policy.ts";

test("side co-workers default cleanly to an Ask-compatible prompt when the host requests Ask", () => {
  const messages = buildStudioSystemMessages({
    surface: "side",
    runMode: "ask",
    parentTitle: "Lead",
    parentExcerpt: "Investigate the failing build",
  });
  assert.match(messages[0]!.content, /co-worker/i);
  assert.match(messages[1]!.content, /Run mode is Ask/i);
  assert.match(messages[2]!.content, /Lead/);
});

test("multitask policy never invents ACP child runs", () => {
  const instruction = studioRunModeInstruction("multitask");
  assert.match(instruction, /do not claim child agents/i);
  assert.match(instruction, /control-plane run actually spawned them/i);
});

test("workspace context is additive and bounded by the shared policy builder", () => {
  const messages = buildStudioSystemMessages({
    surface: "trail",
    runMode: "debug",
    workspace: [{ path: "src/example.ts", content: "export const ok = true;" }],
  });
  assert.match(messages.at(-1)!.content, /src\/example\.ts/);
  assert.match(messages[1]!.content, /Run mode is Debug/i);
});
