/**
 * Vertical slice: catalog template → install → edit → save → reload → composition preview.
 * Proves real D1 + R2 persistence for storefront embed instances.
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

test("catalog install creates section+block identities that survive edit, reload, hide, move, and remove", async () => {
  const sqlite = createCmsTestDb();
  const env = environment(sqlite);
  try {
    seedAccountPage(sqlite);

    const installed = await installCatalogResource(env, "shop", "acct-a", {
      catalogKey: "announcement_bar",
      settings: {
        enabled: true,
        heading: "Garage nights",
        subtitle: "Hard-wearing essentials",
        button_label: "Shop the drop",
        button_href: "/shop",
        placement: "top",
      },
    });
    assert.equal(installed.ok, true);
    assert.match(installed.section_key, /^announcement-bar-/);
    assert.equal(installed.catalog_key, "announcement_bar");
    assert.equal(installed.canonical?.status, "linked");
    assert.ok(installed.instance?.id || installed.instance?.key);

    const sectionRow = sqlite.prepare(
      "SELECT id, section_key, section_type, status FROM cms_page_sections WHERE section_key=?",
    ).get(installed.section_key);
    assert.equal(sectionRow.section_type, "storefront_embed");
    assert.equal(sectionRow.status, "draft");

    const blocks = sqlite.prepare(
      "SELECT id, block_key, block_type, status, content_json FROM cms_section_blocks WHERE section_id=?",
    ).all(sectionRow.id);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].block_key, "embed-root");
    assert.equal(blocks[0].block_type, "announcement_bar");
    assert.match(blocks[0].id, /^cmsb_/);
    assert.equal(JSON.parse(blocks[0].content_json).heading, "Garage nights");

    const editedHeading = "THE EARNED HOURS COLLECTION";
    const content = {
      enabled: true,
      heading: editedHeading,
      subtitle: "Hard-wearing essentials",
      button_label: "Shop the drop",
      button_href: "/shop",
      placement: "top",
      accent: "#8b181b",
      background: "#141414",
      delay_ms: 0,
      dismissible: true,
      trigger: "immediate",
      "embed-root": {
        enabled: true,
        heading: editedHeading,
        subtitle: "Hard-wearing essentials",
        button_label: "Shop the drop",
        button_href: "/shop",
        placement: "top",
        accent: "#8b181b",
        background: "#141414",
        delay_ms: 0,
        dismissible: true,
        trigger: "immediate",
      },
      __editor: {
        templateKey: "storefront_embed",
        catalogKey: "announcement_bar",
        definitionKey: "announcement_bar",
        catalogLabel: "Announcement bar",
        source: "catalog-install",
        visibility: { enabled: true },
        blocks: [{ id: "embed-root", templateKey: "announcement_bar", enabled: true }],
      },
    };
    const saved = await updateSection(env, "shop", installed.section_key, { content });
    assert.equal(saved.ok, true);
    assert.equal(saved.canonical?.status, "linked");

    const listed = await listInstalledCatalogResources(env, "shop", "acct-a");
    assert.equal(listed.installed.length, 1);
    assert.equal(listed.installed[0].section_key, installed.section_key);
    assert.equal(listed.installed[0].settings.heading, editedHeading);
    assert.equal(listed.installed[0].blocks.length, 1);
    assert.equal(listed.installed[0].blocks[0].type, "announcement_bar");

    const composition = await readCanonicalComposition(env, "acct-a", "shop");
    const composed = composition.sections.find((section) => section.key === installed.section_key);
    assert.ok(composed);
    assert.equal(composed.settings.heading, editedHeading);
    assert.equal(composed.blocks[0].type, "announcement_bar");
    assert.equal(composed.blocks[0].settings.heading, editedHeading);

    const preview = await getPreviewPage(env, "shop");
    const previewSection = preview.sections.find((section) => section.key === installed.section_key);
    assert.ok(previewSection, "preview must include the saved catalog instance");
    assert.equal(previewSection.content.heading, editedHeading);

    const hidden = await setSectionVisibility(env, "shop", installed.section_key, { enabled: false });
    assert.equal(hidden.ok, true);
    const afterHide = await listInstalledCatalogResources(env, "shop", "acct-a");
    assert.equal(afterHide.installed[0].enabled, false);

    const second = await installCatalogResource(env, "shop", "acct-a", {
      catalogKey: "contact_form",
      settings: { enabled: true, heading: "Contact", fields: ["email", "message"], required_fields: ["email"] },
    });
    assert.equal(second.ok, true);
    const moved = await moveSection(env, "shop", second.section_key, { toIndex: 0 });
    assert.equal(moved.ok, true);
    const order = sqlite.prepare(
      "SELECT section_key FROM cms_page_sections WHERE page_id='page-shop' AND status!='removed' ORDER BY sort_order, id",
    ).all().map((row) => row.section_key);
    assert.equal(order[0], second.section_key);

    const removed = await removeSection(env, "shop", installed.section_key);
    assert.equal(removed.ok, true);
    const afterRemove = await listInstalledCatalogResources(env, "shop", "acct-a");
    assert.equal(afterRemove.installed.some((item) => item.section_key === installed.section_key), false);
    assert.equal(afterRemove.installed.length, 1);
  } finally {
    sqlite.close();
  }
});

test("admin API catalog-resources route installs and lists through handleAdminCmsApi", async () => {
  const sqlite = createCmsTestDb();
  const env = environment(sqlite);
  try {
    seedAccountPage(sqlite);
    const create = await handleAdminCmsApi(
      request("/api/admin/cms/pages/shop/catalog-resources", "POST", {
        catalogKey: "newsletter_modal",
        settings: { enabled: true, heading: "Stay in the loop" },
      }),
      env,
      new URL("https://cms.test/api/admin/cms/pages/shop/catalog-resources"),
      { accountId: "acct-a" },
    );
    assert.equal(create.status, 201);
    const created = await create.json();
    assert.equal(created.ok, true);
    assert.equal(created.catalog_key, "newsletter_modal");

    const list = await handleAdminCmsApi(
      request("/api/admin/cms/pages/shop/catalog-resources"),
      env,
      new URL("https://cms.test/api/admin/cms/pages/shop/catalog-resources"),
      { accountId: "acct-a" },
    );
    assert.equal(list.status, 200);
    const payload = await list.json();
    assert.equal(payload.installed.length, 1);
    assert.equal(payload.installed[0].catalog_key, "newsletter_modal");
    assert.ok(payload.catalog.some((entry) => entry.key === "announcement_bar" && entry.installable));

    const denied = await handleAdminCmsApi(
      request("/api/admin/cms/pages/shop/catalog-resources", "POST", { catalogKey: "announcement_bar" }),
      env,
      new URL("https://cms.test/api/admin/cms/pages/shop/catalog-resources"),
      {},
    );
    assert.equal(denied.status, 403);
  } finally {
    sqlite.close();
  }
});
