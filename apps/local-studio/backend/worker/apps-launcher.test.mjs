import test from "node:test";
import assert from "node:assert/strict";
import { listLauncherApps, installNativeAdminApp } from "./apps-launcher.js";

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


function installDb(definitions) {
  const installed = new Map();
  const tracked = [];
  return {
    installed, tracked,
    prepare(query) {
      return {
        bind(...args) {
          return {
            async first() {
              if (query.startsWith("SELECT id, plugin_key")) return definitions.find(row=>row.plugin_key===args[0]) || null;
              if (query.startsWith("SELECT id,enabled")) return installed.get(args[0]+":"+args[1]) || null;
              throw Error("unexpected_read:"+query);
            },
            async run() {
              if (!query.startsWith("INSERT OR IGNORE INTO agentsam_plugin_installations")) throw Error("unexpected_write");
              tracked.push({query,args});
              const key=args[0]+":"+args[1];
              if (!installed.has(key)) installed.set(key,{id:"pinst_1",enabled:1,setup_status:"configured"});
              return {success:true};
            },
          };
        },
      };
    },
  };
}

test("native app installation is account scoped, idempotent and uses the existing plugin manifest", async () => {
  const db=installDb([{
    id:"plg_cad",plugin_key:"agentsam-stage-cad",plugin_kind:"native",
    metadata_json:app(["admin-nav","side-stage"],"/cad","CAD Creator"),
  }]);
  const first=await installNativeAdminApp(db,"acct_alice","agentsam-stage-cad");
  assert.deepEqual(first,{key:"agentsam-stage-cad",installed:true,enabled:true,href:"/cad",status:"installed"});
  assert.equal(db.tracked.length,1);
  assert.deepEqual(db.tracked[0].args,["acct_alice","plg_cad"]);
  assert.match(db.tracked[0].query,/INSERT OR IGNORE/);
  await installNativeAdminApp(db,"acct_alice","agentsam-stage-cad");
  assert.equal(db.installed.size,1);
  await installNativeAdminApp(db,"acct_bob","agentsam-stage-cad");
  assert.equal(db.installed.size,2);
});

test("app installs preserve disabled preferences and reject plugin, embed, unsafe and absent manifests", async () => {
  const db=installDb([
    {id:"plg_cad",plugin_key:"cad",plugin_kind:"native",metadata_json:app(["admin-nav"],"/cad")},
    {id:"plg_mcp",plugin_key:"mcp",plugin_kind:"mcp",metadata_json:app(["admin-nav"],"/mcp")},
    {id:"plg_embed",plugin_key:"embed",plugin_kind:"native",metadata_json:app(["storefront_embed"],"/admin/embed")},
    {id:"plg_ext",plugin_key:"ext",plugin_kind:"native",metadata_json:app(["admin-nav"],"https://evil.example/")},
    {id:"plg_bad",plugin_key:"bad",plugin_kind:"native",metadata_json:"{"},
  ]);
  db.installed.set("acct_a:plg_cad",{id:"pinst_existing",enabled:0,setup_status:"disabled"});
  const disabled=await installNativeAdminApp(db,"acct_a","cad");
  assert.equal(disabled.enabled,false);
  assert.equal(disabled.status,"disabled");
  for (const key of ["mcp","embed","ext","bad"])
    await assert.rejects(()=>installNativeAdminApp(db,"acct_a",key),/app_install_not_supported/);
  await assert.rejects(()=>installNativeAdminApp(db,"acct_a","unknown"),/app_install_not_found/);
  await assert.rejects(()=>installNativeAdminApp(db,"acct_a","../bad"),/app_install_key_invalid/);
  await assert.rejects(()=>installNativeAdminApp(db,"","cad"),/apps_launcher_context_missing/);
});
