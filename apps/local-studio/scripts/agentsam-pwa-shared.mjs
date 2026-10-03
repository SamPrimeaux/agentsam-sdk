/**
 * Neutral PWA head chrome for Local Studio.
 *
 * One module shared by the Vite plugin (dev/preview) and the Nitro middleware
 * (deployed). It loads no third-party scripts, calls no third-party hosts, and
 * carries no third-party branding. Identity (name, start URL) is read from
 * this app's `agentsam.app.json`, the single source of app configuration.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const APP_MANIFEST_FILE = "agentsam.app.json";
export const PWA_BASE_PATH = "/__agentsam/pwa";
export const PWA_MANIFEST_PATH = `${PWA_BASE_PATH}/manifest.webmanifest`;
export const PWA_ICON_PATH = `${PWA_BASE_PATH}/icon-180.png`;
export const PWA_ICONS = Object.freeze([
  { src: `${PWA_BASE_PATH}/icon-180.png`, sizes: "180x180", type: "image/png" },
  { src: `${PWA_BASE_PATH}/icon-192.png`, sizes: "192x192", type: "image/png" },
  { src: `${PWA_BASE_PATH}/icon-512.png`, sizes: "512x512", type: "image/png" },
]);
export const DEFAULT_APP_NAME = "AgentSam";
// Matches the background of the AgentSam app icon.
export const THEME_COLOR = "#15171e";
export const OG_SITE_REL_PATH = "src/lib/og/site.json";

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Find agentsam.app.json in `cwd` or up to two parents. */
function findAppManifest(cwd) {
  let dir = cwd;
  for (let i = 0; i < 3; i += 1) {
    const candidate = join(dir, APP_MANIFEST_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "";
}

/** { name, startUrl } from the app manifest; falls back to defaults. */
export function readAppIdentity(cwd = process.cwd()) {
  const identity = { name: DEFAULT_APP_NAME, startUrl: "/" };
  const file = findAppManifest(cwd);
  if (!file) return identity;
  try {
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    const name = String(manifest?.name ?? "").trim();
    if (name) identity.name = name;
    const entry = manifest?.routes?.entry;
    if (typeof entry === "string" && entry.startsWith("/")) identity.startUrl = entry;
  } catch {
    /* unreadable manifest: keep defaults */
  }
  return identity;
}

/** Snapshot the identity so the server bundle needs no filesystem. */
export function snapshotPwaIdentity(cwd = process.cwd()) {
  return readAppIdentity(cwd);
}

function normalizeIdentity(identity = {}) {
  const name = String(identity?.name ?? "").trim() || DEFAULT_APP_NAME;
  const startUrl = String(identity?.startUrl ?? "").startsWith("/") ? identity.startUrl : "/";
  return { name, startUrl };
}

export function isInstallQuery(url) {
  const query = String(url ?? "").split("?", 2)[1] ?? "";
  const params = new URLSearchParams(query);
  const install = params.get("install");
  const platform = (params.get("platform") ?? "").toLowerCase();
  return (install === "1" || install === "true") && platform === "ios";
}

/** Paths that can carry an app document (vs assets / API / internals). */
export function isDocumentPath(pathname) {
  const path = String(pathname ?? "");
  return (
    !path.startsWith("/__agentsam/") &&
    !path.startsWith("/api/") &&
    !path.startsWith("/@") &&
    !path.startsWith("/node_modules") &&
    !/\.[a-z0-9]+$/i.test(path)
  );
}

export function acceptsHtml(accept) {
  const value = String(accept ?? "");
  return value === "" || value.includes("text/html") || value.includes("*/*");
}

/** The same URL without the install-tutorial params (used as the app link). */
export function stripInstallParams(url) {
  const [path = "/", query = ""] = String(url ?? "/").split("?", 2);
  const params = new URLSearchParams(query);
  params.delete("install");
  params.delete("platform");
  const rest = params.toString();
  return rest ? `${path}?${rest}` : path;
}

export function renderInstallPageHtml(template, { identity, url } = {}) {
  const { name } = normalizeIdentity(identity);
  return String(template)
    .replaceAll("{{APP_NAME}}", escapeHtml(name))
    .replaceAll("{{APP_URL}}", escapeHtml(stripInstallParams(url)))
    .replaceAll("{{THEME_COLOR}}", THEME_COLOR)
    .replaceAll("{{MANIFEST_PATH}}", PWA_MANIFEST_PATH)
    .replaceAll("{{ICON_PATH}}", PWA_ICON_PATH);
}

export function renderWebManifest(identity) {
  const { name, startUrl } = normalizeIdentity(identity);
  return JSON.stringify(
    {
      name,
      short_name: name,
      id: "/",
      start_url: startUrl,
      scope: "/",
      display: "standalone",
      background_color: THEME_COLOR,
      theme_color: THEME_COLOR,
      icons: PWA_ICONS,
    },
    null,
    2,
  );
}

/** [key, tag] pairs; `key` is how injection detects an existing tag. */
export function pwaHeadTags(identity) {
  const { name } = normalizeIdentity(identity);
  return [
    // Standalone display comes from the manifest; the legacy
    // *-web-app-capable metas it replaces are deliberately absent.
    ["manifest", `<link rel="manifest" href="${PWA_MANIFEST_PATH}">`],
    ["apple-touch-icon", `<link rel="apple-touch-icon" href="${PWA_ICON_PATH}">`],
    [
      "apple-mobile-web-app-title",
      `<meta name="apple-mobile-web-app-title" content="${escapeHtml(name)}">`,
    ],
    [
      "apple-mobile-web-app-status-bar-style",
      '<meta name="apple-mobile-web-app-status-bar-style" content="black">',
    ],
    ["theme-color", `<meta name="theme-color" content="${THEME_COLOR}">`],
  ];
}

const PRESENCE = {
  manifest: /rel=["']manifest["']/i,
  "apple-touch-icon": /rel=["']apple-touch-icon["']/i,
  "apple-mobile-web-app-title": /name=["']apple-mobile-web-app-title["']/i,
  "apple-mobile-web-app-status-bar-style": /name=["']apple-mobile-web-app-status-bar-style["']/i,
  "theme-color": /name=["']theme-color["']/i,
};

function missingTags(html, identity) {
  return pwaHeadTags(identity)
    .filter(([key]) => !PRESENCE[key].test(html))
    .map(([, tag]) => tag)
    .join("");
}

/** Insert only the missing PWA tags. Idempotent. */
export function injectPwaHead(html, identity) {
  const source = String(html);
  const tags = missingTags(source, identity);
  if (!tags) return source;
  const close = source.search(/<\/head>/i);
  if (close >= 0) return source.slice(0, close) + tags + source.slice(close);
  const head = source.match(/<head[^>]*>/i);
  if (head) {
    const at = head.index + head[0].length;
    return source.slice(0, at) + tags + source.slice(at);
  }
  const root = source.match(/<html[^>]*>/i);
  if (root) {
    const at = root.index + root[0].length;
    return `${source.slice(0, at)}<head>${tags}</head>${source.slice(at)}`;
  }
  return `<head>${tags}</head>${source}`;
}

/**
 * Streaming injector: buffers only until `</head>` (even when split across
 * chunks), injects, then passes later chunks through untouched.
 */
export function createHeadInjector(identity) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  let done = false;
  return {
    push(chunk) {
      if (done) return [chunk];
      pending += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      const close = pending.search(/<\/head>/i);
      if (close < 0) return [];
      const end = close + "</head>".length;
      const out = injectPwaHead(pending.slice(0, end), identity) + pending.slice(end);
      pending = "";
      done = true;
      return [encoder.encode(out)];
    },
    flush() {
      if (done || !pending) return [];
      const out = injectPwaHead(pending, identity);
      pending = "";
      done = true;
      return [encoder.encode(out)];
    },
  };
}

// ── share-card helpers (kept for scripts/brand-check.mjs) ───────────────────
export function readOgSite(cwd = process.cwd()) {
  try {
    const raw = readFileSync(join(cwd, OG_SITE_REL_PATH), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function siteHasCustomCard(site = {}) {
  return String(site.card ?? "").toLowerCase() === "custom";
}
