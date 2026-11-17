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
      CREATE TABLE cms_pages (id TEXT PRIMARY KEY, site_id TEXT, account_id TEXT, route_path TEXT, slug TEXT);
      CREATE TABLE cms_page_sections (id TEXT PRIMARY KEY, account_id TEXT, page_id TEXT, section_key TEXT);
      INSERT INTO accounts VALUES ('me','active'), ('other','active');
      INSERT INTO cms_sites VALUES ('one','me','One','one',NULL,'active',1), ('two','me','Two','two',NULL,'active',0), ('three','other','Three','three',NULL,'active',1);
      INSERT INTO cms_pages VALUES ('p1','one','me','/','home'), ('p2','two','me','/','home'), ('p3','three','other','/','home');
      INSERT INTO cms_page_sections VALUES ('s1','me','p1','hero'), ('s2','me','p2','hero'), ('s3','other','p3','hero');
    `);
    const env = { DB: { prepare: sql => ({ bind: (...args) => ({ first: async () => db.prepare(sql).get(...args) }) }) } };
    const selection = { type: "section", surface: "theme-studio", id: "hero", page: "/" };
    await withApplicationAccount(env, "me", async () => {
      assert.equal((await resolveSelectedResource(env, { ...selection, site_id: "two" })).id, "s2");
      await assert.rejects(() => resolveSelectedResource(env, { ...selection, site_id: "three" }), /cms_site_not_found/);
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
