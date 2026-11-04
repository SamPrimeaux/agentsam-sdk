# theme / Badges

<!-- agentsam-notes -->
> **Build target: the AgentSam editor.** These controls are a reference spec. Do not link to or name Shopify; see `../../translations.md` (Sidekick = AgentSam and miniAgentSam).
> Owner: theme settings bridge: theme-settings-live.js with CmsThemeSettings; field definitions in theme-settings-panel.js are reference only (not loaded)
> Package: `p-theme-badges` in `swarm/packages.json`
<!-- /agentsam-notes -->

Controls: 8  
Evidence: E066 (evidence/shopify/theme/badges/expanded.png)

### Badges

| Label | Type | Options | Observed |
|---|---|---|---|
| Position on cards | select | Bottom left / Top left / Top right | Top right |
| Corner radius | range-with-numeric-input |  | 100px |

### Colors

| Label | Type | Options | Observed |
|---|---|---|---|
| Sale badge background | color-picker |  | Palette color |
| Sale badge text | color-picker |  | Palette color |
| Sold out badge background | color-picker |  | #EEF1EA |
| Sold out badge text | color-picker |  | Palette color |

### Typography

| Label | Type | Options | Observed |
|---|---|---|---|
| Font | select | Body / Subheading / Heading / Accent | Body |
| Case | segmented-control | Default / Uppercase | ? |
