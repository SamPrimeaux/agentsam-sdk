import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectPackageBoundaries } from "../bin/package-boundaries.mjs";

function fixture(fn) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ecommerce-boundaries-"));
  const app = path.join(temp, "app");
  fs.mkdirSync(path.join(app, "src"), { recursive: true });
  try { fn(app, temp); } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
test("allows a self-contained local app and package", () => fixture((app) => {
  fs.mkdirSync(path.join(app, "packages", "ok"), { recursive: true });
  fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({ dependencies: { ok: "file:packages/ok" }}));
  fs.writeFileSync(path.join(app, "src", "index.js"), 'import "./local.js";');
  fs.writeFileSync(path.join(app, "src", "local.js"), 'export const ok = true;');
  const result = inspectPackageBoundaries(app);
  assert.equal(result.boundary_ready, true);
  assert.equal(result.scanned_manifests, 1);
}));
test("rejects source imports escaping the installable app root", () => fixture((app) => {
  fs.writeFileSync(path.join(app, "src", "index.tsx"), 'import x from "../../../packages/agentsam-merch/src/index.js";');
  const result = inspectPackageBoundaries(app);
  assert.equal(result.boundary_ready, false);
  assert.equal(result.issues[0].kind, "escaping_import");
}));
test("rejects file dependency pointing outside installation", () => fixture((app) => {
  fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({ dependencies: { analytics: "file:../../packages/analytics" }}));
  assert.ok(inspectPackageBoundaries(app).issues.some((x) => x.kind === "external_dependency"));
}));
test("flags workspace resolution and symlink escapes as unverified", () => fixture((app, temp) => {
  fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({ dependencies: { local: "workspace:*" }}));
  fs.writeFileSync(path.join(temp, "external.js"), "export default 1;");
  fs.symlinkSync(path.join(temp, "external.js"), path.join(app, "src", "outside.js"));
  const kinds = inspectPackageBoundaries(app).issues.map((x) => x.kind);
  assert.ok(kinds.includes("workspace_resolution_unverified"));
  assert.ok(kinds.includes("external_symlink"));
}));

test("allows web-root imports but rejects developer-machine paths", () => fixture((app) => {
  fs.writeFileSync(path.join(app, "src", "web.js"), 'import "/theme-assets/revise/runtime/enhance.js";');
  assert.equal(inspectPackageBoundaries(app).boundary_ready, true);
  fs.writeFileSync(path.join(app, "src", "local.js"), 'import "/Users/samprimeaux/external.js";');
  assert.ok(inspectPackageBoundaries(app).issues.some((x) => x.kind === "absolute_import"));
}));
