# theme / Buttons

<!-- agentsam-notes -->
> **Build target: the AgentSam editor.** These controls are a reference spec. Do not link to or name Shopify; see `../../translations.md` (Sidekick = AgentSam and miniAgentSam).
> Owner: theme settings bridge: theme-settings-live.js with CmsThemeSettings; field definitions in theme-settings-panel.js are reference only (not loaded)
> Package: `p-theme-buttons` in `swarm/packages.json`
<!-- /agentsam-notes -->

Controls: 15  
Evidence: E067 (evidence/shopify/theme/buttons/expanded.png)

### Primary button

| Label | Type | Options | Observed |
|---|---|---|---|
| Background | color-picker |  | Palette color |
| Text | color-picker |  | Palette color |
| Borders | color-picker |  | Palette color |
| Border thickness | range-with-numeric-input |  | 0px |
| Corner radius | range-with-numeric-input |  | 14px |
| Font | segmented-control | Body / Accent | ? |
| Text case | segmented-control | Default / Uppercase | ? |

### Secondary button

| Label | Type | Options | Observed |
|---|---|---|---|
| Background | color-picker |  | Transparent |
| Text | color-picker |  | Palette color |
| Borders | color-picker |  | Palette color |
| Border thickness | range-with-numeric-input |  | 1px |
| Corner radius | range-with-numeric-input |  | 14px |
| Font | segmented-control | Body / Accent | ? |
| Text case | segmented-control | Default / Uppercase | ? |

### (unparsed group)

| Label | Type | Options | Observed |
|---|---|---|---|
| Corner radius | range-with-numeric-input |  | 40px |
