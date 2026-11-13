import test from "node:test";
import assert from "node:assert/strict";
import { listLauncherApps, installNativeAdminApp } from "./apps-launcher.js";

function listDb(rows) {
  const state = { query: "", accountId: "" };
  return {
    state,
    prepare(query) {
      state.query = query;
      return { bind(accountId) { state.accountId = accountId; return { all: async () => ({ results: rows }) }; } };
    },
  };
}

test("apps launcher lists public applications with per-account installed/enabled state", async () => {
  const db = listDb([
    { id: "campaign", name: "Campaign", launch_url: "/admin/campaign", install_id: "ainst_1", enabled: 1 },
    { id: "disabled", name: "Disabled", launch_url: "/admin/disabled", install_id: "ainst_2", enabled: 0 },
    { id: "available", name: "Available", launch_url: "/admin/available", install_id: null, enabled: null },
  ]);
  const apps = await listLauncherApps(db, "acct_123");
  assert.equal(db.state.accountId, "acct_123");
  assert.match(db.state.query, /i\.account_id = \?/);
  assert.match(db.state.query, /a\.app_type = 'application'/);
  assert.match(db.state.query, /a\.status = 'active'/);
  assert.match(db.state.query, /a\.visibility = 'public'/);
  assert.deepEqual(
    apps.map(row => [row.key, row.installed, row.enabled, row.setup_status]),
    [["campaign", true, true, "configured"], ["disabled", true, false, "disabled"], ["available", false, false, "not_installed"]],
  );
  assert.deepEqual(apps[0].surfaces, ["admin-nav"]);
});

test("apps launcher never exposes unsafe launch urls", async () => {
  const db = listDb([
    { id: "external", name: "External", launch_url: "https://evil.example" },
    { id: "protocol-relative", name: "Protocol relative", launch_url: "//evil.example" },
    { id: "injection", name: "Injection", launch_url: '/admin/foo" onclick="evil' },
    { id: "none", name: "None", launch_url: null },
  ]);
  const result = await listLauncherApps(db, "acct_123");
  assert.equal(result.length, 4);
  assert.ok(result.every(row => row.href === null && row.installable === false));
});

test("apps launcher requires an account and database instead of listing another tenant", async () => {
  await assert.rejects(() => listLauncherApps(null, "acct_123"), /apps_launcher_context_missing/);
  await assert.rejects(() => listLauncherApps(listDb([]), ""), /apps_launcher_context_missing/);
});

function installDb(apps) {
  const reads = [];
  const writes = [];
  return {
    reads, writes,
    prepare(query) {
      return {
        bind(...args) {
          return {
            async first() {
              if (!query.startsWith("SELECT id, launch_url FROM apps")) throw Error("unexpected_read:" + query);
              reads.push({ query, args });
              return apps.find(row => row.id === args[0]) || null;
            },
            async run() { writes.push({ query, args }); return { meta: { changes: 1 } }; },
          };
        },
      };
    },
  };
}

test("install is account scoped, only reads public active applications, and is idempotent in SQL", async () => {
  const db = installDb([{ id: "cad", launch_url: "/cad" }]);
  const result = await installNativeAdminApp(db, "acct_a", "cad");
  assert.deepEqual(result, { key: "cad", installed: true, enabled: true, href: "/cad", status: "installed" });
  assert.match(db.reads[0].query, /status = 'active' AND visibility = 'public'/);
  assert.deepEqual(db.writes[0].args, ["acct_a", "cad"]);
  assert.match(db.writes[0].query, /ON CONFLICT\(account_id, app_id\)/);
});

test("install rejects unknown apps, apps without a safe launch url, bad keys and missing context", async () => {
  const db = installDb([{ id: "ext", launch_url: "https://evil.example/" }, { id: "bare", launch_url: null }]);
  for (const key of ["unknown", "ext", "bare"]) {
    await assert.rejects(() => installNativeAdminApp(db, "acct_a", key), /app_install_unavailable/);
  }
  await assert.rejects(() => installNativeAdminApp(db, "acct_a", "../bad"), /app_install_key_invalid/);
  await assert.rejects(() => installNativeAdminApp(db, "", "cad"), /apps_launcher_context_missing/);
  assert.equal(db.writes.length, 0);
});
