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

test("agent turns use real request lifecycle without timer-driven progress", () => {
  const visuals = createLocalStudioRuntimeVisuals();
  const id = "agent-turn:test";
  const surface = "trail:test";

  visuals.startAgentTurn(id, "Understanding your request", undefined, surface);
  let scene = visuals.controllerFor(surface).getScene();
  assert.equal(scene.status, "running");
  assert.equal(scene.dominantSemantic, "thinking");
  assert.equal(scene.progress, null);

  visuals.progressPoints(id, "thinking", "Planning", 2, 5, undefined, "phase-points", surface);
  scene = visuals.controllerFor(surface).getScene();
  assert.equal(scene.progress, 0.4);
  assert.deepEqual(scene.metricPoints, {
    completed: 2,
    total: 5,
    basis: "phase-points",
  });

  visuals.completeAgentTurn(id, surface);
  assert.equal(visuals.controllerFor(surface).getScene().status, "success");
});

test("lead and co-worker surfaces keep independent runtime state", () => {
  const visuals = createLocalStudioRuntimeVisuals();
  visuals.startAgentTurn("lead-op", "Lead planning", undefined, "trail:lead");
  visuals.startAgentTurn("side-op", "Co-worker researching", undefined, "side:worker");

  assert.equal(visuals.controllerFor("trail:lead").getScene().label, "Lead planning");
  assert.equal(visuals.controllerFor("side:worker").getScene().label, "Co-worker researching");

  visuals.completeAgentTurn("side-op", "side:worker");
  assert.equal(visuals.controllerFor("side:worker").getScene().status, "success");
  assert.equal(visuals.controllerFor("trail:lead").getScene().status, "running");
});

test("agent failures remain errors for the normal recovery UI to handle", () => {
  const visuals = createLocalStudioRuntimeVisuals();
  const id = "agent-turn:error";
  const surface = "side:error";
  visuals.startAgentTurn(id, "Co-worker working", undefined, surface);
  visuals.failAgentTurn(id, "provider unavailable", surface);
  assert.equal(visuals.controllerFor(surface).getScene().status, "error");
});
