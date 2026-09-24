/** Deterministic installable theme contract for AgentSam gallery/CMS. */
const THEME = {
  "id": "theme.insurance-site",
  "slug": "insurance-site",
  "displayName": "Chrystal Clear Insurance",
  "version": "0.1.0",
  "kind": "gallery-theme",
  "package": "@inneranimalmedia/theme-insurance-site",
  "category": "Professional",
  "industries": [
    "Insurance",
    "Professional Services"
  ],
  "tags": [
    "quotes",
    "trust",
    "lead-forms"
  ],
  "description": "Real Chrystal Clear Insurance build \u2014 editorial insurance storefront with coverage storytelling and quote capture.",
  "features": [
    "CMS",
    "Lead forms",
    "Media",
    "Email"
  ],
  "pages": [
    "Home",
    "Coverage",
    "About",
    "Claims",
    "Resources",
    "Contact",
    "Help"
  ],
  "preview": {
    "kind": "live",
    "card": "/themes/insurance-site/demo/",
    "desktop": "/themes/insurance-site/demo/",
    "mobile": "/themes/insurance-site/demo/",
    "demoUrl": "/themes/insurance-site/demo/"
  },
  "installable": true,
  "galleryPath": "apps/theme-gallery-preview/themes/insurance-site",
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
