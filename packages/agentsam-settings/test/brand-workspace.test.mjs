import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = name => readFile(new URL(name, import.meta.url), "utf8");

test("brand plugin uses its own accessible multi-brand workspace, not the old JSON-only pane", async () => {
  const root = await read("../src/frontend/index.tsx");
  const brand = await read("../src/frontend/brand-workspace.tsx");
  assert.match(root, /<BrandPluginWorkspace data=\{data\}/);
  assert.doesNotMatch(root, /Brand identity and contract<\/h3>/);
  assert.match(brand, /Select brand identity/);
  assert.match(brand, /brand\.status === "approved"/);
  assert.match(brand, /No recorded brand identity/);
  assert.match(brand, /No verified/);
  assert.doesNotMatch(brand, /localStorage|sessionStorage|window\.fetch\(|new URL\("data:image/);
});

test("brand workspace sections are real navigation, with source-derived covers", async () => {
  const brand = await read("../src/frontend/brand-workspace.tsx");
  for (const label of ["Overview","Assets","Sources","Usage","Review"]) {
    assert.match(brand, new RegExp('label: "'+label+'"'));
  }
  assert.match(brand, /onClick=\{\(\) => setView\(item\.id\)\}/);
  assert.match(brand, /renderBrandCoverSvg/);
  assert.match(brand, /brandColors\(brand\.colors/);
  assert.match(brand, /No placeholder mark is generated/);
  assert.match(brand, /not a published asset/);
  assert.doesNotMatch(brand, /#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/i);
});

test("Settings bundle has a build-only Brand dependency, not a new app runtime", async () => {
  const manifest = JSON.parse(await read("../package.json"));
  assert.equal(manifest.devDependencies["@inneranimalmedia/agentsam-brand"], "2.6.18");
  assert.equal(manifest.dependencies?.["@inneranimalmedia/agentsam-brand"], undefined);
  assert.equal(manifest.peerDependencies?.["@inneranimalmedia/agentsam-brand"], undefined);
  assert.equal(manifest.devDependencies["@inneranimalmedia/agentsam-workbench"], "2.6.18");
  assert.equal(manifest.peerDependencies?.["@inneranimalmedia/agentsam-workbench"], undefined);
  assert.equal(manifest.peerDependencies["@inneranimalmedia/agentsam-contracts"], "2.6.18");
});
