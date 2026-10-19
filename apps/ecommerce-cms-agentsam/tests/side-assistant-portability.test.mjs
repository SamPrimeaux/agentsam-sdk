import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../frontend/static");
const read = (p) => readFileSync(path.join(root, p), "utf8");
const js = read("js/agentsam.js");
const start = js.indexOf("function agentsamOpenStateKey() {");
const end = js.indexOf("\n}\n", start);
assert.ok(start > 0 && end > start, "missing scoped preference helper");
const functionSource = js.slice(start, end + 2);

function getKey(context = {}, dataset = {}) {
  const sandbox = {
    window: { __agentsamPageContext: context },
    document: { body: { dataset } },
  };
  return runInNewContext(functionSource + "\n agentsamOpenStateKey()", sandbox);
}

test("Side Assistant open state is installation-scoped and unavailable without identity", () => {
  assert.equal(getKey(), null);
  assert.equal(getKey({installation_id:"merchant-a"}),
    "agentsam.ecommerce.side-assistant.open.v1:merchant-a");
  assert.equal(getKey({installationId:"merchant-b"}),
    "agentsam.ecommerce.side-assistant.open.v1:merchant-b");
  assert.equal(getKey({site_id:"demo/site"}),
    "agentsam.ecommerce.side-assistant.open.v1:demo%2Fsite");
  assert.equal(getKey({}, {agentsamInstallationId:"store-c"}),
    "agentsam.ecommerce.side-assistant.open.v1:store-c");
});

test("portable runtime does not use FNF branded UI state or home composer selectors", () => {
  for (const text of [
    js, read("js/home-workspace.js"), read("js/agent-composer-menu.js"),
    read("css/home-workspace.css"), read("css/agentsam.css"), read("home.html"),
  ]) {
    assert.equal(text.includes("fnf_agentsam_open"), false);
    assert.equal(text.includes("fnf-home-composer"), false);
  }
  assert.match(read("home.html"), /class="commerce-home-composer"/);
  assert.match(read("css/home-workspace.css"), /\.commerce-home-composer/);
  assert.match(read("css/agentsam.css"), /--te-accent/);
});
