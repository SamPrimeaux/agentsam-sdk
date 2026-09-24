/** Deterministic installable theme contract for AgentSam gallery/CMS. */
const THEME = {
  "id": "theme.church-site",
  "slug": "church-site",
  "displayName": "New Iberia Church of Christ",
  "version": "0.1.0",
  "kind": "gallery-theme",
  "package": "@inneranimalmedia/theme-church-site",
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
  "description": "Real New Iberia Church of Christ public pages \u2014 visit, groups, mission, and giving.",
  "features": [
    "CMS",
    "Events",
    "Giving",
    "Media"
  ],
  "pages": [
    "Home",
    "Beliefs",
    "Community",
    "Mission",
    "Groups",
    "Donate",
    "Connect",
    "Help"
  ],
  "preview": {
    "kind": "live",
    "card": "/themes/church-site/demo/",
    "desktop": "/themes/church-site/demo/",
    "mobile": "/themes/church-site/demo/",
    "demoUrl": "/themes/church-site/demo/"
  },
  "installable": true,
  "galleryPath": "apps/theme-gallery-preview/themes/church-site",
  "capabilityHints": [
    "theme.storefront.shell"
  ]
};

export function createTheme() {
  return structuredClone(THEME);
}

export default createTheme;

/**
 * agentsam_products UPSERT payload (caller resolves repository_id).
 */
export function createProductRow({ accountId = null, repositoryId = null, status = "prototype" } = {}) {
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
      origin: "gallery_mount",
      normalization_state: status === "production" ? "promoted" : "portable-preview",
      package: theme.package,
      gallery_path: theme.galleryPath,
      preview_kind: theme.preview?.kind || "static",
      capabilities: theme.capabilityHints || [],
      donor_name: theme.displayName,
    },
    relationships: [
      { relationship_type: "packaged_as", target_type: "sdk-package", target_slug: `theme-${theme.slug}` },
      { relationship_type: "depends_on", target_type: "capability", target_slug: "theme.storefront.shell" },
    ],
  };
}
