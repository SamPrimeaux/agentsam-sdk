import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createGenerationFlow, mountAssistantHeader, mountComposer } from "../frontend/static/js/generation-surfaces.mjs";

const require = createRequire(new URL("../package.json", import.meta.url));
const { JSDOM } = require("jsdom");

function page() {
  const dom = new JSDOM('<div id="agentsam-dock" data-surface="right"><header class="agentsam-head"></header><div id="agentsam-messages"></div><textarea id="agentsam-input" placeholder="Ask anything..."></textarea></div><div class="admin-dock__compose" data-composer-slot="dock"></div><div data-composer-slot="editor"></div><div id="te-tree"></div><section id="te-block-panel" data-surface="left" hidden></section><div id="te-inspector-body"></div><div data-agentsam-block="menu"></div>');
  return dom.window.document;
}

test("composer mounts in both slots and the assistant header replaces the old placeholder", () => {
  const document = page();
  mountComposer(document.querySelector("[data-composer-slot=\"dock\"]"), "dock");
  mountComposer(document.querySelector("[data-composer-slot=\"editor\"]"), "editor");
  assert.equal(document.querySelectorAll("agentsam-composer").length, 2);
  const header = mountAssistantHeader(document.querySelector("#agentsam-dock"), { selection: "Hero", expanded: false });
  assert.equal(header.actions.includes("New chat"), true);
  assert.equal(document.querySelector("#agentsam-input").placeholder.includes("Ask anything"), false);
  assert.equal(document.querySelector("#agentsam-dock").getAttribute("data-surface"), "right");
});

test("request stays editable and nothing generates before send", () => {
  const document = page();
  const flow = createGenerationFlow({
    assistant: document.querySelector("#agentsam-dock"),
    messages: document.querySelector("#agentsam-messages"),
    tree: document.querySelector("#te-tree"),
    panel: document.querySelector("#te-block-panel"),
    inspector: document.querySelector("#te-inspector-body"),
    wrapper: document.querySelector("[data-agentsam-block]"),
  });
  flow.handoff("shrinking sticky header");
  assert.equal(document.querySelector("[data-action-card]").closest("#agentsam-dock").getAttribute("data-surface"), "right");
  document.querySelector("[data-action-card]").click();
  const box = document.querySelector("[data-request-box]");
  box.value = "center the menu";
  assert.equal(flow.state.calls, 0);
  document.querySelector("[data-send-request]").click();
  assert.equal(flow.state.calls, 1);
  assert.equal(document.querySelector("#te-block-panel").getAttribute("data-surface"), "left");
  assert.equal(document.querySelector("miniagentsam-codepreview").getAttribute("data-lines"), "13");
  flow.complete({ padding: 12 }, { prompt: "center the menu" });
  assert.equal(document.querySelector("#te-inspector-body [data-ai-generated]") !== null, true);
  assert.equal(document.querySelector("#te-inspector-body [data-followup]") !== null, true);
});

import { readFileSync } from "node:fs";

test("a hostile request renders as text and creates no img element", () => {
  const document = page();
  const hostile = '<img src=x onerror=alert(1)>';
  const flow = createGenerationFlow({
    assistant: document.querySelector("#agentsam-dock"),
    messages: document.querySelector("#agentsam-messages"),
    tree: document.querySelector("#te-tree"),
    panel: document.querySelector("#te-block-panel"),
    inspector: document.querySelector("#te-inspector-body"),
    wrapper: document.querySelector("[data-agentsam-block]"),
  });
  flow.handoff(hostile);
  document.querySelector("[data-action-card]").click();
  assert.equal(document.querySelector("#te-block-panel img"), null);
  assert.equal(document.querySelector("[data-request-box]").value, hostile);
  flow.complete({}, { prompt: hostile, title: hostile });
  assert.equal(document.querySelector("#te-inspector-body img"), null);
  assert.equal(document.querySelector("[data-ai-generated] p").textContent, hostile);
});

test("streamed code reaches the real preview element only through textContent", () => {
  const source = readFileSync(new URL("../frontend/static/js/miniagentsam-codepreview.js", import.meta.url), "utf8");
  const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "dangerously", url: "https://editor.local/" });
  dom.window.eval(source);
  const preview = dom.window.document.createElement("miniagentsam-codepreview");
  dom.window.document.body.appendChild(preview);
  preview.appendText("<img src=x onerror=alert(1)>");
  const pre = preview.shadowRoot.querySelector("pre");
  assert.equal(pre.querySelector("img"), null);
  assert.equal(pre.textContent, "<img src=x onerror=alert(1)>");
  assert.equal(source.includes("this.pre.innerHTML"), false);
  assert.equal(source.includes("this.pre.textContent"), true);
});


test("the existing generation preview is pinned visibly to the left rail", () => {
  const document = page();
  const rail = document.createElement('aside');
  rail.className = 'theme-studio-tree';
  rail.getBoundingClientRect = () => ({ left: 5, top: 54, right: 285, bottom: 754, width: 280, height: 700 });
  const tree = document.querySelector('#te-tree');
  const panel = document.querySelector('#te-block-panel');
  tree.before(rail);
  rail.append(tree, panel);
  const flow = createGenerationFlow({
    assistant: document.querySelector('#agentsam-dock'),
    messages: document.querySelector('#agentsam-messages'),
    tree, panel,
    inspector: document.querySelector('#te-inspector-body'),
  });
  flow.handoff('create a new reusable section');
  flow.openRequest();
  assert.equal(panel.style.position, 'fixed');
  assert.equal(panel.style.left, '13px');
  assert.equal(panel.style.width, '264px');
  flow.send();
  assert.equal(panel.dataset.panelState, 'generating');
  assert.ok(panel.querySelector('miniagentsam-codepreview'), 'the real streaming component is in the visible left panel');
  assert.equal(flow.state.calls, 1);
});
