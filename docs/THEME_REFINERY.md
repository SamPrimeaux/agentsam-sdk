# Theme distribution boundary

Storefront theme authoring, refinement, catalog, preview, release artifacts and npm publication belong to the `inneranimalmedia-theme-store` repository.

The AgentSam SDK does not vendor storefront theme source, keep a duplicate theme registry, or publish storefront themes. The Ecommerce CMS consumes Theme Store catalog/release metadata and stores site-scoped editable projects using its existing CMS D1/R2 contracts.

The one retained creative package is `@inneranimalmedia/theme-scenes`. It owns reusable scene composition and portable CMS scene renderers; it is not a storefront theme or theme registry. See [Theme package ownership](../packages/THEME_PACKAGES.md).
