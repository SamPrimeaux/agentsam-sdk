import test from "node:test";
import assert from "node:assert/strict";
import { isPublicSitePath, publicSitePathForRequest } from "./public-site.js";

test("dedicated Theme Store host serves the gallery at its root", () => {
  const request = new Request("https://themes.inneranimalmedia.com/");
  const pathname = publicSitePathForRequest(request);
  assert.equal(pathname, "/themes");
  assert.equal(isPublicSitePath(pathname), true);
});

test("dedicated Theme Store host maps /index.html to the gallery", () => {
  const request = new Request("https://themes.inneranimalmedia.com/index.html");
  assert.equal(publicSitePathForRequest(request), "/themes");
});

test("shared AgentSam homepage remains the homepage", () => {
  const request = new Request("https://agentsam.inneranimalmedia.com/");
  const pathname = publicSitePathForRequest(request);
  assert.equal(pathname, "/");
  assert.equal(isPublicSitePath(pathname), true);
});

test("theme deep links retain their existing path", () => {
  const request = new Request("https://themes.inneranimalmedia.com/themes/resolve/demo/");
  assert.equal(publicSitePathForRequest(request), "/themes/resolve/demo/");
});

import { resolvePublicSiteIdentity, resolvePublishedPageSource, servePublicSitePage } from "./public-site.js";

function domainDb(rowsByHost) {
  return {
    prepare(sql) {
      assert.match(sql, /FROM cms_sites s/);
      assert.match(sql, /domain_aliases_json/);
      return {
        bind(primary, alias, orderedPrimary) {
          assert.equal(primary, alias);
          assert.equal(primary, orderedPrimary);
          return { all: async () => ({ results: rowsByHost[primary] || [] }) };
        },
      };
    },
  };
}

function siteOwnedDb(rowsByHost, pagesBySite = {}, sectionsByPage = {}) {
  return {
    prepare(sql) {
      if (/FROM cms_sites s/.test(sql)) {
        return {
          bind(primary, alias, orderedPrimary) {
            assert.equal(primary, alias);
            assert.equal(primary, orderedPrimary);
            return { all: async () => ({ results: rowsByHost[primary] || [] }) };
          },
        };
      }
      if (/FROM cms_pages/.test(sql)) {
        assert.match(sql, /site_id = \\?/);
        assert.match(sql, /status = 'published'/);
        return {
          bind(siteId, route, withoutTrailingSlash) {
            return { all: async () => ({ results: (pagesBySite[siteId] || []).filter(page =>
              page.status === 'published' && [route, withoutTrailingSlash].includes(page.route_path)
            ) }) };
          },
        };
      }
      if (/FROM cms_page_sections/.test(sql)) {
        assert.match(sql, /page_id = \\?/);
        return { bind(pageId) { return { all: async () => ({ results: sectionsByPage[pageId] || [] }) }; } };
      }
      throw new Error('Unexpected public-site query: ' + sql);
    },
  };
}

const siteA = {
  id: "site_alpha", account_id: "acct_alpha", slug: "alpha-site",
  name: "Alpha", primary_domain: "alpha.example", domain_aliases_json: "[]", status: "active",
};
const siteB = {
  id: "site_beta", account_id: "acct_beta", slug: "beta-site",
  name: "Beta", primary_domain: "beta.example", domain_aliases_json: '["www.beta.example"]', status: "active",
};

test("public site identity is resolved from the registered primary hostname", async () => {
  const site = await resolvePublicSiteIdentity(domainDb({ "alpha.example": [siteA] }), "ALPHA.EXAMPLE.");
  assert.equal(site.id, "site_alpha");
  assert.equal(site.account_id, "acct_alpha");
  assert.equal(site.slug, "alpha-site");
});

test("public site identity resolves registered aliases", async () => {
  const site = await resolvePublicSiteIdentity(domainDb({ "www.beta.example": [siteB] }), "www.beta.example");
  assert.equal(site.id, "site_beta");
});

test("ambiguous public host registrations fail closed", async () => {
  await assert.rejects(
    resolvePublicSiteIdentity(domainDb({ "shared.example": [siteA, siteB] }), "shared.example"),
    /cms_public_site_domain_ambiguous/,
  );
});

test("cold public HTML reads are site-specific and bypass KV", async () => {
  const keys = [];
  const db = siteOwnedDb(
    { "alpha.example": [siteA], "beta.example": [siteB] },
    {
      [siteA.id]: [{ id: "page_alpha_home", site_id: siteA.id, slug: "home", route_path: "/", title: "Alpha home", status: "published" }],
      [siteB.id]: [{ id: "page_beta_home", site_id: siteB.id, slug: "home", route_path: "/", title: "Beta home", status: "published" }],
    },
    {
      page_alpha_home: [{ section_key: "html-document", section_type: "html_source", section_data: JSON.stringify({ source_r2_key: "sites/alpha-site/public/home/index.html" }), is_visible: 1 }],
      page_beta_home: [{ section_key: "html-document", section_type: "html_source", section_data: JSON.stringify({ source_r2_key: "sites/beta-site/public/home/index.html" }), is_visible: 1 }],
    },
  );
  const env = {
    DB: db,
    WEBSITE_ASSETS: {
      async get(key) {
        keys.push(key);
        const label = key.includes("alpha-site") ? "ALPHA CONTENT" : "BETA CONTENT";
        return { text: async () => `<html><body>${label}</body></html>` };
      },
      async put() {},
    },
    CMS_CACHE: {
      async get() { throw new Error("public-site must not read KV"); },
      async put() { throw new Error("public-site must not write KV"); },
      async getWithMetadata() { throw new Error("public-site must not inspect KV"); },
    },
  };
  const alpha = await servePublicSitePage(new Request("https://alpha.example/"), env, "/");
  const beta = await servePublicSitePage(new Request("https://beta.example/"), env, "/");
  assert.match(await alpha.text(), /ALPHA CONTENT/);
  assert.match(await beta.text(), /BETA CONTENT/);
  assert.deepEqual(keys, [
    "sites/alpha-site/public/home/index.html",
    "sites/beta-site/public/home/index.html",
  ]);
  assert.equal(alpha.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  assert.equal(beta.headers.get("cache-control"), "public, max-age=0, must-revalidate");
});

test("published page source cannot point into another site's R2 prefix", async () => {
  const db = siteOwnedDb(
    { "alpha.example": [siteA] },
    { [siteA.id]: [{ id: "page_alpha_home", site_id: siteA.id, slug: "home", route_path: "/", title: "Alpha", status: "published" }] },
    { page_alpha_home: [{ section_key: "html-document", section_type: "html_source", section_data: JSON.stringify({ source_r2_key: "sites/beta-site/public/home/index.html" }), is_visible: 1 }] },
  );
  await assert.rejects(resolvePublishedPageSource(db, siteA, "/"), /cms_public_page_source_outside_site/);
});

test("draft pages are not eligible for public rendering", async () => {
  const db = siteOwnedDb(
    { "alpha.example": [siteA] },
    { [siteA.id]: [{ id: "page_alpha_draft", site_id: siteA.id, slug: "home", route_path: "/", title: "Draft", status: "draft" }] },
    { page_alpha_draft: [{ section_key: "html-document", section_type: "html_source", section_data: JSON.stringify({ source_r2_key: "sites/alpha-site/public/home/index.html" }), is_visible: 1 }] },
  );
  assert.equal(await resolvePublishedPageSource(db, siteA, "/"), null);
});

test("unknown hostname never falls back to another site's public content", async () => {
  const response = await servePublicSitePage(
    new Request("https://unregistered.example/"),
    { DB: domainDb({}), WEBSITE_ASSETS: { async get() { throw new Error("must not read R2"); }, async put() {} } },
    "/",
  );
  assert.equal(response, null);
});
