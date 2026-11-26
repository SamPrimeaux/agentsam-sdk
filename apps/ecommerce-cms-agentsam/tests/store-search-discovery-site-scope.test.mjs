import assert from "node:assert/strict";
import test from "node:test";
import { createCmsTestDb } from "./cms-test-db.mjs";
import { createCmsSite, ensureDefaultCmsSite } from "../backend/cms/site-context.mjs";
import { getStoreSearchDiscovery } from "../backend/admin/search-discovery.js";
import { postStorePreferences } from "../backend/admin/store.js";
import { handlePublicSearchDiscovery } from "../backend/store/search-discovery.js";

function d1(db) {
  return {
    prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) { params = values; return statement; },
        async first() { return db.prepare(sql).get(...params) || null; },
        async all() { return { results: db.prepare(sql).all(...params) }; },
        async run() { const result = db.prepare(sql).run(...params); return { meta: { changes: result.changes } }; },
      };
      return statement;
    },
  };
}

async function save(DB, siteId, settings) {
  return postStorePreferences(
    new Request("https://admin.example/api/admin/store/preferences", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ settings }),
    }),
    { DB, CMS_SITE_CONTEXT: { id: siteId, account_id: "merchant" } },
    { accountId: "merchant", siteId },
  );
}

function addPage(db, siteId, slug, routePath, seo = "{}") {
  db.prepare(`INSERT INTO cms_pages (id,account_id,site_id,slug,route_path,title,page_type,status,seo_json,metadata_json)
    VALUES (?,?,?,?,?,?,'standard','published',?,'{}')`)
    .run(`page_${siteId}_${slug}`, "merchant", siteId, slug, routePath, slug, seo);
}

test("admin discovery summaries and public sitemap only include the requested hostname's CMS site", async () => {
  const sqlite = createCmsTestDb();
  try {
    sqlite.prepare("INSERT INTO accounts(id) VALUES ('merchant')").run();
    sqlite.exec("CREATE TABLE products (id TEXT PRIMARY KEY, account_id TEXT, site_id TEXT, slug TEXT, status TEXT, updated_at TEXT)");
    const DB = d1(sqlite);
    const first = await ensureDefaultCmsSite(DB, "merchant");
    const second = await createCmsSite(DB, "merchant", { id: "second-site", name: "Second site", slug: "second" });
    sqlite.prepare("UPDATE cms_sites SET primary_domain=? WHERE id=?").run("first.example.test", first.id);
    sqlite.prepare("UPDATE cms_sites SET primary_domain=? WHERE id=?").run("second.example.test", second.id);
    addPage(sqlite, first.id, "home", "/");
    addPage(sqlite, first.id, "about", "/about");
    addPage(sqlite, first.id, "private-search", "/private-search", JSON.stringify({ robots: "noindex,nofollow" }));
    addPage(sqlite, second.id, "home", "/");
    sqlite.prepare("INSERT INTO products VALUES (?,?,?,?,?,?)").run("product-first", "merchant", first.id, "first-item", "active", "2026-11-25T00:00:00Z");
    sqlite.prepare("INSERT INTO products VALUES (?,?,?,?,?,?)").run("product-second", "merchant", second.id, "second-item", "active", "2026-11-25T00:00:00Z");

    const firstSummary = await getStoreSearchDiscovery({ DB }, "merchant", first.id);
    const firstBody = await firstSummary.json();
    assert.equal(firstBody.site.domain, "first.example.test");
    assert.equal(firstBody.public_discovery.indexable_routes, 2);
    assert.equal(firstBody.public_discovery.active_products, 1);
    assert.equal(firstBody.public_discovery.sitemap_url_count, 3);

    const secondSummary = await getStoreSearchDiscovery({ DB }, "merchant", second.id);
    const secondBody = await secondSummary.json();
    assert.equal(secondBody.site.domain, "second.example.test");
    assert.equal(secondBody.public_discovery.indexable_routes, 1);
    assert.equal(secondBody.public_discovery.active_products, 1);
    assert.equal(secondBody.public_discovery.sitemap_url_count, 2);

    const publicSitemap = await handlePublicSearchDiscovery(
      new Request("https://first.example.test/sitemap.xml"), { DB }, new URL("https://first.example.test/sitemap.xml"),
    );
    const sitemapText = await publicSitemap.text();
    assert.match(sitemapText, /https:\/\/first\.example\.test\/about/);
    assert.match(sitemapText, /https:\/\/first\.example\.test\/products\/first-item/);
    assert.doesNotMatch(sitemapText, /second\.example\.test|private-search|second-item/);
  } finally {
    sqlite.close();
  }
});

test("password-protected sites disallow crawling and publish an empty sitemap", async () => {
  const sqlite = createCmsTestDb();
  try {
    sqlite.prepare("INSERT INTO accounts(id) VALUES ('merchant')").run();
    const DB = d1(sqlite);
    const site = await ensureDefaultCmsSite(DB, "merchant");
    sqlite.prepare("UPDATE cms_sites SET primary_domain=? WHERE id=?").run("protected.example.test", site.id);
    await save(DB, site.id, { passwordProtection: true, storePassword: "protected-store-password" });

    const robots = await handlePublicSearchDiscovery(
      new Request("https://protected.example.test/robots.txt"), { DB }, new URL("https://protected.example.test/robots.txt"),
    );
    assert.match((await robots.text()).trimEnd(), /Disallow: \/$/);
    assert.equal(robots.headers.get("cache-control"), "private, no-store");

    const sitemap = await handlePublicSearchDiscovery(
      new Request("https://protected.example.test/sitemap.xml"), { DB }, new URL("https://protected.example.test/sitemap.xml"),
    );
    assert.doesNotMatch(await sitemap.text(), /<loc>/);
    assert.equal(sitemap.headers.get("x-robots-tag"), "noindex, nofollow");
  } finally {
    sqlite.close();
  }
});
