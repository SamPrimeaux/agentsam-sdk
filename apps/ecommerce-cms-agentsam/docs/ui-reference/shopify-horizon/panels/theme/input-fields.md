# theme / Input fields

<!-- agentsam-notes -->
> **Build target: the AgentSam editor.** These controls are a reference spec. Do not link to or name Shopify; see `../../translations.md` (Sidekick = AgentSam and miniAgentSam).
> Owner: theme settings bridge: theme-settings-live.js with CmsThemeSettings; field definitions in theme-settings-panel.js are reference only (not loaded)
> Package: `p-theme-input-fields` in `swarm/packages.json`
<!-- /agentsam-notes -->

Controls: 6  
Evidence: E074 (evidence/shopify/theme/input-fields/expanded.png)

### Input fields

| Label | Type | Options | Observed |
|---|---|---|---|
| Background | color-picker |  | Palette color |
| Text | color-picker |  | Palette color |
| Borders | color-picker |  | Palette color |
| Border thickness | range-with-numeric-input |  | 1px |
| Corner radius | range-with-numeric-input |  | 4px |
| Text preset | select | S05 (8): Default...Heading 6 | Paragraph |
