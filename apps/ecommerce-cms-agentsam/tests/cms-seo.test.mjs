import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSeo, resolveSeo, renderHeadTags, lintSeo, derivedCanonical } from "../backend/cms/seo.mjs";

const site = { name: "Fuel & Free Time", primary_domain: "fuelnfreetime.com", settings_json: JSON.stringify({ seo: {
  site_name: "Fuel & Free Time", title_template: "{title} | {site_name}", home_title: "Fuel & Free Time - Earned Freedom Apparel",
  default_description: "Hard-wearing essentials for garage nights, early launches and long roads, built for people who earned their freedom.",
  default_og_image: "/img/og-default.jpg", twitter_handle: "@fnf" } }) };
const page = (o = {}) => ({ title: "About", route_path: "/about", status: "published", seo_json: "{}", ...o });

test("starter page ships complete head tags with zero author input", () => {
  const html = renderHeadTags(resolveSeo({ page: page(), site }));
  for (const needle of ["<title>About | Fuel &amp; Free Time</title>", 'name="description"', 'rel="canonical" href="https://fuelnfreetime.com/about"',
    'name="robots" content="index,follow,max-image-preview:large"', 'property="og:title"', 'property="og:image" content="https://fuelnfreetime.com/img/og-default.jpg"',
    'name="twitter:card" content="summary_large_image"', "application/ld+json"]) assert.ok(html.includes(needle), needle);
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1].replace(/\\u003c/g, "<")));
  assert.equal(ld[0]["@type"], "BreadcrumbList");
});

test("home page uses home_title and emits WebSite + Organization", () => {
  const r = resolveSeo({ page: page({ title: "Home", route_path: "/" }), site });
  assert.equal(r.title, "Fuel & Free Time - Earned Freedom Apparel");
  assert.deepEqual(r.jsonld.map((b) => b["@type"]), ["WebSite", "Organization"]);
  assert.equal(r.canonical, "https://fuelnfreetime.com/");
});

test("page overrides beat site defaults; legacy keys are accepted", () => {
  const r = resolveSeo({ page: page({ seo_json: JSON.stringify({ seo_title: "Custom", meta_description: "Mine", canonical_url: "https://x.test/y" }) }), site });
  assert.equal(r.title, "Custom"); assert.equal(r.description, "Mine"); assert.equal(r.canonical, "https://x.test/y");
});

test("drafts, auth pages and noindex are never indexable", () => {
  for (const p of [page({ status: "draft" }), page({ requires_auth: 1 }), page({ seo_json: JSON.stringify({ noindex: true }) }), page({ seo_json: JSON.stringify({ robots: "noindex,follow" }) })]) {
    const r = resolveSeo({ page: p, site }); assert.equal(r.indexable, false); assert.equal(r.robots, "noindex,follow");
  }
});

test("output is escaped and JSON-LD cannot break out of its script tag", () => {
  const html = renderHeadTags(resolveSeo({ page: page({ title: 'A "q" </script><b>' }), site }));
  assert.ok(!html.includes("</script><b>")); assert.ok(html.includes("&lt;/script&gt;"));
});

test("lint warns on missing, short, long and duplicate", () => {
  const bare = resolveSeo({ page: page({ title: "Hi" }), site: { name: "S" } });
  const codes = lintSeo(bare).map((w) => `${w.field}:${w.code}`);
  for (const c of ["title:too_short", "description:missing", "og_image:missing", "canonical:no_primary_domain"]) assert.ok(codes.includes(c), c);
  assert.ok(lintSeo(resolveSeo({ page: page(), site }), { siblingTitles: ["About | Fuel & Free Time"] }).some((w) => w.code === "duplicate"));
});

test("normalize drops junk and derivedCanonical trims routes", () => {
  assert.deepEqual(normalizeSeo({ title: "  T  ", junk: 1, noindex: "yes" }), { title: "T" });
  assert.equal(derivedCanonical(site, { route_path: "shop/" }, ""), "https://fuelnfreetime.com/shop");
});
