import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  projectSideStageContribution,
  listAccountSideStages,
  normalizeCatalogSideStage,
} from "../backend/worker/plugin-side-stages.js";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE agentsam_plugins(
      id TEXT PRIMARY KEY DEFAULT ('plg_' || lower(hex(randomblob(8)))),
      plugin_key TEXT NOT NULL UNIQUE,
      family_key TEXT NOT NULL,
      provider_key TEXT NOT NULL,
      plugin_kind TEXT NOT NULL,
      category TEXT NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      transport TEXT NOT NULL,
      auth_type TEXT NOT NULL,
      capabilities_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
      icon_url TEXT,
      sort_priority INTEGER NOT NULL DEFAULT 50,
      composer_visible INTEGER NOT NULL DEFAULT 1,
      settings_visible INTEGER NOT NULL DEFAULT 1,
      health_strategy TEXT NOT NULL DEFAULT 'adapter'
    );
    CREATE TABLE agentsam_plugin_installations(
      id TEXT PRIMARY KEY DEFAULT ('pinst_' || lower(hex(randomblob(8)))),
      account_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL REFERENCES agentsam_plugins(id),
      instance_key TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
      setup_status TEXT NOT NULL DEFAULT 'unconfigured',
      health_status TEXT NOT NULL DEFAULT 'unknown',
      composer_visible INTEGER NOT NULL DEFAULT 1,
      settings_visible INTEGER NOT NULL DEFAULT 1,
      UNIQUE(account_id,plugin_id,instance_key)
    );
  `);
  sqlite.exec(readFileSync(new URL("../backend/migrations/1352_agentsam_side_stage_contributions.sql", import.meta.url), "utf8"));
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...args) {
          return {
            run: async () => statement.run(...args),
            all: async () => ({ results: statement.all(...args) }),
          };
        },
      };
    },
  };
  return { sqlite, db };
}

test("all existing side drawer tools are data-driven from plugin catalog", async () => {
  const { sqlite, db } = fixture();
  const stages = await listAccountSideStages(db, "auth_user_one");
  assert.deepEqual(stages.map(item => item.stageId), [
    "goal", "coworker", "browser", "files", "artifacts",
    "cad", "canvas", "media", "database", "cli",
  ]);
  assert.equal(stages.find(s => s.stageId === "canvas").tabKind, "design");
  assert.equal(stages.find(s => s.stageId === "cad").tabKind, "app");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM agentsam_plugin_installations").get().n, 10);
  // Lazy account defaults don't duplicate on refresh.
  await listAccountSideStages(db, "auth_user_one");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM agentsam_plugin_installations").get().n, 10);
});

test("disabling a core stage is account-scoped and leaves other users unchanged", async () => {
  const { sqlite, db } = fixture();
  await listAccountSideStages(db, "user_one");
  const id = sqlite.prepare("SELECT id FROM agentsam_plugins WHERE plugin_key='agentsam-stage-files'").get().id;
  sqlite.prepare("UPDATE agentsam_plugin_installations SET enabled=0 WHERE account_id=? AND plugin_id=?")
    .run("user_one", id);
  assert.equal((await listAccountSideStages(db, "user_one")).some(s => s.stageId === "files"), false);
  assert.equal((await listAccountSideStages(db, "user_two")).some(s => s.stageId === "files"), true);
});

test("optional plugins enter only with an active authorized installation", async () => {
  const { sqlite, db } = fixture();
  const sideStage = JSON.stringify({
    source: "https://catalog.example",
    side_stage: {
      version: 1, id: "studio", renderer: "embed",
      href: "https://catalog.example/studio", icon: "plug",
    },
  });
  sqlite.prepare(`INSERT INTO agentsam_plugins
    (plugin_key,family_key,provider_key,plugin_kind,category,display_name,
     transport,auth_type,metadata_json)
    VALUES ('addon-studio','connections','addon','mcp','design','Addon Studio',
    'remote_jsonrpc','oauth',?)`).run(sideStage);
  const id = sqlite.prepare("SELECT id FROM agentsam_plugins WHERE plugin_key='addon-studio'").get().id;
  assert.equal((await listAccountSideStages(db, "one")).some(s => s.id === "addon-studio"), false);
  sqlite.prepare(`INSERT INTO agentsam_plugin_installations
    (account_id,plugin_id,instance_key,enabled,setup_status)
    VALUES (?,?,?,?,?)`).run("one",id,"catalog-v1",1,"connected");
  const one = await listAccountSideStages(db, "one");
  assert.equal(one.find(s => s.id === "addon-studio").renderer, "embed");
  assert.equal(one.find(s => s.id === "addon-studio").href, "https://catalog.example/studio");
  assert.equal((await listAccountSideStages(db, "two")).some(s => s.id === "addon-studio"), false);
  sqlite.prepare("DELETE FROM agentsam_plugin_installations WHERE plugin_id=? AND instance_key='catalog-v1'")
    .run(id);
  assert.equal((await listAccountSideStages(db, "one")).some(s => s.id === "addon-studio"), false);
});

test("untrusted or malformed plugin stage manifests never become executable panels", () => {
  const row = {
    id:"plg_1234567890abcdef",plugin_key:"example-stage",family_key:"connections",
    plugin_kind:"mcp",display_name:"Untrusted",description:"",icon_url:null,
  };
  const stage = { version:1,id:"example",renderer:"embed",href:"https://different.example/stage" };
  assert.equal(projectSideStageContribution({
    ...row,metadata_json:JSON.stringify({source:"https://catalog.example",side_stage:stage}),
  }),null);
  assert.equal(projectSideStageContribution({
    ...row,metadata_json:JSON.stringify({source:"https://catalog.example",
      side_stage:{...stage,href:"javascript:alert(1)"}}),
  }),null);
  assert.equal(projectSideStageContribution({
    ...row,metadata_json:JSON.stringify({side_stage:{version:1,id:"example",
      renderer:"builtin",tab_kind:"terminal"}}),
  }),null);
});

test("missing authorization scope is rejected instead of falling back to a default user", async () => {
  const { db } = fixture();
  await assert.rejects(() => listAccountSideStages(db, ""), /account_required/);
});

test("trusted plugin catalog can declare a view without deploying a host component", () => {
  const source = "https://plugins.example/catalog/plugins";
  const stage = {version:1,id:"design",renderer:"embed",href:"https://plugins.example/views/design"};
  assert.deepEqual(normalizeCatalogSideStage(stage,source),
    {...stage,icon:"plug"});
  assert.equal(normalizeCatalogSideStage(undefined,source),null);
  assert.throws(()=>normalizeCatalogSideStage(
    {...stage,href:"https://untrusted.example/design"},source),
    /side_stage_url_invalid/);
  assert.throws(()=>normalizeCatalogSideStage(
    {...stage,href:"https://plugins.example/views/design?token=secret"},source),
    /side_stage_url_invalid/);
  assert.throws(()=>normalizeCatalogSideStage(
    {...stage,renderer:"builtin"},source),
    /side_stage_renderer_invalid/);
});
