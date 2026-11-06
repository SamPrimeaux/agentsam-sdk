import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const staticRoot = resolve(here, "../frontend/static");
const homeMarkup = readFileSync(resolve(staticRoot, "home.html"), "utf8");
const preferences = readFileSync(resolve(staticRoot, "preferences.html"), "utf8");
const script = readFileSync(resolve(staticRoot, "js/home-workspace.js"), "utf8")
  .split("/* Home assistant workspace")[0];

function previewHarness({ data, query = "", savedSite = null, error = null } = {}) {
  const address = { textContent: "Finding your website…" };
  const frame = { hidden: true, title: "", src: null, removeAttribute(key) {
    if (key === "src") this.src = null;
  }};
  const empty = { hidden: false, textContent: "Loading website preview…" };
  const link = { href: "/admin/store", attrs: {}, setAttribute(key, value) {
    this.attrs[key] = value;
  }};
  const hover = { textContent: "Open Online Store" };
  const card = { querySelector(selector) {
    return { ".fnf-site-preview__address": address, iframe: frame,
      ".fnf-site-preview__link": link, ".fnf-site-preview__hover": hover }[selector];
  }};
  const document = { title: "Home — Online Store",
    querySelector: selector => selector === ".fnf-site-preview" ? card : null,
    getElementById: id => id === "home-site-preview-empty" ? empty : null };
  const saved = new Map(savedSite ? [["agentsam.cms.selected-site.v1", savedSite]] : []);
  const calls = [];
  const context = { document, location: {
      search: query, origin: "https://example.test"
    }, URL, URLSearchParams,
    sessionStorage: { getItem: key => saved.get(key) || null,
      setItem: (key, value) => saved.set(key, value) },
    adminFetch: async endpoint => { calls.push(endpoint); if (error) throw error; return data; } };
  vm.runInNewContext(script, context);
  return { address, frame, empty, link, hover, document, saved, calls };
}
const finish = () => new Promise(resolve => setImmediate(resolve));

test("portable first paint contains no customer-specific identity or / iframe", () => {
  assert.doesNotMatch(homeMarkup, /fuelnfreetime|Fuel & Free Time/i);
  assert.doesNotMatch(preferences, /fuelnfreetime|Fuel & Free Time|\bFNF\b/i);
  assert.doesNotMatch(homeMarkup, /<iframe\s+src="\/"/);
});

test("hosted site resolves an authorized published homepage and edit link", async () => {
  const ui = previewHarness({ query: "?site_id=site_one", data: {
    ok: true, selected_site_id: "site_one", selected_site_name: "Acme",
    available_sites: [{ id: "site_one", name: "Acme", primary_domain: "acme.test" }],
    site_preview: { site_id: "site_one", status: "published",
      url: "https://acme.test/", edit_href: "/admin/theme-editor?site_id=site_one&slug=home" }
  }});
  await finish();
  assert.equal(ui.calls[0], "/api/admin/store/online?site_id=site_one");
  assert.equal(ui.address.textContent, "acme.test");
  assert.equal(ui.frame.src, "https://acme.test/");
  assert.equal(ui.frame.hidden, false);
  assert.equal(ui.empty.hidden, true);
  assert.equal(ui.link.href, "/admin/theme-editor?site_id=site_one&slug=home");
  assert.equal(ui.document.title, "Home — Acme");
});

test("unpublished site is honest and keeps the verified selection", async () => {
  const ui = previewHarness({ savedSite: "site_two", data: {
    ok: true, selected_site_id: "site_two", selected_site_name: "Beta",
    available_sites: [{ id: "site_two", name: "Beta", primary_domain: "beta.test" }],
    site_preview: { site_id: "site_two", status: "draft", url: null }
  }});
  await finish();
  assert.equal(ui.calls[0], "/api/admin/store/online?site_id=site_two");
  assert.equal(ui.frame.hidden, true);
  assert.equal(ui.frame.src, null);
  assert.match(ui.empty.textContent, /no published homepage/i);
  assert.equal(ui.link.href, "/admin/store?site_id=site_two");
});

test("standalone CMS site shape resolves without another customer's fixture", async () => {
  const ui = previewHarness({ data: { ok: true,
    store: { site_id: "site_three", site_name: "Gamma", domain: "gamma.test",
      visibility: "public", url: "https://gamma.test/" },
    pages: [{ slug: "home", status: "published" }]
  }});
  await finish();
  assert.equal(ui.address.textContent, "gamma.test");
  assert.equal(ui.frame.src, "https://gamma.test/");
  assert.equal(ui.link.href, "/admin/store?site_id=site_three");
});

test("a mismatched server response never opens a different website", async () => {
  const ui = previewHarness({ query: "?site_id=site_one", data: { ok: true,
    selected_site_id: "other", available_sites: [{ id: "other",
      primary_domain: "not-mine.test" }],
    site_preview: { site_id: "other", status: "published", url: "https://not-mine.test/" }
  }});
  await finish();
  assert.equal(ui.frame.hidden, true);
  assert.equal(ui.frame.src, null);
  assert.equal(ui.link.href, "/admin/store");
});

test("a cross-domain preview URL cannot impersonate the verified site", async () => {
  const ui = previewHarness({ data: { ok: true, selected_site_id: "site_one",
    available_sites: [{ id: "site_one", name: "Acme", primary_domain: "acme.test" }],
    site_preview: { site_id: "site_one", status: "published",
      url: "https://another.test/", edit_href: "/admin/theme-editor?site_id=other" }
  }});
  await finish();
  assert.equal(ui.frame.src, null);
  assert.equal(ui.frame.hidden, true);
  assert.equal(ui.address.textContent, "acme.test");
  assert.equal(ui.link.href, "/admin/store?site_id=site_one");
});

test("network failure keeps the customer identity unknown", async () => {
  const ui = previewHarness({ error: new Error("offline") });
  await finish();
  assert.equal(ui.address.textContent, "Website unavailable");
  assert.equal(ui.frame.src, null);
  assert.match(ui.empty.textContent, /Could not load/);
});
