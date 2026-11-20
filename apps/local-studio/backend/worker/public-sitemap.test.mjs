import test from "node:test";
import assert from "node:assert/strict";
import { isPublicSitePath } from "./public-site.js";
import {
  isPublicSearchDiscoveryPath,
  resolvePublicSitemapEntries,
  servePublicSearchDiscovery,
} from "./public-sitemap.js";

const agentSamSite = {
  id: "site_agentsam",
  account_id: "acct_agentsam",
  slug: "agentsam-sdk",
  name: "AgentSam SDK (Local Studio)",
  primary_domain: "agentsam.inneranimalmedia.com",
  status: "active",
};

const agentSamPages = [
  {
    route_path: "/",
    title: "Agent Sam SDK",
    page_type: "landing",
    requires_auth: 0,
    seo_json: '{"robots":"index,follow"}',
    published_at: 1790731601,
  },
  {
    route_path: "/docs/sam/native-runtime/",
    title: "Native Go Runtime",
    page_type: "custom",
    requires_auth: 0,
    seo_json: '{"robots":"index,follow"}',
    published_at: null,
  },
  {
    route_path: "/admin/private/",
    title: "Admin",
    page_type: "page",
    requires_auth: 0,
    seo_json: "{}",
  },
  {
    route_path: "/auth/login",
    title: "Login",
    page_type: "page",
    requires_auth: 0,
    seo_json: "{}",
  },
  {
    route_path: "/private/",
    title: "Private",
    page_type: "page",
    requires_auth: 1,
    seo_json: "{}",
  },
  {
    route_path: "/hidden/",
    title: "Hidden",
    page_type: "page",
    requires_auth: 0,
    seo_json: '{"robots":"noindex,nofollow"}',
  },
  {
    route_path: "/themes/",
    title: "Themes",
    page_type: "custom",
    requires_auth: 0,
    seo_json: '{"robots":"index,follow"}',
  },
  {
    route_path: "/portal/",
    title: "Portal",
    page_type: "portal",
    requires_auth: 0,
    seo_json: "{}",
  },
  {
    route_path: "not-absolute",
    title: "Invalid",
    page_type: "page",
    requires_auth: 0,
    seo_json: "{}",
  },
];

function sitemapDb(site, pages) {
  return {
    prepare(sql) {
      assert.match(sql, /FROM cms_pages/);
      assert.match(sql, /site_id = \?/);
      assert.match(sql, /status = 'published'/);
      assert.match(sql, /requires_auth/);
      return {
        bind(siteId) {
          assert.equal(siteId, site.id);
          return { all: async () => ({ results: pages }) };
        },
      };
    },
  };
}

test("sitemap and robots endpoints are registered public Worker routes", () => {
  for (const pathname of ["/sitemap", "/sitemap/", "/sitemap.xml", "/robots.txt"]) {
    assert.equal(isPublicSearchDiscoveryPath(pathname), true);
    assert.equal(isPublicSitePath(pathname), true);
  }
});

test("AgentSam sitemap includes published indexable pages and static legal/setup pages only", async () => {
  const entries = await resolvePublicSitemapEntries(
    sitemapDb(agentSamSite, agentSamPages),
    agentSamSite,
    new Request("https://agentsam.inneranimalmedia.com/sitemap.xml"),
  );
  const locations = entries.map(entry => entry.loc);

  assert.ok(locations.includes("https://agentsam.inneranimalmedia.com/"));
  assert.ok(locations.includes("https://agentsam.inneranimalmedia.com/docs/sam/native-runtime/"));
  assert.ok(locations.includes("https://agentsam.inneranimalmedia.com/privacy"));
  assert.ok(locations.includes("https://agentsam.inneranimalmedia.com/terms"));
  assert.ok(locations.includes("https://agentsam.inneranimalmedia.com/packages/sdk/setup-guide/"));
  assert.ok(!locations.some(location => /\/(?:admin|api|auth|private|hidden|portal|themes)(?:\/|$)/.test(location)));
  assert.equal(entries.find(entry => entry.path === "/").lastmod, "2026-09-29");
});

test("XML sitemap is absolute, validly typed, and excludes protected routes", async () => {
  const response = await servePublicSearchDiscovery(
    new Request("https://agentsam.inneranimalmedia.com/sitemap.xml"),
    { DB: sitemapDb(agentSamSite, agentSamPages) },
    agentSamSite,
    "/sitemap.xml",
  );
  const xml = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/xml/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<loc>https:\/\/agentsam\.inneranimalmedia\.com\/docs\/sam\/native-runtime\//);
  assert.doesNotMatch(xml, /\/(?:admin|api|auth|private|hidden|portal|themes)(?:\/|<)/);
});

test("human-readable sitemap identifies AgentSam Local Studio and links legal documents", async () => {
  const response = await servePublicSearchDiscovery(
    new Request("https://agentsam.inneranimalmedia.com/sitemap"),
    { DB: sitemapDb(agentSamSite, agentSamPages) },
    agentSamSite,
    "/sitemap",
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(html, /Sitemap \| AgentSam Local Studio/);
  assert.match(html, /operated by Inner Animal Media/i);
  assert.match(html, /Privacy Policy/);
  assert.match(html, /Terms of Service/);
  assert.match(html, /https:\/\/agentsam\.inneranimalmedia\.com\/sitemap\.xml/);
  assert.doesNotMatch(html, /\/admin\/private/);
});

test("robots.txt points crawlers to the canonical sitemap and blocks private app surfaces", async () => {
  const response = await servePublicSearchDiscovery(
    new Request("https://agentsam.inneranimalmedia.com/robots.txt"),
    { DB: sitemapDb(agentSamSite, agentSamPages) },
    agentSamSite,
    "/robots.txt",
  );
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/plain/);
  assert.match(body, /Disallow: \/admin\//);
  assert.match(body, /Disallow: \/api\//);
  assert.match(body, /Disallow: \/auth\//);
  assert.match(body, /Sitemap: https:\/\/agentsam\.inneranimalmedia\.com\/sitemap\.xml/);
});

test("sitemap slash alias redirects to the canonical human-readable route", async () => {
  const response = await servePublicSearchDiscovery(
    new Request("https://agentsam.inneranimalmedia.com/sitemap/"),
    { DB: sitemapDb(agentSamSite, agentSamPages) },
    agentSamSite,
    "/sitemap/",
  );

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "https://agentsam.inneranimalmedia.com/sitemap");
});

test("tenant sitemap is scoped to that site's published pages without AgentSam static entries", async () => {
  const tenant = {
    id: "site_customer",
    account_id: "acct_customer",
    slug: "customer-site",
    name: "Customer Site",
    primary_domain: "shop.customer.example",
    status: "active",
  };
  const entries = await resolvePublicSitemapEntries(
    sitemapDb(tenant, [{
      route_path: "/",
      title: "Customer home",
      page_type: "landing",
      requires_auth: 0,
      seo_json: "{}",
      published_at: null,
    }]),
    tenant,
    new Request("https://shop.customer.example/sitemap.xml"),
  );

  assert.deepEqual(entries.map(entry => entry.loc), ["https://shop.customer.example/"]);
});
