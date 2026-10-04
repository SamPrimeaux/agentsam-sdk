/** Canonical AgentSam ready-built prebuild contract. */
const THEME = {
  "id": "theme.grove",
  "slug": "grove",
  "family": "service-gallery",
  "displayName": "Grove",
  "version": "2.6.11",
  "kind": "prebuild",
  "icon": "theme",
  "package": "@inneranimalmedia/theme-grove",
  "category": "Home services",
  "industries": [
    "Contractor",
    "Flooring"
  ],
  "tags": [
    "gallery",
    "estimates",
    "projects"
  ],
  "description": "A visual service-business prebuild centered on project galleries, material detail, process, reviews, and estimate conversion \u2014 polished enough for a studio, practical enough for a crew.",
  "features": [
    "Project gallery",
    "Process",
    "Reviews",
    "Estimate capture"
  ],
  "pages": [
    "Home",
    "Services",
    "Projects",
    "Process",
    "Reviews",
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
