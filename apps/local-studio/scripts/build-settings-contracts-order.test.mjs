import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const scripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;

test("clean Local Studio builds contracts before IDE, Workbench and Settings consumers", () => {
  const build = scripts["build:settings"];
  const contracts = build.indexOf("npm --prefix ../../packages/agentsam-contracts run build");
  const ide = build.indexOf("npm run build:ide");
  const workbench = build.indexOf("npm --prefix ../../packages/agentsam-workbench run build");
  const settings = build.indexOf("npm --prefix ../../packages/agentsam-settings run build");
  assert.ok(contracts >= 0 && contracts < ide && contracts < workbench && contracts < settings);
});

test("hosted Worker build still enters the canonical build:settings pipeline", () => {
  assert.match(scripts.build, /npm run build:settings/);
  assert.match(scripts["cf:build"], /npm run build/);
});
