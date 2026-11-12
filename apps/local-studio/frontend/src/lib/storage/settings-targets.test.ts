import test from "node:test";
import assert from "node:assert/strict";
import { projectSettingsStorageTargets } from "./settings-targets.ts";

test("Cloudflare storage targets reflect the provider's observed statuses", () => {
  const targets = projectSettingsStorageTargets(true, {
    ok: true, status: "partial", account: { id: "cf-test" },
    r2: { status: "connected", available: true, count: 17, truncated: true },
    images: { status: "needs_scope", available: false, count: 0 },
    stream: { status: "empty", available: true, count: 0 },
  });
  assert.equal(targets.length, 4);
  assert.equal(targets[0].status, "unknown");
  assert.equal(targets[1].status, "healthy");
  assert.match(targets[1].detail, /17 buckets.*more pages/);
  assert.equal(targets[2].status, "attention");
  assert.match(targets[2].detail, /lacks this provider permission/);
  assert.equal(targets[3].status, "healthy");
  assert.match(targets[3].detail, /0 videos/);
});

test("Disconnected and unverified storage is never displayed as healthy", () => {
  const unreachable = projectSettingsStorageTargets(false, null);
  assert.equal(unreachable[0].status, "attention");
  assert.equal(unreachable[1].status, "unknown");
  const disconnected = projectSettingsStorageTargets(true, {
    ok: true, status: "not_connected", account: null,
  });
  assert.equal(disconnected[1].status, "attention");
  const failed = projectSettingsStorageTargets(true, {
    ok: true, status: "error", account: { id: "cf-test" },
    r2: { status: "error", available: false, count: 0 },
  });
  assert.equal(failed[1].status, "unknown");
  assert.doesNotMatch(failed[1].detail, /0 buckets/);
});
