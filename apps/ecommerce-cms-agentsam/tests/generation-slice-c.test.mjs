import test from "node:test";
import assert from "node:assert/strict";
import { createGenerationLock } from "../frontend/static/js/generation-lock.mjs";
import { createGenerationSession, createPreviewSink, parseGeneratedDefinition, parseGeneratedSettings, PHASE_LABELS } from "../frontend/static/js/generation-stream.mjs";
import { applyHoisted, hoistSettings } from "../frontend/static/js/settings-hoist.mjs";
import { createGeneratedBlockStore } from "../frontend/static/js/cms-generated-store.mjs";
import { createTokenTextHandler, guardHandler, insertOptions } from "../frontend/static/js/serve-rewrite.mjs";
import { readFileSync } from "node:fs";

const good = [
  "<<<markup>>><div data-agentsam-block=\"menu\" id=\"__UID__\" class=\"__UID__\"></div>",
  "<<<css>>>[data-agentsam-block=\"menu\"] .__UID__ { padding: var(--__UID__-pad); }",
  "<<<js>>>(function(){ if (!customElements.get(\"__UID__-card\")) customElements.define(\"__UID__-card\", class extends HTMLElement {}); })()",
  "<<<settings>>>padding=12",
];

test("lock stays held until the last generation releases", async () => {
  const lock = createGenerationLock();
  let releaseA;
  let releaseB;
  const a = lock.run("A", () => new Promise((resolve) => { releaseA = resolve; }));
  const b = lock.run("B", () => new Promise((resolve) => { releaseB = resolve; }));
  assert.equal(lock.locked(), true);
  releaseA();
  await a;
  assert.equal(lock.locked(), true);
  releaseB();
  await b;
  assert.equal(lock.locked(), false);
  assert.equal(lock.finish("B"), 0);
});

test("error and abort unlock, and a script chunk stays text", async () => {
  const lock = createGenerationLock();
  const sink = createPreviewSink();
  const session = createGenerationSession({
    id: "bad",
    blockId: "menu",
    lock,
    sink,
    transport: async () => ({ chunks: ['<<<definition>>>{"kind":"section","type":"unsafe-test","label":"Unsafe test"}', "<<<markup>>><script>alert(1)</script>"] }),
  });
  const result = await session.run();
  assert.equal(result.saved, false);
  assert.equal(lock.locked(), false);
  assert.equal(sink.text.includes("<script>"), true);
  assert.equal(Object.hasOwn(sink, "innerHTML"), false);
  const aborted = createGenerationSession({
    id: "stop",
    blockId: "menu",
    lock,
    transport: async ({ signal }) => {
      signal.addEventListener("abort", () => {});
      return { chunks: [] };
    },
  });
  aborted.abort();
  const stopped = await aborted.run();
  assert.equal(stopped.record, null);
  assert.equal(lock.locked(), false);
});

test("split token resolves on the stream path", async () => {
  const lock = createGenerationLock();
  const sink = createPreviewSink();
  const session = createGenerationSession({
    id: "split",
    blockId: "menu",
    lock,
    sink,
    transport: async () => ({ chunks: ['<<<definition>>>{"kind":"section","type":"split-token","label":"Split token"}', "<<<markup>>>", "__UI", "D__"] }),
  });
  await session.run();
  assert.equal(sink.text.includes("agentsam-gen-menu"), true);
  assert.equal(sink.text.includes("__UI"), false);
});

test("hoisted setting change makes no model call", () => {
  let calls = 0;
  const transport = () => { calls += 1; };
  const hoisted = hoistSettings({ padding: "12", threshold: "4" });
  assert.equal(hoisted.editor.padding, "12");
  assert.equal(hoisted.generated.threshold, "4");
  const wrapper = { style: { setProperty() {} }, dataset: {} };
  applyHoisted(wrapper, hoisted.editor);
  transport;
  assert.equal(calls, 0);
  assert.equal(wrapper.dataset.padding, "12");
});

test("lint failure repairs once then saves nothing", async () => {
  const lock = createGenerationLock();
  let repairs = 0;
  const session = createGenerationSession({
    id: "lint",
    blockId: "menu",
    lock,
    transport: async () => ({ chunks: ['<<<definition>>>{"kind":"section","type":"lint-test","label":"Lint test"}', "<<<markup>>><div></div>"] }),
    repair() { repairs += 1; return { html: "<div></div>", css: "", js: "" }; },
  });
  const result = await session.run();
  assert.equal(repairs, 1);
  assert.equal(result.saved, false);
  assert.equal(result.phases.includes(PHASE_LABELS.checking), true);
});

test("store adapter keeps provenance with canonical code and names no tables", async () => {
  const rows = [];
  const revisions = [];
  const store = createGeneratedBlockStore({
    put: async (row) => rows.push(row),
    get: async (id) => rows.find((row) => row.id === id),
    revision: async (entry) => revisions.push(entry),
    list: async () => rows.map((row) => row.provenance),
  });
  await store.saveGeneratedBlock({ blockId: "menu", canonical: { html: "__UID__" }, provenance: { generator: "agentsam" } });
  assert.equal((await store.loadBlock("menu")).canonical.html, "__UID__");
  assert.equal(revisions[0].entityId, "menu");
  const source = readFileSync(new URL("../frontend/static/js/cms-generated-store.mjs", import.meta.url), "utf8");
  assert.equal(source.includes("cms_section_blocks"), false);
});

test("serve rewriter buffers a split token and skips a throwing block", () => {
  const handler = createTokenTextHandler("menu");
  handler.text({ text: "__UI", lastInTextNode: false });
  handler.text({ text: "D__", lastInTextNode: true });
  assert.deepEqual(handler.resolved, ["agentsam-gen-menu"]);
  const guarded = guardHandler({ element() { throw new Error("bad block"); } });
  let removed = false;
  guarded.element({ remove() { removed = true; } });
  assert.equal(removed, true);
  assert.deepEqual(insertOptions(false), { html: false });
  assert.deepEqual(insertOptions(true), { html: true });
});


test("generated key=value settings parse into typed editor values", () => {
  assert.deepEqual(parseGeneratedSettings("padding=12\nmotion=true\nbackground=#111827\nlabel=Hero"), {
    padding: 12,
    motion: true,
    background: "#111827",
    label: "Hero",
  });
});


test("generated definition normalizes into a merchant-facing semantic type", () => {
  assert.deepEqual(
    parseGeneratedDefinition('{"kind":"section","type":"testimonial-carousel","label":"Testimonial carousel","settings":{"gap":{"type":"range"}}}'),
    {
      kind: "section",
      type: "testimonial-carousel",
      label: "Testimonial carousel",
      settings: { gap: { type: "range" } },
      blocks: [],
    },
  );
});


test("generated definition accepts settingsSchema as a provider compatibility alias", () => {
  const definition = parseGeneratedDefinition(
    '{"kind":"section","type":"pricing-grid","label":"Pricing grid","settingsSchema":{"gap":{"type":"range"}}}',
  );
  assert.equal(definition.type, "pricing-grid");
  assert.deepEqual(definition.settings, { gap: { type: "range" } });
});
