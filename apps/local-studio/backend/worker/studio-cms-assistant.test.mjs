import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { runStudioCmsAssistant } from "./studio-cms-assistant.js";
import { resolveSelectedResource } from "../../../ecommerce-cms-agentsam/backend/agentsam/selected-resource.js";
import { withApplicationAccount } from "../../../ecommerce-cms-agentsam/backend/lib/account-context.js";
import { readAgentSamReply } from "../../../ecommerce-cms-agentsam/frontend/static/js/agentsam-response.mjs";

test("hosted editor uses Studio ask mode, retains a bounded history and retries unavailable candidates", async () => {
  const calls = [];
  const reply = await runStudioCmsAssistant({
    message: "Rewrite the title", selection: { id: "hero", page: "/" },
    history: [{ role: "assistant", content: "Previous reply" }], attachments: [],
  }, {
    workersAI: true,
    getInventory: () => { throw new Error("Worker binding should use its curated inventory"); },
    sendChat(body) {
      calls.push(body);
      return calls.length === 1 ? Response.json({ error: "unavailable" }, { status: 503 }) : new Response("A new title");
    },
  });
  assert.equal(reply.reply, "A new title");
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].model_id, calls[1].model_id);
  assert.equal(calls[0].run_mode, "ask");
  assert.match(calls[0].messages.at(-1).content, /Selected editor context: .*hero/);
  assert.equal(calls[0].messages[0].content, "Previous reply");
});

test("hosted image requests only select an eligible vision model", async () => {
  const result = await runStudioCmsAssistant({
    message: "Extract this palette", history: [], selection: null,
    attachments: [{ kind: "image", mime_type: "image/png", image_base64: "YWJj", size_bytes: 3 }],
  }, {
    workersAI: true,
    getInventory: () => [
      { provider: "openai", model_id: "text", chat_eligible: true },
      { provider: "openai", model_id: "vision", chat_eligible: true, capabilities: { vision: true } },
    ],
    sendChat(body) {
      assert.equal(body.model_id, "vision");
      assert.equal(body.messages[0].images[0].dataUrl, "data:image/png;base64,YWJj");
      return new Response("Replies with a palette");
    },
  });
  assert.equal(result.ok, true);
});

test("CMS selection is bound to the verified account and selected site when slugs repeat", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE accounts (id TEXT PRIMARY KEY, status TEXT);
      CREATE TABLE cms_sites (id TEXT PRIMARY KEY, account_id TEXT, name TEXT, slug TEXT, primary_domain TEXT, status TEXT, is_default INTEGER);
      CREATE TABLE cms_pages (id TEXT PRIMARY KEY, site_id TEXT NOT NULL, route_path TEXT, slug TEXT);
      CREATE TABLE cms_page_sections (id TEXT PRIMARY KEY, page_id TEXT NOT NULL, section_key TEXT, section_type TEXT, definition_id TEXT, template_sku TEXT);
      CREATE TABLE cms_section_blocks (id TEXT PRIMARY KEY, account_id TEXT, section_id TEXT, block_key TEXT, block_type TEXT, parent_block_id TEXT, definition_id TEXT, template_sku TEXT);
      CREATE TABLE cms_definitions (id TEXT PRIMARY KEY, account_id TEXT, definition_key TEXT, kind TEXT, version TEXT, label TEXT, status TEXT, origin TEXT, settings_schema_json TEXT, allowed_blocks_json TEXT, max_blocks INTEGER);
      CREATE TABLE cms_components (definition_id TEXT, renderer_key TEXT, implementation_status TEXT);
      CREATE TABLE cms_component_templates (sku TEXT PRIMARY KEY, template_name TEXT, item_type TEXT, status TEXT, editor_schema_json TEXT, data_bindings_json TEXT, is_system INTEGER);
      INSERT INTO accounts VALUES ('me','active'), ('other','active');
      INSERT INTO cms_sites VALUES ('one','me','One','one',NULL,'active',1), ('two','me','Two','two',NULL,'active',0), ('three','other','Three','three',NULL,'active',1);
      INSERT INTO cms_pages VALUES ('p1','one','/','home'), ('p2','two','/','home'), ('p3','three','/','home');
      INSERT INTO cms_page_sections VALUES
        ('s1','p1','hero','hero',NULL,NULL),
        ('s2','p2','hero','hero','ds',NULL),
        ('s3','p3','hero','hero',NULL,NULL);
      INSERT INTO cms_section_blocks VALUES
        ('b1','me','s1','buy','button',NULL,'db',NULL),
        ('b2','me','s2','buy','button',NULL,'db','stock/button'),
        ('b3','other','s3','buy','button',NULL,NULL,NULL),
        ('b4','me','s2','nested','link','b2','db',NULL);
      INSERT INTO cms_definitions VALUES
        ('ds','me','hero','section','2','Hero','active','package','{"title":{"type":"text"}}','["button"]',12),
        ('db','me','button','block','1','Button','active','package','{"label":{"type":"text","label":"Button label"}}','[]',0);
      INSERT INTO cms_components VALUES ('ds','theme:hero','verified'),('db','theme:button','verified');
      INSERT INTO cms_component_templates VALUES ('stock/button','Button','block','active','{"label":{"type":"text"}}','{"label":{}}',1);
    `);
    const env = { DB: { prepare: sql => ({ bind: (...args) => ({ first: async () => db.prepare(sql).get(...args) }) }) } };
    const selection = { type: "section", surface: "theme-studio", id: "hero", page: "/" };
    await withApplicationAccount(env, "me", async () => {
      assert.equal((await resolveSelectedResource(env, { ...selection, site_id: "two" })).id, "s2");
      assert.equal((await resolveSelectedResource(env, { ...selection, id: "s2", site_id: "two" })).key, "hero");
      await assert.rejects(() => resolveSelectedResource(env, selection), /cms_assistant_site_required/);
      await assert.rejects(() => resolveSelectedResource(env, { ...selection, site_id: "three" }), /cms_site_not_found/);
      const section = await resolveSelectedResource(env,{...selection,site_id:"two"});
      assert.equal(section.definition.key,"hero");
      assert.equal(section.definition.version,"2");
      assert.equal(section.renderer.verified,true);
      const block = await resolveSelectedResource(env,{
        type:"block",surface:"theme-studio",site_id:"two",page:"/",
        section_key:"hero",id:"buy",label:"Buy now"
      });
      assert.equal(block.id,"b2");
      assert.equal(block.section.id,"s2");
      assert.equal(block.definition.kind,"block");
      assert.equal(block.definition.fields[0].key,"label");
      assert.equal(block.template.sku,"stock/button");
      assert.equal(block.renderer.key,"theme:button");
      const child = await resolveSelectedResource(env,{
        type:"block",surface:"theme-studio",site_id:"two",page:"/",
        section_key:"s2",id:"nested"
      });
      assert.equal(child.parentBlockId,"b2");
      await assert.rejects(() => resolveSelectedResource(env,{
        type:"block",surface:"theme-studio",site_id:"two",page:"/",
        section_key:"hero",id:"b1"
      }),/Selected block does not belong/);
      await assert.rejects(() => resolveSelectedResource(env,{
        type:"block",surface:"theme-studio",site_id:"three",page:"/",
        section_key:"hero",id:"b3"
      }),/cms_site_not_found/);
    });
    db.exec("PRAGMA foreign_keys = ON");
    const shareMigration = readFileSync(new URL("../migrations/1351_agentsam_conversation_shares.sql", import.meta.url), "utf8");
    const assistantMigration = readFileSync(new URL("../migrations/1373_cms_editor_assistant_storage.sql", import.meta.url), "utf8");
    const sessionMigration = readFileSync(new URL("../migrations/1377_agentsam_chat_session_share_contract.sql", import.meta.url), "utf8");
    db.exec(shareMigration);
    db.exec(assistantMigration);
    db.exec(assistantMigration);
    db.exec(`INSERT INTO agentsam_conversations (id,account_id,title,source) VALUES ('c','other','Private','admin_agentsam');`);
    db.exec(sessionMigration);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='agentsam_conversations'").get().n, 0);
    assert.equal(db.prepare("SELECT account_id FROM agentsam_chat_sessions WHERE conversation_id='c'").get().account_id, "other");
    assert.throws(() => db.exec(`INSERT INTO agentsam_attachments
      (id,account_id,conversation_id,file_name,mime_type,file_size_bytes,r2_key,preview_url)
      VALUES ('a','me','c','file','text/plain',4,'key','url');`), /FOREIGN KEY/);
  } finally { db.close(); }
});

test("HTML responses and authorization failures leave a usable composer error", async () => {
  await assert.rejects(readAgentSamReply(new Response("<!doctype html>", { headers: { "content-type": "text/html" } })), /ready to retry/);
  await assert.rejects(readAgentSamReply(Response.json({ error: "Unauthorized" }, { status: 401 })), /Check your sign-in/);
  assert.equal((await readAgentSamReply(Response.json({ reply: "OK" }))).reply, "OK");
});
