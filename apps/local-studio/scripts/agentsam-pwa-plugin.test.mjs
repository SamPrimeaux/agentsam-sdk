import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  DEFAULT_APP_NAME,
  OG_SITE_REL_PATH,
  PWA_ICONS,
  PWA_MANIFEST_PATH,
  THEME_COLOR,
  createHeadInjector,
  injectPwaHead,
  isDocumentPath,
  isInstallQuery,
  pwaHeadTags,
  readAppIdentity,
  readOgSite,
  renderInstallPageHtml,
  renderWebManifest,
  siteHasCustomCard,
  snapshotPwaIdentity,
  stripInstallParams,
} from "./agentsam-pwa-shared.mjs";
import { PWA_IDENTITY_ID, agentsamPwaPlugin, renderInstallPage } from "./agentsam-pwa-plugin.mjs";

const TEMPLATE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IDENTITY = { name: "Demo App", startUrl: "/demo" };
const enc = new TextEncoder();
const dec = new TextDecoder();

function runInjector(chunks, identity = IDENTITY) {
  const injector = createHeadInjector(identity);
  const out = [];
  for (const chunk of chunks) out.push(...injector.push(enc.encode(chunk)));
  out.push(...injector.flush());
  return out.map((b) => dec.decode(b)).join("");
}

test("injects before </head>", () => {
  const html = injectPwaHead("<html><head><title>x</title></head><body></body></html>", IDENTITY);
  assert.match(html, /<link rel="manifest" href="\/__agentsam\/pwa\/manifest\.webmanifest"><link/);
  assert.ok(html.indexOf('rel="manifest"') < html.indexOf("</head>"));
  assert.match(html, /apple-mobile-web-app-title" content="Demo App"/);
  assert.match(html, new RegExp(`theme-color" content="${THEME_COLOR}"`));
});

test("injects only the missing tags and is idempotent", () => {
  const partial = '<html><head><link rel="manifest" href="/own.json"></head></html>';
  const once = injectPwaHead(partial, IDENTITY);
  assert.equal(once.match(/rel="manifest"/g).length, 1);
  assert.match(once, /apple-touch-icon/);
  assert.equal(injectPwaHead(once, IDENTITY), once);
});

test("injects into documents with no </head>, no head, or no html", () => {
  assert.match(injectPwaHead("<html><head><title>x</title><body>", IDENTITY), /<head><link rel="manifest"/);
  assert.match(injectPwaHead("<html><body>hi</body></html>", IDENTITY), /<html><head><link rel="manifest".*<\/head><body>/);
  assert.match(injectPwaHead("<p>fragment</p>", IDENTITY), /^<head><link rel="manifest"/);
});

test("escapes the app name in the injected title tag", () => {
  const html = injectPwaHead("<head></head>", { name: 'A "B" <c>' });
  assert.match(html, /content="A &quot;B&quot; &lt;c&gt;"/);
});

test("streaming injector matches </HEAD> case-insensitively", () => {
  const out = runInjector(["<HTML><HEAD></HEAD><BODY>x</BODY></HTML>"]);
  assert.match(out, /rel="manifest"[\s\S]*<\/HEAD>/);
});

test("streaming injector handles </head> split across chunks", () => {
  const out = runInjector(["<html><head><title>t</title></he", "ad><body>after</body></html>"]);
  assert.equal(out.match(/rel="manifest"/g).length, 1);
  assert.ok(out.indexOf('rel="manifest"') < out.indexOf("</head>"));
  assert.ok(out.endsWith("<body>after</body></html>"));
});

test("streaming injector passes post-head chunks through untouched", () => {
  const injector = createHeadInjector(IDENTITY);
  injector.push(enc.encode("<head></head>"));
  const later = enc.encode("<body>more</body>");
  const out = injector.push(later);
  assert.equal(out.length, 1);
  assert.equal(out[0], later);
});

test("streaming injector falls back when no </head> is seen", () => {
  const out = runInjector(["<html><body>no head</body></html>"]);
  assert.match(out, /<head><link rel="manifest"/);
});

test("detects the install query", () => {
  assert.equal(isInstallQuery("/?install=1&platform=ios"), true);
  assert.equal(isInstallQuery("/?install=true&platform=IOS"), true);
  assert.equal(isInstallQuery("/?install=1"), false);
  assert.equal(isInstallQuery("/?platform=ios"), false);
  assert.equal(isInstallQuery("/"), false);
});

test("filters non-document paths", () => {
  assert.equal(isDocumentPath("/"), true);
  assert.equal(isDocumentPath("/agentsam"), true);
  assert.equal(isDocumentPath("/__agentsam/pwa/icon-180.png"), false);
  assert.equal(isDocumentPath("/api/session"), false);
  assert.equal(isDocumentPath("/assets/app.js"), false);
  assert.equal(isDocumentPath("/@vite/client"), false);
});

test("strips install params from the app link", () => {
  assert.equal(stripInstallParams("/agentsam?install=1&platform=ios"), "/agentsam");
  assert.equal(stripInstallParams("/agentsam?x=1&install=1&platform=ios"), "/agentsam?x=1");
});

test("renders the install page for the app and escapes values", () => {
  const html = renderInstallPage({ name: 'Ev<il>"App' }, "/p?install=1&platform=ios&q=<b>");
  assert.match(html, /Add Ev&lt;il&gt;&quot;App to your Home/);
  assert.ok(!html.includes("<il>"));
  assert.ok(!html.includes("{{"), "all template slots are filled");
  assert.match(html, /href="\/p\?q=%3Cb%3E"/);
});

test("install page template uses the shared paths", () => {
  const template = readFileSync(join(TEMPLATE_ROOT, "scripts/install-page.html"), "utf8");
  const html = renderInstallPageHtml(template, { identity: IDENTITY, url: "/" });
  assert.ok(html.includes(PWA_MANIFEST_PATH));
  assert.ok(html.includes(THEME_COLOR));
});

test("renders the manifest from the app identity", () => {
  const manifest = JSON.parse(renderWebManifest(IDENTITY));
  assert.equal(manifest.name, "Demo App");
  assert.equal(manifest.short_name, "Demo App");
  assert.equal(manifest.start_url, "/demo");
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(manifest.icons, PWA_ICONS);
  const fallback = JSON.parse(renderWebManifest({}));
  assert.equal(fallback.name, DEFAULT_APP_NAME);
  assert.equal(fallback.start_url, "/");
});

test("every icon in the manifest exists on disk", () => {
  for (const icon of PWA_ICONS) {
    assert.ok(
      existsSync(join(TEMPLATE_ROOT, "frontend/public", icon.src)),
      `${icon.src} is missing from frontend/public`,
    );
  }
});

test("pwaHeadTags covers manifest, touch icon, title, status bar, theme color", () => {
  assert.deepEqual(
    pwaHeadTags(IDENTITY).map(([key]) => key),
    ["manifest", "apple-touch-icon", "apple-mobile-web-app-title", "apple-mobile-web-app-status-bar-style", "theme-color"],
  );
});

test("readAppIdentity reads name and entry route from agentsam.app.json", () => {
  const root = mkdtempSync(join(tmpdir(), "pwa-id-"));
  writeFileSync(
    join(root, "agentsam.app.json"),
    JSON.stringify({ name: "Studio X", routes: { entry: "/studio" } }),
  );
  assert.deepEqual(readAppIdentity(root), { name: "Studio X", startUrl: "/studio" });
  const child = join(root, "frontend");
  mkdirSync(child);
  assert.deepEqual(snapshotPwaIdentity(child), { name: "Studio X", startUrl: "/studio" });
});

test("readAppIdentity falls back to defaults when the manifest is missing or invalid", () => {
  const empty = mkdtempSync(join(tmpdir(), "pwa-none-"));
  const identity = readAppIdentity(join(empty, "a/b/c/d"));
  assert.equal(identity.name, DEFAULT_APP_NAME);
  const bad = mkdtempSync(join(tmpdir(), "pwa-bad-"));
  writeFileSync(join(bad, "agentsam.app.json"), "{not json");
  assert.deepEqual(readAppIdentity(bad), { name: DEFAULT_APP_NAME, startUrl: "/" });
});

test("this app's identity comes from its own manifest", () => {
  const identity = readAppIdentity(TEMPLATE_ROOT);
  const manifest = JSON.parse(readFileSync(join(TEMPLATE_ROOT, "agentsam.app.json"), "utf8"));
  assert.equal(identity.name, manifest.name);
  assert.equal(identity.startUrl, manifest.routes.entry);
});

test("share-card helpers used by brand-check still work", () => {
  assert.equal(OG_SITE_REL_PATH, "src/lib/og/site.json");
  assert.equal(siteHasCustomCard({ card: "Custom" }), true);
  assert.equal(siteHasCustomCard({}), false);
  assert.deepEqual(readOgSite(mkdtempSync(join(tmpdir(), "pwa-og-"))), {});
});

test("the PWA chrome loads nothing from third parties", () => {
  const files = [
    "scripts/agentsam-pwa-shared.mjs",
    "scripts/agentsam-pwa-plugin.mjs",
    "scripts/install-page.html",
    "backend/server/middleware/agentsam-pwa.ts",
  ];
  for (const rel of files) {
    const text = readFileSync(join(TEMPLATE_ROOT, rel), "utf8");
    assert.ok(!/https?:\/\//i.test(text.replace(/\/\*[\s\S]*?\*\//g, "")), `${rel} references an external URL`);
    assert.ok(!/grok/i.test(text), `${rel} mentions a third-party platform`);
    assert.ok(!/extensions\.js/i.test(text), `${rel} injects an external script`);
  }
});

test("vite config keeps the nitro serverDir wiring", () => {
  const viteConfig = readFileSync(join(TEMPLATE_ROOT, "vite.config.ts"), "utf8");
  assert.match(viteConfig, /serverDir:\s*"\.\/backend\/server"/);
  assert.match(viteConfig, /agentsamPwaPlugin\(\)/);
});

test("nitro middleware and its bundled assets exist", () => {
  const middleware = readFileSync(
    join(TEMPLATE_ROOT, "backend/server/middleware/agentsam-pwa.ts"),
    "utf8",
  );
  assert.match(middleware, /install-page\.html\?raw/);
  assert.match(middleware, /virtual:agentsam-pwa-identity/);
  readFileSync(join(TEMPLATE_ROOT, "scripts/install-page.html"));
});

test("vite plugin bakes the app identity as a virtual module", () => {
  const plugin = agentsamPwaPlugin();
  const resolved = plugin.resolveId(PWA_IDENTITY_ID);
  assert.equal(resolved, `\0${PWA_IDENTITY_ID}`);
  const code = plugin.load(resolved);
  assert.match(code, /export const pwaIdentity = \{.*"name":/);
  assert.equal(plugin.resolveId("something-else"), undefined);
  assert.equal(plugin.load("something-else"), undefined);
});

test("vite plugin injects tags in transformIndexHtml", () => {
  const plugin = agentsamPwaPlugin();
  const html = plugin.transformIndexHtml("<html><head></head><body></body></html>");
  assert.match(html, /rel="manifest"/);
});

test("the client build ships the manifest as a static file", () => {
  const plugin = agentsamPwaPlugin();
  const emitted = [];
  const ctx = { environment: { name: "client" }, emitFile: (f) => emitted.push(f) };
  plugin.generateBundle.call(ctx);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].fileName, PWA_MANIFEST_PATH.slice(1));
  assert.equal(JSON.parse(emitted[0].source).display, "standalone");

  const serverEmitted = [];
  plugin.generateBundle.call({ environment: { name: "ssr" }, emitFile: (f) => serverEmitted.push(f) });
  assert.equal(serverEmitted.length, 0, "server builds must not emit the manifest");
});

test("the root route links match the shared PWA paths", () => {
  const root = readFileSync(join(TEMPLATE_ROOT, "frontend/src/routes/__root.tsx"), "utf8");
  assert.ok(root.includes(`href: "${PWA_MANIFEST_PATH}"`), "manifest link is stale");
  assert.ok(root.includes(`href: "${PWA_ICONS[0].src}"`), "touch icon link is stale");
  assert.ok(!root.includes("__grok"), "root route still references the old path");
});
