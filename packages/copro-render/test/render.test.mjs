import test from "node:test";
import assert from "node:assert/strict";
import { createCoProProject } from "../../copro-project/src/index.js";
import { createRenderPlan, selectRenderBackend } from "../src/index.js";

test("render plan is separate from the saved project", () => {
  const project = createCoProProject({ id: "project:1", now: "2026-10-04T00:00:00.000Z" });
  const plan = createRenderPlan(project, { width: 1080, height: 1920 });
  assert.equal(project.renderer, undefined);
  assert.equal(plan.target.width, 1080);
  assert.equal(plan.target.height, 1920);
  assert.deepEqual(plan.requiredCapabilities, ["render.video"]);
});

test("backend selection is runtime capability based", () => {
  const project = createCoProProject({ id: "project:1" });
  const plan = createRenderPlan(project);
  const selected = selectRenderBackend(plan, [
    { id: "remote", capabilities: ["render.video"], priority: 1, costScore: 10 },
    { id: "native", capabilities: ["render.video"], priority: 2, costScore: 2 },
  ]);
  assert.equal(selected.id, "native");
});
