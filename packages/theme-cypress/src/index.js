/** Canonical AgentSam ready-built prebuild contract. */
const THEME = {
  "id": "theme.cypress",
  "slug": "cypress",
  "family": "community-faith",
  "displayName": "Cypress",
  "version": "2.6.11",
  "kind": "prebuild",
  "icon": "theme",
  "package": "@inneranimalmedia/theme-cypress",
  "category": "Community",
  "industries": [
    "Church",
    "Nonprofit"
  ],
  "tags": [
    "groups",
    "giving",
    "visit"
  ],
  "description": "A welcoming community prebuild for organizations that need events, groups, giving, visits, and mission-driven storytelling without looking like a generic nonprofit template.",
  "features": [
    "Events",
    "Groups",
    "Giving",
    "Story-driven pages"
  ],
  "pages": [
    "Home",
    "Visit",
    "Events",
    "Groups",
    "Mission",
    "Give"
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
