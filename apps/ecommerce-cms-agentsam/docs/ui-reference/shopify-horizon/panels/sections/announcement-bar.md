# sections / announcement-bar

<!-- agentsam-notes -->
> **Build target: the AgentSam editor.** These controls are a reference spec. Do not link to or name Shopify; see `../../translations.md` (Sidekick = AgentSam and miniAgentSam).
> Owner: existing section/block schema, rendered by renderInspector and renderField in theme-editor.js
> Package: `p-sections-announcement-bar` in `swarm/packages.json`
<!-- /agentsam-notes -->

Controls: 7  
Evidence: E039 (evidence/shopify/sections/announcement-bar/settings-expanded.png)

### General

| Label | Type | Options | Observed |
|---|---|---|---|
| Time to next announcement | range-with-numeric-input |  | 5sec |

### Appearance

| Label | Type | Options | Observed |
|---|---|---|---|
| Section width | segmented-control | Page / Full | ? |
| Background color | color-picker |  | Palette color |
| Divider thickness | range-with-numeric-input |  | 1px |
| Divider color | color-picker |  | Palette color |

### Padding

| Label | Type | Options | Observed |
|---|---|---|---|
| Top | range-with-numeric-input |  | 15px |
| Bottom | range-with-numeric-input |  | 15px |
