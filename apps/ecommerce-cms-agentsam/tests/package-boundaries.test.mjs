import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { inspectPackageBoundaries } from "../bin/package-boundaries.mjs";

function fixture(fn) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ecommerce-boundaries-"));
  const app = path.join(temp, "app");
  fs.mkdirSync(path.join(app, "src"), { recursive: true });
  fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({}));
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


test("Ecommerce consumes the canonical Merch SDK instead of a nested source copy", () => {
  const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.dependencies["@inneranimalmedia/agentsam-merch"], "2.6.19");
  assert.equal(fs.existsSync(new URL("../packages/agentsam-merch", import.meta.url)), false);
  const backend = fs.readFileSync(new URL("../backend/admin/api.js", import.meta.url), "utf8");
  const media = fs.readFileSync(new URL("../backend/agentsam/media-tool-executors.js", import.meta.url), "utf8");
  const frontend = fs.readFileSync(new URL("../frontend/src/pages/products/StudioWorkspace.tsx", import.meta.url), "utf8");
  assert.match(backend, /@inneranimalmedia\/agentsam-merch\/product-spine/);
  assert.match(media, /from "@inneranimalmedia\/agentsam-merch"/);
  assert.match(media, /@inneranimalmedia\/agentsam-merch\/adapters\/completeful/);
  assert.match(frontend, /@inneranimalmedia\/agentsam-merch/);
  assert.doesNotMatch(backend + media + frontend, /packages\/agentsam-merch\/src/);
});


test("application-local Identity snapshot matches the upstream SDK package", () => {
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const localRoot = path.join(appRoot, "packages/agentsam-identity");
  const upstreamRoot = path.resolve(appRoot, "../../packages/identity");
  const localPackage = JSON.parse(fs.readFileSync(path.join(localRoot, "package.json"), "utf8"));
  const upstreamPackage = JSON.parse(fs.readFileSync(path.join(upstreamRoot, "package.json"), "utf8"));

  assert.equal(localPackage.name, "@inneranimalmedia/agentsam-identity");
  assert.equal(localPackage.version, upstreamPackage.version);
  for (const entry of [
    "./core/password-crypto",
    "./core/password-gate",
    "./frontend/auth-portal/store-access",
  ]) {
    assert.equal(localPackage.exports[entry], upstreamPackage.exports[entry], entry + " export drift");
  }
  for (const relative of [
    "src/core/password-crypto.js",
    "src/core/password-gate.js",
    "src/frontend/auth-portal/store-access.js",
  ]) {
    const local = fs.readFileSync(path.join(localRoot, relative));
    const upstream = fs.readFileSync(path.join(upstreamRoot, relative));
    const digest = (value) => createHash("sha256").update(value).digest("hex");
    assert.equal(digest(local), digest(upstream), relative + " must be copied from the pinned upstream package");
  }
});
