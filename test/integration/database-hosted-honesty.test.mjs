import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("listSources prefers oauth catalog and annotates deployment bindings", () => {
  const src = readFileSync(
    path.join(root, "apps/local-studio/backend/worker/database-service.js"),
    "utf8",
  );
  assert.match(src, /source_kind: 'oauth_resource'/);
  assert.match(src, /source_kind: 'deployment_binding'/);
  assert.match(src, /owner_scope: 'deployment'/);
  assert.match(src, /\.\.\.oauthD1,\s*\n\s*\.\.\.deploymentSources/s);
  assert.match(src, /isOpaqueBindingDatabaseId/);
  assert.match(src, /Never treat env\.DB as a generic user's Cloudflare catalog/);
});

test("local sqlite bridge hard-fails on hosted Worker runtime", () => {
  const src = readFileSync(
    path.join(root, "apps/local-studio/frontend/src/routes/api/database.local.bridge.ts"),
    "utf8",
  );
  assert.match(src, /requires_local_runtime/);
  assert.match(src, /isHostedWorkerRuntime/);
  assert.match(src, /WebSocketPair/);
  assert.match(src, /status: 501/);
});

test("database editor preserves null metrics and uses host font tokens", () => {
  const app = readFileSync(
    path.join(root, "packages/agentsam-database-editor/src/ui/DatabaseEditorApp.tsx"),
    "utf8",
  );
  const css = readFileSync(
    path.join(root, "packages/agentsam-database-editor/src/ui/database-editor.css"),
    "utf8",
  );
  assert.doesNotMatch(app, /Number\(point\.queries \|\| 0\)/);
  assert.match(app, /numOrNull/);
  assert.match(app, /data-metrics-wired/);
  assert.match(css, /var\(--font-sans/);
  assert.match(css, /var\(--font-mono/);
  assert.match(css, /data-provider="cloudflare"/);
  assert.match(css, /data-provider="supabase"/);
});
