# sections / collection-heading

<!-- agentsam-notes -->
> **Build target: the AgentSam editor.** These controls are a reference spec. Do not link to or name Shopify; see `../../translations.md` (Sidekick = AgentSam and miniAgentSam).
> Owner: existing section/block schema, rendered by renderInspector and renderField in theme-editor.js
> Package: `p-sections-collection-heading` in `swarm/packages.json`
<!-- /agentsam-notes -->

Controls: 13  
Evidence: E041 (evidence/shopify/sections/collection-heading/settings.png)

### Layout

| Label | Type | Options | Observed |
|---|---|---|---|
| Direction | segmented-control | Vertical / Horizontal | ? |
| Alignment | segmented-control | Left / Center / Right | ? |
| Position | select | Top / Center / Bottom / Space between | Center |
| Gap | range-with-numeric-input |  | 12px |

### Size

| Label | Type | Options | Observed |
|---|---|---|---|
| Width | segmented-control | Page / Full | ? |
| Height | select | S06 (6): Auto...Custom | Auto |

### Appearance

| Label | Type | Options | Observed |
|---|---|---|---|
| Background media | segmented-control | None / Image / Video | ? |
| Background color | color-picker |  | Palette color |
| Background overlay | toggle |  | off |

### Borders

| Label | Type | Options | Observed |
|---|---|---|---|
| Style | segmented-control | None / Solid | ? |
| Corner radius | range-with-numeric-input |  | 0px |

### Padding

| Label | Type | Options | Observed |
|---|---|---|---|
| Top | range-with-numeric-input |  | 48px |
| Bottom | range-with-numeric-input |  | 48px |
