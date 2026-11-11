import test from "node:test";
import assert from "node:assert/strict";
import { listLauncherApps } from "./apps-launcher.js";

function dbFor(rows) {
  const state = { query: "", accountId: "" };
  return {
    state,
    prepare(query) {
      state.query = query;
      return {
        bind(accountId) {
          state.accountId = accountId;
          return { all: async () => ({ results: rows }) };
        },
      };
    },
  };
}
const app = (surfaces, href, label = "Campaign") =>
  JSON.stringify({ app: { surfaces, nav: { href, label } } });

test("apps launcher uses account-scoped installations and distinct installed/enabled states", async () => {
  const db = dbFor([
    { plugin_key: "campaign", display_name: "Campaign", metadata_json: app(["admin-nav","add-apps"], "/admin/campaign"),
      installed: 1, enabled: 1, setup_status: "connected" },
    { plugin_key: "disabled", display_name: "Disabled", metadata_json: app(["admin-nav"], "/admin/disabled", "Disabled"),
      installed: 1, enabled: 0, setup_status: "unconfigured" },
    { plugin_key: "available", display_name: "Available", metadata_json: app(["add-apps"], "/admin/available", "Available"),
      installed: 0, enabled: 0, setup_status: null },
  ]);
  const apps = await listLauncherApps(db, "acct_123");
  assert.equal(db.state.accountId, "acct_123");
  assert.match(db.state.query, /i\.account_id = \?/);
  assert.match(db.state.query, /GROUP BY p\.id/);
  assert.deepEqual(apps.map(row => [row.key, row.installed, row.enabled]),
    [["campaign",true,true],["disabled",true,false],["available",false,false]]);
  assert.deepEqual(apps[0].surfaces, ["admin-nav","add-apps"]);
  assert.equal(apps[2].setup_status, "not_installed");
});

test("apps launcher ignores unsupported surfaces and unsafe metadata", async () => {
  const db = dbFor([
    { plugin_key:"bad-json", metadata_json:"{", installed:1,enabled:1 },
    { plugin_key:"no-surface", metadata_json:app(["storefront-widget"], "/admin/widget"), installed:1,enabled:1 },
    { plugin_key:"external",display_name:"External",metadata_json:app(["admin-nav"], "https://evil.example"),installed:1,enabled:1 },
    { plugin_key:"injection",display_name:"Injection",metadata_json:app(["admin-nav"], '/admin/foo" onclick="evil'),installed:1,enabled:1 },
  ]);
  const result = await listLauncherApps(db, "acct_123");
  assert.deepEqual(result.map(row => row.key), ["external","injection"]);
  assert.ok(result.every(row => row.href === null));
});

test("apps launcher requires an account and database instead of listing another tenant", async () => {
  await assert.rejects(() => listLauncherApps(null, "acct_123"), /apps_launcher_context_missing/);
  await assert.rejects(() => listLauncherApps(dbFor([]), ""), /apps_launcher_context_missing/);
});
