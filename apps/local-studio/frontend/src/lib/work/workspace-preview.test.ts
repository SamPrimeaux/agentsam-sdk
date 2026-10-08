import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkspacePreview } from "./workspace-preview.ts";

test("HTML preview resolves sibling CSS and JS without publishing anything", () => {
  const file = {
    path: "site/index.html",
    content: '<!doctype html><link rel="stylesheet" href="./styles.css"><script src="./src/app.js"></script><main>Hello</main>',
  };
  const html = buildWorkspacePreview(file, [
    file,
    { path: "site/styles.css", content: "body { color: purple; }" },
    { path: "site/src/app.js", content: "document.body.dataset.ready = 'yes';" },
  ]);
  assert.match(html, /<style data-agentsam-source="site\/styles\.css">body/);
  assert.match(html, /color: purple/);
  assert.match(html, /<script data-agentsam-source="site\/src\/app\.js">/);
  assert.doesNotMatch(html, /href="\.\/styles\.css"/);
});

test("HTML preview leaves unrelated external styles unchanged", () => {
  const file = { path: "index.html", content: '<link rel="stylesheet" href="https://example.com/a.css">' };
  assert.equal(buildWorkspacePreview(file, [file]), file.content);
});
