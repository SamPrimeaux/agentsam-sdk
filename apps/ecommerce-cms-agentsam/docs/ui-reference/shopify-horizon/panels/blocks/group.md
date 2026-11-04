# blocks / group

<!-- agentsam-notes -->
> **Build target: the AgentSam editor.** These controls are a reference spec. Do not link to or name Shopify; see `../../translations.md` (Sidekick = AgentSam and miniAgentSam).
> Owner: existing section/block schema, rendered by renderInspector and renderField in theme-editor.js
> Package: `p-blocks-group` in `swarm/packages.json`
<!-- /agentsam-notes -->

Controls: 18  
Evidence: E024 (evidence/shopify/blocks/group/settings-expanded.png)

### Layout

| Label | Type | Options | Observed |
|---|---|---|---|
| Direction | segmented-control | Vertical / Horizontal | ? |
| Alignment | segmented-control | Left / Center / Right | ? |
| Position | select | Top / Center / Bottom / Space between | Center |
| Gap | range-with-numeric-input |  | 6px |

### Size

| Label | Type | Options | Observed |
|---|---|---|---|
| Width | segmented-control | Fit / Fill / Custom | ? |
| Mobile width | segmented-control | Fit / Fill / Custom | ? |
| Height | segmented-control | Fit / Fill / Custom | ? |

### Appearance

| Label | Type | Options | Observed |
|---|---|---|---|
| Background media | segmented-control | None / Image / Video | ? |
| Background color | color-picker |  | Default |
| Background overlay | toggle |  | off |

### Borders

| Label | Type | Options | Observed |
|---|---|---|---|
| Style | segmented-control | None / Solid | ? |
| Corner radius | range-with-numeric-input |  | 0px |

### Block link

| Label | Type | Options | Observed |
|---|---|---|---|
| Link | text-or-rich-text |  | - |
| Open link in new tab | toggle |  | off |

### Padding

| Label | Type | Options | Observed |
|---|---|---|---|
| Top | range-with-numeric-input |  | 0px |
| Bottom | range-with-numeric-input |  | 0px |
| Left | range-with-numeric-input |  | 0px |
| Right | range-with-numeric-input |  | 0px |
