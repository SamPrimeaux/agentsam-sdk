import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { bindGeneratedSettings, insertGeneratingNode, removeGeneratingNode, renderGeneratedSettings } from "../frontend/static/js/generation-inspector.mjs";
import { guardSectionWrite } from "../frontend/static/js/generation-namespace.mjs";
import { generateBlockStream } from "../backend/admin/generate-block-stream.js";
import { guardHandler } from "../frontend/static/js/serve-rewrite.mjs";

const require = createRequire(new URL("../package.json", import.meta.url));
const { JSDOM } = require("jsdom");

function page() {
  const dom = new JSDOM('<main id="te-inspector-body"></main><div id="te-tree"></div><div data-agentsam-block="menu"></div>');
  return dom.window.document;
}

test("settings group renders in the inspector and a slider updates the wrapper", () => {
  const document = page();
  const body = document.querySelector("#te-inspector-body");
  const wrapper = document.querySelector("[data-agentsam-block]");
  let calls = 0;
  renderGeneratedSettings(body, { padding: 12, threshold: 4 });
  assert.equal(body.querySelector("[data-settings-group=\"generated\"]").textContent.includes("threshold"), true);
  assert.equal(body.querySelector(".te-range-control input").tagName, "INPUT");
  bindGeneratedSettings(body, wrapper, () => { calls += 1; });
  const slider = body.querySelector("[data-range-field=\"padding\"]");
  slider.value = "24";
  slider.dispatchEvent(new document.defaultView.Event("input"));
  assert.equal(wrapper.style.getPropertyValue("--agentsam-setting-padding"), "24");
  assert.equal(calls, 0);
});

test("generating node is inserted at start and removed on abort or error", () => {
  const document = page();
  const tree = document.querySelector("#te-tree");
  insertGeneratingNode(tree);
  assert.equal(tree.querySelector("[data-generating] .te-tree-row__name").textContent, "Generating...");
  assert.equal(tree.querySelector(".te-tree-section").getAttribute("data-generating"), "true");
  removeGeneratingNode(tree);
  assert.equal(tree.querySelector("[data-generating]"), null);
  insertGeneratingNode(tree);
  removeGeneratingNode(tree);
  assert.equal(tree.innerHTML.includes("Generating"), false);
});

test("section save refuses a deny-listed block without writing", async () => {
  let written = false;
  const result = await guardSectionWrite({
    generator: "agentsam",
    blockId: "menu",
    code: { html: '<script src="https://evil.example/x.js"></script>', css: "", js: "eval(1)" },
  }, async () => { written = true; });
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(written, false);
});

test("generate-block abort cancels the upstream call", () => {
  const controller = new AbortController();
  let upstream;
  generateBlockStream({ signal: controller.signal }, (signal) => { upstream = signal; });
  controller.abort();
  assert.equal(upstream.aborted, true);
});

test("a throwing block is skipped and the rest of the page remains", () => {
  const served = [];
  const blocks = [
    { id: "bad", element() { throw new Error("bad block"); } },
    { id: "good", element() { served.push("good"); } },
  ];
  blocks.forEach(function(block) {
    guardHandler(block).element({ remove() { served.push("removed:" + block.id); } });
  });
  assert.deepEqual(served, ["removed:bad", "good"]);
});
