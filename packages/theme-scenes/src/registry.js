/**
 * Theme package registry — neutral product identity + donor aliases.
 *
 * Storage model (do not flatten or delete built CSS mounts):
 *   packages/theme-*-site          → package folders (path may keep donor slug)
 *   packages/theme-scenes          → composition vocabulary
 *   packages/heuristic-theme       → stock CMS shell
 *   packages/agentsam-docs-theme   → docs skin
 *   apps/theme-gallery-preview     → gallery demos only
 *
 * Canonical public ids are neutral (cypress/violet/…). Donor names stay private
 * provenance via aliases[]. Gallery/static URLs can keep old mounts.
 *
 * Host typography: apps/local-studio/frontend/src/styles.css
 * (--font-sans / --font-display / --font-mono).
 */

/** @typedef {'site-theme'|'scenes'|'storefront-shell'|'docs-skin'|'gallery-preview'} ThemePackageKind */

/**
 * @typedef {object} ThemePackageEntry
 * @property {string} id
 * @property {string} packageName
 * @property {string} [packageNameLegacy]
 * @property {string} path
 * @property {ThemePackageKind} kind
 * @property {string} label
 * @property {string} [siteSlug]
 * @property {string} [donor]
 * @property {string[]} [aliases]
 */

/** @type {readonly ThemePackageEntry[]} */
export const THEME_PACKAGE_REGISTRY = Object.freeze([
  {
    id: "cypress",
    packageName: "@inneranimalmedia/theme-cypress",
    packageNameLegacy: "@inneranimalmedia/theme-church-site",
    path: "packages/theme-church-site",
    kind: "site-theme",
    label: "Cypress",
    siteSlug: "church-site",
    donor: "new-iberia-church",
    aliases: ["church-site", "theme-church", "church", "theme-church-site", "nic"],
  },
  {
    id: "violet",
    packageName: "@inneranimalmedia/theme-violet",
    packageNameLegacy: "@inneranimalmedia/theme-companions-site",
    path: "packages/theme-companions-site",
    kind: "site-theme",
    label: "Violet",
    siteSlug: "companions-site",
    donor: "companions-of-caddo",
    aliases: ["companions-site", "theme-companions", "companions", "companions-of-caddo", "theme-companions-site", "coc"],
  },
  {
    id: "grove",
    packageName: "@inneranimalmedia/theme-grove",
    packageNameLegacy: "@inneranimalmedia/theme-floors-site",
    path: "packages/theme-floors-site",
    kind: "site-theme",
    label: "Grove",
    siteSlug: "floors-site",
    donor: "anything-floors",
    aliases: ["floors-site", "theme-floors", "floors", "anything-floors", "theme-floors-site", "afm"],
  },
  {
    id: "ember",
    packageName: "@inneranimalmedia/theme-ember",
    packageNameLegacy: "@inneranimalmedia/theme-fuelnfree-site",
    path: "packages/theme-fuelnfree-site",
    kind: "site-theme",
    label: "Ember",
    siteSlug: "fuelnfree-site",
    donor: "fuelnfreetime",
    aliases: ["fuelnfree-site", "theme-fuelnfree", "fuelnfreetime", "fuel-n-free", "theme-fuelnfree-site", "fnf"],
  },
  {
    id: "forge",
    packageName: "@inneranimalmedia/theme-forge",
    packageNameLegacy: "@inneranimalmedia/theme-handyman-site",
    path: "packages/theme-handyman-site",
    kind: "site-theme",
    label: "Forge",
    siteSlug: "handyman-site",
    donor: "primeaux-handyman",
    aliases: ["handyman-site", "theme-handyman", "handyman", "theme-handyman-site", "phs"],
  },
  {
    id: "harbor",
    packageName: "@inneranimalmedia/theme-harbor",
    packageNameLegacy: "@inneranimalmedia/theme-insurance-site",
    path: "packages/theme-insurance-site",
    kind: "site-theme",
    label: "Harbor",
    siteSlug: "insurance-site",
    donor: "chrystal-clear-insurance",
    aliases: ["insurance-site", "theme-insurance", "insurance", "theme-insurance-site", "cci"],
  },
  {
    id: "summit",
    packageName: "@inneranimalmedia/theme-summit",
    packageNameLegacy: "@inneranimalmedia/theme-shinshu-site",
    path: "packages/theme-shinshu-site",
    kind: "site-theme",
    label: "Summit",
    siteSlug: "shinshu-site",
    donor: "shinshu-solutions",
    aliases: ["shinshu-site", "theme-shinshu", "shinshu", "theme-shinshu-site", "shin"],
  },
  {
    id: "iasf",
    packageName: "@inneranimalmedia/theme-iasf",
    path: "packages/theme-iasf",
    kind: "site-theme",
    label: "IASF Storefront",
    siteSlug: "iasf",
    donor: "inner-animals-storefront",
    aliases: [
      "theme-iasf",
      "inneranimals-site",
      "theme-inneranimals-site",
      "inner-animals",
      "inneranimals",
      "iasf-storefront",
    ],
  },
  {
    id: "theme-scenes",
    packageName: "@inneranimalmedia/theme-scenes",
    path: "packages/theme-scenes",
    kind: "scenes",
    label: "Theme Scenes",
    aliases: ["scenes", "composition"],
  },
  {
    id: "heuristic",
    packageName: "@inneranimalmedia/heuristic-theme",
    path: "packages/heuristic-theme",
    kind: "storefront-shell",
    label: "Heuristic storefront shell",
    aliases: ["heuristic-theme", "storefront"],
  },
  {
    id: "docs",
    packageName: "@inneranimalmedia/agentsam-docs-theme",
    path: "packages/agentsam-docs-theme",
    kind: "docs-skin",
    label: "AgentSam docs skin",
    aliases: ["agentsam-docs-theme", "docs-theme"],
  },
]);

/**
 * @param {string} query
 * @returns {ThemePackageEntry | null}
 */
export function resolveThemePackage(query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return null;
  for (const entry of THEME_PACKAGE_REGISTRY) {
    const names = [
      entry.id,
      entry.packageName,
      entry.packageNameLegacy,
      entry.path,
      entry.siteSlug,
      entry.donor,
      ...(entry.aliases || []),
    ]
      .filter(Boolean)
      .map((v) => String(v).toLowerCase());
    if (names.includes(needle)) return entry;
    if (names.some((n) => n.endsWith("/" + needle) || n.endsWith(needle))) return entry;
  }
  return null;
}

/**
 * @param {ThemePackageKind} [kind]
 * @returns {ThemePackageEntry[]}
 */
export function listThemePackages(kind) {
  if (!kind) return [...THEME_PACKAGE_REGISTRY];
  return THEME_PACKAGE_REGISTRY.filter((entry) => entry.kind === kind);
}
