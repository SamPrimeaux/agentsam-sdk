import test from "node:test";
import assert from "node:assert/strict";
import { defineCoProTemplate, instantiateTemplate } from "../src/index.js";

const template = defineCoProTemplate({
  id: "template:portrait-story",
  name: "Portrait Story",
  canvas: { width: 1080, height: 1920, frameRate: 30 },
  slots: [
    { id: "hero", kind: "media", required: true },
    { id: "title", kind: "text", required: false },
  ],
  tracks: [],
});

test("templates describe creative structure rather than providers", () => {
  assert.equal(template.schema, "copro.template.v1");
  assert.equal(JSON.stringify(template).includes("cloudflare"), false);
  assert.equal(JSON.stringify(template).includes("remotion"), false);
});

test("template instantiation enforces required slots", () => {
  assert.throws(() => instantiateTemplate(template, {
    projectId: "project:1",
    slotValues: {},
  }), /copro_template_required_slots_missing/);

  const project = instantiateTemplate(template, {
    projectId: "project:1",
    slotValues: { hero: "asset:1" },
    now: "2026-10-04T00:00:00.000Z",
  });
  assert.equal(project.schema, "copro.project.v1");
  assert.equal(project.metadata.templateId, "template:portrait-story");
});
