/**
 * The embed manifest is the only authority on what a site owner may change.
 * Locked templates (those declaring editor_fields) must ignore everything else,
 * on install and on every later save.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createCmsTestDb } from "./cms-test-db.mjs";
import {
  handleAdminCmsApi,
  installCatalogResource,
  listInstalledCatalogResources,
  updateSection,
  getPreviewPage,
  removeSection,
  setSectionVisibility,
  moveSection,
} from "../backend/cms/api.js";
import { readCanonicalComposition } from "../backend/cms/canonical-composition.mjs";

const LEGACY_TABLES = `
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS page_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  content_json TEXT NOT NULL DEFAULT '{}',
  content_r2_key TEXT,
  content_version INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(page_id, section_key)
);
`;

function d1(db) {
  return {
    prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) { params = values; return statement; },
        async first() { return db.prepare(sql).get(...params) || null; },
        async all() { return { results: db.prepare(sql).all(...params) }; },
        async run() {
          const result = db.prepare(sql).run(...params);
          return { ...result, meta: { changes: result.changes } };
        },
      };
      return statement;
    },
    async batch(queries) {
      for (const query of queries) await query.run();
    },
  };
}

function environment(sqlite) {
  const objects = new Map();
  return {
    DB: d1(sqlite),
    WEBSITE_ASSETS: {
      async put(key, body) { objects.set(key, String(body)); },
      async get(key) {
        if (!objects.has(key)) return null;
        return { async text() { return objects.get(key); } };
      },
    },
    objects,
  };
}

function request(path, method = "GET", body = undefined) {
  return new Request(`https://cms.test${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function seedAccountPage(sqlite) {
  sqlite.exec(LEGACY_TABLES);
  sqlite.exec(`
    INSERT INTO accounts(id) VALUES ('acct-a');
    INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
      VALUES ('site-a','acct-a','Primary','default','active',1);
    INSERT INTO pages(id,slug,title,status) VALUES (1,'shop','Shop','draft');
    INSERT INTO cms_pages(id,account_id,site_id,legacy_page_id,slug,route_path,title,status)
      VALUES ('page-shop','acct-a','site-a',1,'shop','/shop','Shop','draft');
  `);
}


import { enforceCatalogSettings, resolveCatalogTemplate, guardCatalogContent } from "../backend/cms/catalog-resource.mjs";

async function savedSettings(env, sectionKey) {
  const listed = await listInstalledCatalogResources(env, "shop", "acct-a");
  return listed.installed.find((item) => item.section_key === sectionKey).settings;
}

function chatContent(over = {}) {
  const template = resolveCatalogTemplate("store_chat");
  const settings = { ...structuredClone(template.default_config), enabled: true, ...over };
  return { ...settings, "embed-root": structuredClone(settings),
    __editor: { templateKey: "storefront_embed", catalogKey: "store_chat", definitionKey: "store_chat", blocks: [] } };
}

test("store_chat: owner-only and undeclared keys are forced to defaults on install", async () => {
  const sqlite = createCmsTestDb();
  const env = environment(sqlite);
  try {
    seedAccountPage(sqlite);
    const installed = await installCatalogResource(env, "shop", "acct-a", {
      catalogKey: "store_chat",
      settings: { enabled: true, greeting: "Hello there", agent_replies: "auto", endpoint: "https://evil.example/x", rogue: "1" },
    });
    assert.equal(installed.ok, true);
    const block = await savedSettings(env, installed.section_key);
    assert.equal(block.greeting, "Hello there");
    assert.equal(block.agent_replies, "draft");
    assert.equal(block.endpoint, "");
    assert.equal("rogue" in block, false);
  } finally { sqlite.close(); }
});

test("store_chat: invalid editable values are rejected on install", async () => {
  const sqlite = createCmsTestDb();
  const env = environment(sqlite);
  try {
    seedAccountPage(sqlite);
    for (const settings of [{ accent: "red;}body{x:y" }, { border_radius: "wide" }, { style: "popup" }, { featured_products: [1, 2, 3, 4, 5] }, { image: "javascript:alert(1)" }]) {
      const result = await installCatalogResource(env, "shop", "acct-a", { catalogKey: "store_chat", settings });
      assert.equal(result.status, 422, JSON.stringify(settings));
    }
  } finally { sqlite.close(); }
});

test("store_chat: saves cannot change owner-only keys or swap the template", async () => {
  const sqlite = createCmsTestDb();
  const env = environment(sqlite);
  try {
    seedAccountPage(sqlite);
    const installed = await installCatalogResource(env, "shop", "acct-a", { catalogKey: "store_chat", settings: { enabled: true } });
    const key = installed.section_key;

    const saved = await updateSection(env, "shop", key, { content: chatContent({ greeting: "Edited", agent_replies: "auto", endpoint: "https://evil.example/x", border_radius: 99 }) });
    assert.equal(saved.ok, true);
    const block = await savedSettings(env, key);
    assert.equal(block.greeting, "Edited");
    assert.equal(block.agent_replies, "draft");
    assert.equal(block.endpoint, "");
    assert.equal(block.border_radius, 32);

    const swapped = chatContent();
    swapped.__editor.catalogKey = "announcement_bar";
    assert.equal((await updateSection(env, "shop", key, { content: swapped })).status, 422);

    const stripped = chatContent({ agent_replies: "auto" });
    delete stripped.__editor.catalogKey;
    assert.equal((await updateSection(env, "shop", key, { content: stripped })).ok, true);
    assert.equal((await savedSettings(env, key)).agent_replies, "draft");
  } finally { sqlite.close(); }
});

test("ungoverned templates keep free-form settings; governed ones are the manifest's call", () => {
  const bar = resolveCatalogTemplate("announcement_bar");
  assert.equal(enforceCatalogSettings(bar, { heading: "x", anything: 1 }).governed, false);
  assert.equal(guardCatalogContent("announcement-bar-1a2b3c4d", { heading: "x", __editor: { catalogKey: "announcement_bar" } }).content.heading, "x");
  const chat = resolveCatalogTemplate("store_chat");
  assert.equal(chat.editor_fields.find((f) => f.key === "agent_replies").owner_only, true);
  assert.equal(enforceCatalogSettings(chat, { agent_replies: "off" }).settings.agent_replies, "draft");
});
