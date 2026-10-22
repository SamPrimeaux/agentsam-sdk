import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const main = readFileSync(path.join(root, "src/main.ts"), "utf8");
const templates = readFileSync(path.join(root, "src/templates.ts"), "utf8");
const manifest = JSON.parse(readFileSync(path.join(root, "agentsam.app.json"), "utf8"));

test("SamSketch uses the host-owned AgentSam shell and conversation", () => {
  assert.match(main, /agentsam\.samsketch\.v1/);
  assert.match(main, /assistant\.request/);
  assert.doesNotMatch(main, /mountSharedNavigation|mountAssistantDrawer|mountMiniAgentSam/);
  assert.doesNotMatch(main, /__samsketchAssistant|__samsketchMiniAgentSam/);
});

test("source geometry is delivered losslessly in compressed form", () => {
  const inventory = JSON.parse(readFileSync(path.join(root, "public/source-assets-manifest.json"), "utf8"));
  assert.equal(inventory.sourceParts, 47);
  assert.equal(inventory.parts.length, 47);
  assert.match(templates, /stl\/"\+id\+"\.stl\.gz/);
  assert.ok(existsSync(path.join(root, "public/stl", "bowl.stl.gz")));
});

test("SamSketch is a registered Local Studio included app", () => {
  assert.equal(manifest.id, "samsketch");
  assert.equal(manifest.embed.stage, "samsketch");
  assert.equal(manifest.embed.build.output, "dist");
  assert.ok(manifest.capabilities.includes("scene-authoring"));
});
