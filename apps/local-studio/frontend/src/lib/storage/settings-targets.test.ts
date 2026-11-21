import test from "node:test";
import assert from "node:assert/strict";
import { projectSettingsStorageTargets } from "./settings-targets.ts";

const byId = (targets: ReturnType<typeof projectSettingsStorageTargets>, id: string) => targets.find(t => t.id === id)!;

test("Cloudflare storage targets reflect the provider's observed statuses", () => {
  const targets = projectSettingsStorageTargets(true, {
    ok: true, status: "partial", account: { id: "cf-test" },
    r2: { status: "connected", available: true, count: 17, truncated: true },
    images: { status: "needs_scope", available: false, count: 0 },
    stream: { status: "empty", available: true, count: 0 },
  });
  assert.equal(byId(targets, "cloudflare-r2").status, "healthy");
  assert.match(byId(targets, "cloudflare-r2").detail, /17 buckets.*more pages/);
  assert.equal(byId(targets, "cloudflare-images").status, "attention");
  assert.match(byId(targets, "cloudflare-images").detail, /lacks this service permission/);
  assert.equal(byId(targets, "cloudflare-stream").status, "healthy");
  assert.match(byId(targets, "cloudflare-stream").detail, /0 videos/);
});

test("Disconnected and unverified storage is never displayed as healthy", () => {
  const unreachable = projectSettingsStorageTargets(false, null);
  assert.equal(byId(unreachable, "cloudflare-r2").status, "unknown");
  const disconnected = projectSettingsStorageTargets(true, { ok: true, status: "not_connected", account: null });
  assert.equal(byId(disconnected, "cloudflare-r2").status, "attention");
  const failed = projectSettingsStorageTargets(true, {
    ok: true, status: "error", account: { id: "cf-test" },
    r2: { status: "error", available: false, count: 0 },
  });
  assert.equal(byId(failed, "cloudflare-r2").status, "unknown");
  assert.doesNotMatch(byId(failed, "cloudflare-r2").detail, /0 buckets/);
});

test("a service the grant lacks offers a one-click permission grant that returns to Storage settings", () => {
  const targets = projectSettingsStorageTargets(true, {
    ok: true, status: "partial", account: { id: "cf-test" },
    r2: { status: "connected", available: true, count: 3 },
    images: { status: "needs_scope", available: false, count: 0 },
    stream: { status: "needs_scope", available: false, count: 0 },
  });
  const images = targets.find(t => t.id === "cloudflare-images")!;
  assert.equal(images.actionLabel, "Grant Photos permission");
  assert.match(images.actionHref!, /\/api\/connections\/cloudflare\/start\?capabilities=cloudflare\.images&return_to=%2Fadmin%2Fsettings%2Fstorage$/);
  assert.equal(targets.find(t => t.id === "cloudflare-stream")!.actionLabel, "Grant Video permission");
  assert.equal(targets.find(t => t.id === "cloudflare-r2")!.actionLabel, "Manage connection");
  const disconnected = projectSettingsStorageTargets(true, { ok: true, status: "not_connected", account: null });
  const r2 = disconnected.find(t => t.id === "cloudflare-r2")!;
  assert.equal(r2.actionLabel, "Connect Cloudflare");
  assert.match(r2.actionHref!, /packs=media,data&return_to=%2Fadmin%2Fsettings%2Fstorage$/);
});
