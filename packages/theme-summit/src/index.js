/** Canonical AgentSam ready-built prebuild contract. */
const THEME = {
  "id": "theme.summit",
  "slug": "summit",
  "family": "consulting-portfolio",
  "displayName": "Summit",
  "version": "2.6.11",
  "kind": "prebuild",
  "icon": "theme",
  "package": "@inneranimalmedia/theme-summit",
  "category": "Portfolio",
  "industries": [
    "Consulting",
    "Education"
  ],
  "tags": [
    "bilingual",
    "portfolio",
    "cms"
  ],
  "description": "A restrained consulting and portfolio prebuild with editorial services, case studies, multilingual-ready structure, media, and thoughtful spacing that lets expertise do the talking.",
  "features": [
    "Services",
    "Case studies",
    "Media",
    "Multilingual-ready"
  ],
  "pages": [
    "Home",
    "Services",
    "Work",
    "About",
    "Journal",
    "Contact"
  ],
  "installable": true,
  "portable": true,
  "prebuildRoot": "site",
  "capabilityHints": [
    "theme.storefront.shell"
  ]
};

export function createTheme() {
  return structuredClone(THEME);
}

export default createTheme;

export function createProductRow({ accountId = null, repositoryId = null, status = "package_ready" } = {}) {
  const theme = createTheme();
  return {
    account_id: accountId,
    slug: theme.slug,
    name: theme.displayName,
    kind: "app",
    status,
    repository_id: repositoryId,
    canonical_path: `packages/theme-${theme.slug}`,
    package_name: theme.package,
    metadata: {
      origin: "package_prebuild",
      normalization_state: "package_ready",
      family: theme.family,
      package: theme.package,
      prebuild_root: theme.prebuildRoot,
      portable: true,
      preview_kind: "static",
      capabilities: theme.capabilityHints || [],
    },
    relationships: [
      { relationship_type: "packaged_as", target_type: "sdk-package", target_slug: `theme-${theme.slug}` },
      { relationship_type: "depends_on", target_type: "capability", target_slug: "theme.storefront.shell" },
    ],
  };
}
