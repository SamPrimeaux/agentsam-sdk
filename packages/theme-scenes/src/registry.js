/**
 * Theme package registry — normalize names WITHOUT renaming/moving built CSS.
 *
 * Storage model (do not flatten or delete packages):
 *   packages/theme-<site>-site     → installable public-site BrandPack + page CSS
 *   packages/theme-scenes          → reusable scene/shell/block composition vocabulary
 *   packages/heuristic-theme       → stock CMS storefront shell contract
 *   packages/agentsam-docs-theme   → docs skin tokens (Instrument/violet docs)
 *   apps/theme-gallery-preview     → gallery demos only (not production authority)
 *
 * Host shell typography lives in apps/local-studio/frontend/src/styles.css
 * (--font-sans / --font-display / --font-mono). Product packages MUST consume
 * those tokens instead of shipping an unrelated global font (e.g. Inter).
 *
 * Canonical ids are kebab-case and stable. Package names keep the existing
 * @inneranimalmedia/theme-* npm ids so already-built styles continue to resolve.
 */

/** @typedef {'site-theme'|'scenes'|'storefront-shell'|'docs-skin'|'gallery-preview'} ThemePackageKind */

/**
 * @typedef {object} ThemePackageEntry
 * @property {string} id
 * @property {string} packageName
 * @property {string} path
 * @property {ThemePackageKind} kind
 * @property {string} label
 * @property {string} [siteSlug]
 * @property {string[]} [aliases]
 */

/** @type {readonly ThemePackageEntry[]} */
export const THEME_PACKAGE_REGISTRY = Object.freeze([
  {
    id: "church-site",
    packageName: "@inneranimalmedia/theme-church-site",
    path: "packages/theme-church-site",
    kind: "site-theme",
    label: "New Iberia Church of Christ",
    siteSlug: "church-site",
    aliases: ["theme-church", "church"],
  },
  {
    id: "companions-site",
    packageName: "@inneranimalmedia/theme-companions-site",
    path: "packages/theme-companions-site",
    kind: "site-theme",
    label: "Companions of Caddo",
    siteSlug: "companions-site",
    aliases: ["theme-companions", "companions", "companions-of-caddo"],
  },
  {
    id: "floors-site",
    packageName: "@inneranimalmedia/theme-floors-site",
    path: "packages/theme-floors-site",
    kind: "site-theme",
    label: "Anything Floors & More",
    siteSlug: "floors-site",
    aliases: ["theme-floors", "floors", "anything-floors"],
  },
  {
    id: "fuelnfree-site",
    packageName: "@inneranimalmedia/theme-fuelnfree-site",
    path: "packages/theme-fuelnfree-site",
    kind: "site-theme",
    label: "Fuel & Free Time",
    siteSlug: "fuelnfree-site",
    aliases: ["theme-fuelnfree", "fuelnfreetime", "fuel-n-free"],
  },
  {
    id: "handyman-site",
    packageName: "@inneranimalmedia/theme-handyman-site",
    path: "packages/theme-handyman-site",
    kind: "site-theme",
    label: "Primeaux Handyman",
    siteSlug: "handyman-site",
    aliases: ["theme-handyman", "handyman"],
  },
  {
    id: "insurance-site",
    packageName: "@inneranimalmedia/theme-insurance-site",
    path: "packages/theme-insurance-site",
    kind: "site-theme",
    label: "Chrystal Clear Insurance",
    siteSlug: "insurance-site",
    aliases: ["theme-insurance", "insurance"],
  },
  {
    id: "shinshu-site",
    packageName: "@inneranimalmedia/theme-shinshu-site",
    path: "packages/theme-shinshu-site",
    kind: "site-theme",
    label: "Shinshu Solutions",
    siteSlug: "shinshu-site",
    aliases: ["theme-shinshu", "shinshu"],
  },
  {
    id: "scenes",
    packageName: "@inneranimalmedia/theme-scenes",
    path: "packages/theme-scenes",
    kind: "scenes",
    label: "Theme Scenes (composition vocabulary)",
    aliases: ["theme-scenes", "scenes"],
  },
  {
    id: "heuristic",
    packageName: "@inneranimalmedia/heuristic-theme",
    path: "packages/heuristic-theme",
    kind: "storefront-shell",
    label: "Heuristic storefront shell",
    aliases: ["heuristic-theme", "storefront-shell"],
  },
  {
    id: "docs",
    packageName: "@inneranimalmedia/agentsam-docs-theme",
    path: "packages/agentsam-docs-theme",
    kind: "docs-skin",
    label: "AgentSam docs skin",
    aliases: ["docs-theme", "agentsam-docs"],
  },
]);

/**
 * @param {string} query
 * @returns {ThemePackageEntry | null}
 */
export function resolveThemePackage(query) {
  const q = String(query || "")
    .trim()
    .toLowerCase()
    .replace(/^@inneranimalmedia\//, "");
  if (!q) return null;
  for (const entry of THEME_PACKAGE_REGISTRY) {
    if (entry.id === q) return entry;
    if (entry.packageName.replace(/^@inneranimalmedia\//, "") === q) return entry;
    if (entry.siteSlug === q) return entry;
    if ((entry.aliases || []).some((alias) => alias.toLowerCase() === q)) return entry;
  }
  return null;
}

/**
 * @param {ThemePackageKind} [kind]
 * @returns {ThemePackageEntry[]}
 */
export function listThemePackages(kind) {
  return THEME_PACKAGE_REGISTRY.filter((entry) => (kind ? entry.kind === kind : true)).map((entry) => ({
    ...entry,
  }));
}
