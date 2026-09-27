#!/usr/bin/env node
/**
 * Smoke: local-content-bridge status + import + list + read + grant roundtrip.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(new URL("./local-content-bridge.mjs", import.meta.url));
const repoRoot = path.resolve(path.dirname(script), "../../..");

function run(payload) {
  const res = spawnSync("node", [script], {
    cwd: repoRoot,
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
  const raw = (res.stdout || "").trim() || (res.stderr || "").trim();
  let json;
  try {
    json = JSON.parse(raw || "{}");
  } catch {
    throw new Error(`bridge_parse_failed:${raw}`);
  }
  if (res.status !== 0 || json.ok === false) {
    throw new Error(json.error || `bridge_exit_${res.status}`);
  }
  return json;
}

test("local-content-bridge status is available", () => {
  const status = run({ op: "status", cwd: repoRoot });
  assert.equal(status.availability, "available");
  assert.ok(status.machineId);
  assert.equal(status.watchSupported, false);
  assert.equal(status.nativeFs, false);
  assert.equal(status.browserDevBridge, true);
});

test("local-content-bridge import/list/read roundtrip", () => {
  const name = `bridge-smoke-${Date.now()}.txt`;
  const data = Buffer.from("hello-content-bridge").toString("base64");
  const imported = run({
    op: "import_bytes",
    cwd: repoRoot,
    name,
    encoding: "base64",
    data,
  });
  assert.ok(imported.ref);
  assert.equal(imported.bytes, 20);

  const listed = run({
    op: "list",
    cwd: repoRoot,
    path: ".agentsam/content-library",
  });
  assert.ok(Array.isArray(listed.entries));
  assert.ok(listed.entries.some((e) => e.ref === imported.ref || e.name === name));

  const read = run({ op: "read", cwd: repoRoot, ref: imported.ref });
  assert.equal(read.encoding, "base64");
  assert.equal(Buffer.from(read.data, "base64").toString("utf8"), "hello-content-bridge");

  // cleanup
  const abs = path.join(repoRoot, imported.ref);
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
});

test("local-content-bridge grant_directory browse in place without copy", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentsam-grant-"));
  const sample = path.join(tmp, "sample.txt");
  fs.writeFileSync(sample, "grant-browse");

  const granted = run({
    op: "grant_directory",
    cwd: repoRoot,
    abs_path: tmp,
  });
  assert.ok(String(granted.ref).startsWith("localdir_"));
  assert.equal(granted.copied, false);

  const listed = run({ op: "list", cwd: repoRoot, ref: granted.ref });
  assert.ok(Array.isArray(listed.entries));
  const hit = listed.entries.find((e) => e.name === "sample.txt");
  assert.ok(hit, "expected sample.txt under granted dir");
  assert.ok(String(hit.ref).startsWith("localref_"));

  const read = run({ op: "read", cwd: repoRoot, ref: hit.ref });
  assert.equal(Buffer.from(read.data, "base64").toString("utf8"), "grant-browse");

  // Original still in place (not copied into library yet)
  assert.equal(fs.readFileSync(sample, "utf8"), "grant-browse");

  const imported = run({ op: "import_to_library", cwd: repoRoot, ref: hit.ref });
  assert.equal(imported.copied, true);
  assert.ok(imported.ref);

  const abs = path.join(repoRoot, imported.ref);
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
  fs.rmSync(tmp, { recursive: true, force: true });
});
