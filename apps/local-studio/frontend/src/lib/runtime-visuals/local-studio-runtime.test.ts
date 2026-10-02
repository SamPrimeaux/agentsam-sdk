import test from "node:test";
import assert from "node:assert/strict";
import { createLocalStudioRuntimeVisuals } from "./local-studio-runtime.ts";

test("workspace boot is real state and settles on completion", () => {
  const visuals = createLocalStudioRuntimeVisuals();
  visuals.startWorkspaceBoot();
  assert.equal(visuals.controller.getScene().status, "running");
  assert.equal(visuals.controller.getScene().dominantSemantic, "boot");

  visuals.completeWorkspaceBoot();
  assert.equal(visuals.controller.getScene().status, "success");
});

test("agent turns use real request lifecycle without fabricated progress", () => {
  const visuals = createLocalStudioRuntimeVisuals();
  const id = "agent-turn:test";

  visuals.startAgentTurn(id);
  let scene = visuals.controller.getScene();
  assert.equal(scene.status, "running");
  assert.equal(scene.dominantSemantic, "thinking");
  assert.equal(scene.progress, null);

  visuals.markAgentTurnStreaming(id);
  scene = visuals.controller.getScene();
  assert.equal(scene.status, "running");
  assert.equal(scene.progress, null);

  visuals.completeAgentTurn(id);
  assert.equal(visuals.controller.getScene().status, "success");
});

test("agent failures remain errors for the normal recovery UI to handle", () => {
  const visuals = createLocalStudioRuntimeVisuals();
  const id = "agent-turn:error";
  visuals.startAgentTurn(id);
  visuals.failAgentTurn(id, "provider unavailable");
  assert.equal(visuals.controller.getScene().status, "error");
});
