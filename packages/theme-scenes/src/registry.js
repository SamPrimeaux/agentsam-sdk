/**
 * Theme package registry — canonical AgentSam prebuild identities.
 *
 * Storage model (do not flatten or delete built CSS mounts):
 * Canonical site-theme packages use neutral AgentSam product identities.
 * Historical customer naming is intentionally not retained here.
 *
 * Host typography: apps/local-studio/frontend/src/styles.css
 * (--font-sans / --font-display / --font-mono).
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
    id: "cypress",
    packageName: "@inneranimalmedia/theme-cypress",
    path: "packages/theme-cypress",
    kind: "site-theme",
    label: "Cypress",
    siteSlug: "cypress",

    aliases: ["cypress", "theme-cypress"],
  },
  {
    id: "violet",
    packageName: "@inneranimalmedia/theme-violet",
    path: "packages/theme-violet",
    kind: "site-theme",
    label: "Violet",
    siteSlug: "violet",

    aliases: ["violet", "theme-violet"],
  },
  {
    id: "grove",
    packageName: "@inneranimalmedia/theme-grove",
    path: "packages/theme-grove",
    kind: "site-theme",
    label: "Grove",
    siteSlug: "grove",

    aliases: ["grove", "theme-grove"],
  },
  {
    id: "ember",
    packageName: "@inneranimalmedia/theme-ember",
    path: "packages/theme-ember",
    kind: "site-theme",
    label: "Ember",
    siteSlug: "ember",

    aliases: ["ember", "theme-ember"],
  },
  {
    id: "forge",
    packageName: "@inneranimalmedia/theme-forge",
    path: "packages/theme-forge",
    kind: "site-theme",
    label: "Forge",
    siteSlug: "forge",

    aliases: ["forge", "theme-forge"],
  },
  {
    id: "harbor",
    packageName: "@inneranimalmedia/theme-harbor",
    path: "packages/theme-harbor",
    kind: "site-theme",
    label: "Harbor",
    siteSlug: "harbor",

    aliases: ["harbor", "theme-harbor"],
  },
  {
    id: "summit",
    packageName: "@inneranimalmedia/theme-summit",
    path: "packages/theme-summit",
    kind: "site-theme",
    label: "Summit",
    siteSlug: "summit",

    aliases: ["summit", "theme-summit"],
  },
  {
    id: "iasf",
    packageName: "@inneranimalmedia/theme-iasf",
    path: "packages/theme-iasf",
    kind: "site-theme",
    label: "IASF Storefront",
    siteSlug: "iasf",

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
    packageName: "@inneranimalmedia/theme-heuristic",
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
      entry.path,
      entry.siteSlug,
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
