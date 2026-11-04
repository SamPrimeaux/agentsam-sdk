# sections / collection

<!-- agentsam-notes -->
> **Build target: the AgentSam editor.** These controls are a reference spec. Do not link to or name Shopify; see `../../translations.md` (Sidekick = AgentSam and miniAgentSam).
> Owner: existing section/block schema, rendered by renderInspector and renderField in theme-editor.js
> Package: `p-sections-collection` in `swarm/packages.json`
<!-- /agentsam-notes -->

Controls: 13  
Evidence: E040 (evidence/shopify/sections/collection/settings.png)

### General

| Label | Type | Options | Observed |
|---|---|---|---|
| Type | segmented-control | Grid / Editorial | ? |
| Card size | select | Small / Medium / Large / Extra large | Medium |
| Mobile card size | segmented-control | Small / Large | ? |
| Auto load products on scroll | toggle |  | on |

### Layout

| Label | Type | Options | Observed |
|---|---|---|---|
| Width | segmented-control | Page / Full | ? |
| Full width on mobile | toggle |  | on |
| Horizontal gap | range-with-numeric-input |  | 16px |
| Vertical gap | range-with-numeric-input |  | 24px |
| Left padding | range-with-numeric-input |  | 0px |
| Right padding | range-with-numeric-input |  | 0px |

### Section layout

| Label | Type | Options | Observed |
|---|---|---|---|
| Background color | color-picker |  | Palette color |
| Top padding | range-with-numeric-input |  | 0px |
| Bottom padding | range-with-numeric-input |  | 32px |
