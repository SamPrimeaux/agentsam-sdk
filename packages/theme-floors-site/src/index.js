/** Deterministic installable theme contract for AgentSam gallery/CMS. */
const THEME = {
  "id": "theme.floors-site",
  "slug": "floors-site",
  "displayName": "Anything Floors & More",
  "version": "0.1.0",
  "kind": "gallery-theme",
  "package": "@inneranimalmedia/theme-floors-site",
  "category": "Services",
  "industries": [
    "Contractor",
    "Flooring"
  ],
  "tags": [
    "gallery",
    "estimates",
    "projects"
  ],
  "description": "Real Anything Floors & More public site \u2014 services, gallery, process, and contact.",
  "features": [
    "CMS",
    "Gallery",
    "Forms",
    "Auth"
  ],
  "pages": [
    "Home",
    "Services",
    "Gallery",
    "Process",
    "Contact",
    "Help"
  ],
  "preview": {
    "kind": "live",
    "card": "/themes/floors-site/demo/",
    "desktop": "/themes/floors-site/demo/",
    "mobile": "/themes/floors-site/demo/",
    "demoUrl": "/themes/floors-site/demo/"
  },
  "installable": true,
  "galleryPath": "apps/theme-gallery-preview/themes/floors-site",
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
