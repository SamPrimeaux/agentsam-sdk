# AgentSam Brand Workspace — first implementation and acceptance

**Status:** implemented SDK source contract. Brand approval, production deployment, and the complete Design Canvas integration remain separate acceptance gates.

## Objective

One reusable brand workspace for one account or organization with any number of independently sourced brand identities. A brand can have several visual variants without copying its asset registry, components, approval history or source evidence. The UI consumes the **existing authorized Brand plugin workspace**, not a local hardcoded list.

## Implemented in the SDK source

- `@inneranimalmedia/agentsam-brand/workspace` is a pure, Node/browser-safe API (no provider credentials, storage binding or Sharp import).
- `normalizeBrandWorkspace(result)` accepts `brands`, `brandContracts`, `contracts`, or the current `latestContract`. It deduplicates by real source ID and never fabricates a brand when there is no saved identity.
- `brandColors(source, themeId)` accepts role lists and BrandContract's resolved color map, preserves exact source values, supports token aliases and optional per-token theme overrides, and refuses unsupported CSS expressions.
- `renderBrandCoverSvg` creates a deterministic, originally composed SVG from a recorded name, role-based colors and an accessible text/surface contrast pair. It makes no fake logo, returns `null` when the data is insufficient, and never writes/publishes the output.
- `renderCreationTileSvg` supplies five original monochrome line icons with deterministic stipple texture. Tint and ink are caller-supplied values; the function does not hardcode a brand palette.
- `agentsam-settings` now renders a brand selector with actual records and five clickable sections: **Overview, Assets, Sources, Usage, Review**. Its overview shows a preview cover and recorded colors only; missing sources and unapproved identity are surfaced.
- The existing Brand & Design page can navigate directly to the Brand plugin workspace through a new generic Settings-host callback. This is navigation, not permission elevation.
- The Settings frontend bundles the pure Brand workspace subpath at build time. Brand is a **development-only dependency** in this package, not a second installed app/runtime.

## Source/read shape

A connected plugin may return `latestContract` (existing compatibility), or a multi-brand collection. Multi-brand providers should return actual identity records, not UI mock data.

```json
{
  "workspaceId": "ACCOUNT_OR_WORKSPACE_ID",
  "activeBrandId": "ID_OF_AN_EXISTING_BRAND",
  "brands": [
    {
      "id": "EXISTING_BRAND_ID",
      "name": "RECORDED_BRAND_NAME",
      "status": "draft",
      "contract": {},
      "tokens": {
        "color": [
          { "name": "ink", "value": "#111111", "usage": "Body text" }
        ]
      },
      "assets": [],
      "sources": [],
      "themes": []
    }
  ]
}
```

These values are an **illustrative schema**, not records belonging to any customer. A single `latestContract` still renders as one record without a migration or new table.

## Brand identity versus UI themes

`cms_themes` / `cms_theme_preferences` determine **the application appearance**. A BrandContract or a `brand.pack.json` defines **a brand identity**. The latter must not silently overwrite the user's shell theme. An organization's sibling brand may have its own palette and mark, while sharing component structure and workflows with the parent; split into a portable child system only when licensing, distribution, design language or brand governance requires it.

## Design Canvas follow-up (not represented as completed)

1. Make Design Canvas's library consume actual design/design-system artifact records, with ownership, pin/sharing permissions and durable thumbnail references.
2. Render each **Design** thumbnail from that design's saved artboards, not from a stock illustration. Render **Design System** thumbnails from their approved or explicitly preview-status cover document, not fabricated brand palettes.
3. Use these token-derived tile SVGs for the five optional creation cards. Their colors and icons must be resolved from the active approved design system or UI theme. No forced create modal.
4. Connect Brand source selection, approved fonts/logo assets and token editing to the existing Studio artifact and CMS/Workbench contracts. Keep page creation and preview separate from publishing.
5. Persist and version an approved Design System `project/README.md`, `project/tokens.json`, `project/design-system.json` and authorized asset references; generate the cover last, then render a thumbnail from that exact revision.
6. Add a real share/pin authority rather than displaying those filters before their backend exists.
7. Complete source-to-brand creation with the existing `agentsam-brand` adapters and R2 records, not another brand database.

## Required tests before production acceptance

- Reopen every saved brand in the selected account, then switch between at least two real identities without leaking records or changing approvals.
- Source palette matches brand pack or contract exactly, and theme variant changes only declared overrides.
- Missing colors/fonts, invalid aliases, unsafe SVG and missing assets fail honestly.
- Cover output is deterministic and visually acceptable at grid-card, full-cover, dark and light sizes; a generated preview is not marked approved.
- Verify host routing, connected plugin read, authorized document access and responsive layout at 2560×1440 and 390×844.
- Design Canvas's separate artifact library, editor, miniAgentSam selection, media and production-design flows remain independent acceptance work.
- **No SDK fleet-wide publish** is implied by this feature. Release candidates must verify the independent Brand package and its affected Settings consumer only.
