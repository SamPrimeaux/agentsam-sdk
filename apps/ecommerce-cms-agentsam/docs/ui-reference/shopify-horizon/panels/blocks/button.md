# blocks / button

<!-- agentsam-notes -->
> **Build target: the AgentSam editor.** These controls are a reference spec. Do not link to or name Shopify; see `../../translations.md` (Sidekick = AgentSam and miniAgentSam).
> Owner: existing section/block schema, rendered by renderInspector and renderField in theme-editor.js
> Package: `p-blocks-button` in `swarm/packages.json`
<!-- /agentsam-notes -->

Controls: 9  
Evidence: E020 (evidence/shopify/blocks/button/settings-expanded.png)

### General

| Label | Type | Options | Observed |
|---|---|---|---|
| Label | text-or-rich-text |  | - |
| Link | text-or-rich-text |  | - |
| Open link in new tab | toggle |  | off |
| Style | select | Primary / Secondary / Link / Custom | Custom |

### Button colors

| Label | Type | Options | Observed |
|---|---|---|---|
| Background | color-picker |  | Transparent |
| Text | color-picker |  | Palette color |
| Borders | color-picker |  | Palette color |

### Size

| Label | Type | Options | Observed |
|---|---|---|---|
| Desktop width | segmented-control | Fit / Custom | ? |
| Mobile width | segmented-control | Fit / Custom | ? |
