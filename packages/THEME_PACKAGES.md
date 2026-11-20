# Theme distribution ownership

`inneranimalmedia-theme-store` is the single source of truth for storefront themes: package source, theme catalog, previews, release assets, versioning and npm publication. The AgentSam SDK must not vendor storefront theme implementations or maintain a second storefront-theme registry.

## What remains in the SDK

| Package | Responsibility | Boundary |
| --- | --- | --- |
| `@inneranimalmedia/theme-scenes` | Cross-product scene, shell and block composition; portable CMS section renderers; scene-artifact adapters | Not a storefront theme, storefront theme catalog or theme registry |
| `@inneranimalmedia/agentsam-docs-theme` | Documentation-only tokens and presentation | Not a merchant theme |

The Ecommerce CMS consumes Theme Store catalog/release metadata and persists site-owned theme projects, pages, sections, revisions and publication state through its existing CMS D1/R2 contracts. It carries only neutral first-run content scaffolding, not theme source.

PrimeTech can author reusable scenes with `@inneranimalmedia/theme-scenes`; the CMS registers those scene definitions as portable sections so any compatible Theme Store theme can host them. Brand tokens and site content remain separate from scene composition.
