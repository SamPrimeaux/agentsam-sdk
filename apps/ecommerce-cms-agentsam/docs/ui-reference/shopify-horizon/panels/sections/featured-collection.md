# sections / featured-collection

<!-- agentsam-notes -->
> **Build target: the AgentSam editor.** These controls are a reference spec. Do not link to or name Shopify; see `../../translations.md` (Sidekick = AgentSam and miniAgentSam).
> Owner: existing section/block schema, rendered by renderInspector and renderField in theme-editor.js
> Package: `p-sections-featured-collection` in `swarm/packages.json`
<!-- /agentsam-notes -->

Controls: 16  
Evidence: E042 (evidence/shopify/sections/featured-collection/carousel-conditional.png), E043 (evidence/shopify/sections/featured-collection/editorial-conditional.png), E044 (evidence/shopify/sections/featured-collection/settings-expanded.png)

### General

| Label | Type | Options | Observed |
|---|---|---|---|
| Collection | toggle |  | off |
| Type | select | Grid / Carousel / Editorial | Carousel |
| Product count | range-with-numeric-input |  | 8 |
| Columns | range-with-numeric-input |  | 4 |
| Mobile columns | segmented-control | 1 / 2 | ? |
| Horizontal gap | range-with-numeric-input |  | 8px |
| Carousel on mobile | toggle |  | off |
| Vertical gap | range-with-numeric-input |  | 24px |

### Carousel navigation

| Label | Type | Options | Observed |
|---|---|---|---|
| Icon | select | S07 (5): Arrows...None | Arrows |
| Icon background | segmented-control | None / Circle / Square | ? |

### Section layout

| Label | Type | Options | Observed |
|---|---|---|---|
| Width | segmented-control | Page / Full | ? |
| Alignment | segmented-control | Left / Center / Right | ? |
| Gap | range-with-numeric-input |  | 28px |
| Background color | color-picker |  | Palette color |

### Padding

| Label | Type | Options | Observed |
|---|---|---|---|
| Top | range-with-numeric-input |  | 48px |
| Bottom | range-with-numeric-input |  | 48px |
