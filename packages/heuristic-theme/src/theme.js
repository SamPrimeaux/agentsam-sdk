/** @typedef {{ id: string, slug: string, displayName: string, version: string, kind: string, surfaces: string[], slots: Record<string, string[]>, tokens: Record<string, string>, sections: Array<{ type: string, label: string }>, metadata: Record<string, unknown> }} StorefrontShellTheme */

/**
 * Deterministic stock CMS storefront shell theme contract.
 * @returns {StorefrontShellTheme}
 */
export function createStorefrontShellTheme() {
  return {
    id: "theme.storefront.shell",
    slug: "heuristic-theme",
    displayName: "Heuristic Theme",
    version: "0.1.0",
    kind: "storefront-shell",
    surfaces: ["cms.editor", "cms.preview", "theme.gallery"],
    slots: {
      shell: ["header", "main", "footer"],
      page: ["hero", "products", "content", "footer"],
      navigation: ["brand", "links", "cta"],
    },
    tokens: {
      "--color-bg": "#F9F7F2",
      "--color-ink": "#101014",
      "--color-accent": "#1e6a6f",
      "--color-muted": "#8a8a95",
      "--font-display": "\"Iowan Old Style\", \"Palatino Linotype\", Palatino, serif",
      "--font-body": "ui-sans-serif, system-ui, -apple-system, sans-serif",
      "--radius-control": "8px",
    },
    sections: [
      { type: "hero", label: "Editorial hero" },
      { type: "products", label: "Product grid" },
      { type: "footer", label: "Footer" },
    ],
    metadata: {
      package: "@inneranimalmedia/heuristic-theme",
      capability: "theme.storefront.shell",
      deterministic: true,
      demoSite: "demo",
    },
  };
}
