import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(app, "package.json"), "utf8"));
const publishedFiles = new Set(pkg.files ?? []);
const required = [
  "agentsam.app.json",
  "npm-shrinkwrap.json",
  "frontend/admin.surface.json",
  "frontend/shell.js",
  "frontend/inspector.js",
  "frontend/index.html",
  "backend/index.js",
  "backend/lib/route-manifest.js",
  "apps/registry.json",
  "cms",
  "db",
  "packages/commerce-analytics/package.json",
  "theme",
  "dist/assets/admin/_spa/index.html",
];
const parentDirectories = required.map((p) => p.replace(/\/$/, "").split("/")[0]);
test("full-stack source and generated assets are part of the release contract", () => {
  for (const dir of parentDirectories) {
    assert.ok(publishedFiles.has(dir + "/") || publishedFiles.has(dir),
      `Distribution allowlist excludes ${dir}`);
  }
  for (const f of required) {
    assert.ok(fs.existsSync(path.join(app, f)), `Missing required release file: ${f}`);
  }
  assert.equal(pkg.bin["agentsam-ecommerce"], "bin/ecommerce.mjs");
});
test("npm release list includes backend, frontend, modules, schemas, and built assets", () => {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: app, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 30000,
  });
  const manifest = JSON.parse(output)[0];
  const entries = manifest.files.map((f) => f.path);
  for (const f of required.filter((f) => f !== "cms" && f !== "db" && f !== "theme")) {
    assert.ok(entries.includes(f), `Not in tarball: ${f}`);
  }
  for (const prefix of ["cms/", "db/", "theme/", "tests/", "packages/"]) {
    assert.ok(entries.some((f) => f.startsWith(prefix)), `Missing tarball family: ${prefix}`);
  }
  const forbidden = entries.filter((f) =>
    /(^|\/)(?:node_modules|\.git|\.wrangler|\.env[^/]*|\.dev\.vars[^/]*|\.DS_Store)(?:\/|$)/i.test(f) ||
    /\.(?:sqlite|db|pem|key|p12)$/i.test(f));
  assert.deepEqual(forbidden, [], `Sensitive/unwanted paths in tarball: ${forbidden.join(", ")}`);
});


test("real npm archive doctors and scaffolds outside the monorepo", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentsam-ecommerce-release-"));
  try {
    const name = execFileSync("npm", ["pack", "--silent", "--ignore-scripts", "--pack-destination", tmp], {
      cwd: app, encoding: "utf8", timeout: 30000,
      // An outer npm pack --dry-run --json must not turn this real consumer
      // archive test into another dry-run or JSON listing.
      env: { ...process.env, npm_config_dry_run: 'false', npm_config_json: 'false' },
    }).trim().split("\n").pop();
    assert.ok(name?.endsWith(".tgz"), "npm did not produce an archive");
    const unpacked = path.join(tmp, "unpacked");
    fs.mkdirSync(unpacked);
    execFileSync("tar", ["-xzf", path.join(tmp, name), "-C", unpacked]);
    const executable = path.join(unpacked, "package", "bin", "ecommerce.mjs");
    const doctor = JSON.parse(execFileSync("node", [executable, "doctor"], {
      cwd: tmp, encoding: "utf8", timeout: 30000,
    }));
    assert.equal(doctor.source_ready, true, JSON.stringify(doctor.missing));
    assert.equal(doctor.package_boundary_ready, true, JSON.stringify(doctor.package_boundary_issues));
    const customer = path.join(tmp, "independent-customer");
    execFileSync("node", [executable, "scaffold", customer], {
      cwd: tmp, encoding: "utf8", timeout: 30000,
    });
    for (const f of [
      "frontend/admin.surface.json", "backend/index.js",
      "npm-shrinkwrap.json", "db/seed-customer-bootstrap.sql", "wrangler.toml",
    ]) {
      assert.ok(fs.existsSync(path.join(customer, f)), `Missing customer scaffold: ${f}`);
    }
    assert.match(fs.readFileSync(path.join(customer, "wrangler.toml"), "utf8"), /main = "backend\/index.js"/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
