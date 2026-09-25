/** Deterministic installable theme contract for AgentSam gallery/CMS. */
const THEME = {
  "id": "theme.shinshu-site",
  "slug": "shinshu-site",
  "displayName": "Shinshu Solutions",
  "version": "0.1.0",
  "kind": "gallery-theme",
  "icon": "theme",
  "package": "@inneranimalmedia/theme-shinshu-site",
  "category": "Professional",
  "industries": [
    "Consulting",
    "Education"
  ],
  "tags": [
    "bilingual",
    "portfolio",
    "cms"
  ],
  "description": "Real Shinshu Solutions static archive \u2014 services, gallery, and CMS-ready pages.",
  "features": [
    "CMS",
    "Portfolio",
    "Media",
    "Forms"
  ],
  "pages": [
    "Home",
    "Services",
    "About",
    "Gallery",
    "Adventures",
    "Contact",
    "Help"
  ],
  "preview": {
    "kind": "live",
    "card": "/themes/shinshu-site/demo/",
    "desktop": "/themes/shinshu-site/demo/",
    "mobile": "/themes/shinshu-site/demo/",
    "demoUrl": "/themes/shinshu-site/demo/"
  },
  "installable": true,
  "galleryPath": "apps/theme-gallery-preview/themes/shinshu-site",
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
