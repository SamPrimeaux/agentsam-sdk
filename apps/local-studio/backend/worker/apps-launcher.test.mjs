import test from "node:test";
import assert from "node:assert/strict";
import { listLauncherApps, listInstalledNavigationPlugins, installNativeAdminApp } from "./apps-launcher.js";

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
    [["campaign", true, true, "screen_unregistered"], ["disabled", true, false, "disabled"], ["available", false, false, "not_installed"]],
  );
  assert.deepEqual(apps[0].surfaces, []);
  assert.equal(apps[0].screen_status, "manifest_missing");
});

test("app screens are exposed only when package manifest and catalog screen bindings agree", async () => {
  const manifestCatalog = [{
    id: "cad-creator", version: "2.6.18",
    screens: [
      { id: "cad-creator.workspace", route: "/admin/cad", navigation: { surface: "admin-nav", label: "CAD Creator" }, mount: { type: "host-component" } },
      { id: "cad-creator.assets", route: "/admin/cad/assets", navigation: { surface: "admin-nav", label: "CAD Assets" }, mount: { type: "host-component" } },
    ],
  }];
  const db = listDb([{
    id: "cad-creator", name: "CAD Creator", launch_url: "/admin/old-cad", editor_url: "/cad-creator/",
    config_json: JSON.stringify({ runtime: { manifest_id: "cad-creator", screen_ids: ["cad-creator.workspace", "cad-creator.assets"] } }),
    install_id: "ainst_cad", enabled: 1,
    install_config_json: JSON.stringify({ runtime: { disabled_screen_ids: ["cad-creator.assets"] } }),
  }]);
  const [app] = await listLauncherApps(db, "acct_123", manifestCatalog);
  assert.equal(app.href, "/admin/cad");
  assert.equal(app.screen_status, "registered");
  assert.deepEqual(app.screens.map(screen => screen.id), ["cad-creator.workspace"]);
  assert.deepEqual(app.surfaces, ["admin-nav"]);
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

test("installed plugin screens resolve from the existing plugin installation config", async () => {
  const manifestCatalog = [{
    id: "ecommerce-cms-agentsam", version: "2.6.18",
    screens: [{
      id: "growth.workspace", app_id: "agentsam-app-growth", route: "/admin/growth",
      navigation: { surface: "channels", parent: "audience", label: "Growth", icon: "chart-no-axes-combined" },
      mount: { type: "document", path: "/admin/growth" },
    }],
  }];
  const rows = [{
    plugin_key: "agentsam-app-growth", display_name: "Growth", description: "Audience growth tools",
    icon_url: null,
    metadata_json: JSON.stringify({ app: { nav: { label: "Growth", href: "/admin/growth", icon: "chart" }, surfaces: ["admin-nav"] } }),
    enabled: 1, setup_status: "configured",
    config_json: JSON.stringify({ runtime: { manifest_id: "ecommerce-cms-agentsam", screen_ids: ["growth.workspace"] } }),
    instance_key: "default", updated_at: 100,
  }];
  const db = {
    prepare(query) {
      assert.match(query, /agentsam_plugin_installations/);
      return { bind(accountId) { assert.equal(accountId, "acct_123"); return { all: async () => ({ results: rows }) }; } };
    },
  };
  const plugins = await listInstalledNavigationPlugins(db, "acct_123", manifestCatalog, []);
  assert.equal(plugins.length, 1);
  assert.equal(plugins[0].key, "agentsam-app-growth");
  assert.equal(plugins[0].href, "/admin/growth");
  assert.deepEqual(plugins[0].surfaces, ["channels"]);
  assert.deepEqual(plugins[0].screens.map(screen => screen.id), ["growth.workspace"]);
  assert.equal(plugins[0].screen_status, "registered");
});
