# blocks / menu

<!-- agentsam-notes -->
> **Build target: the AgentSam editor.** These controls are a reference spec. Do not link to or name Shopify; see `../../translations.md` (Sidekick = AgentSam and miniAgentSam).
> Owner: existing section/block schema, rendered by renderInspector and renderField in theme-editor.js
> Package: `p-blocks-menu` in `swarm/packages.json`
<!-- /agentsam-notes -->

Controls: 13  
Evidence: E028 (evidence/shopify/blocks/menu/settings-expanded.png)

### General

| Label | Type | Options | Observed |
|---|---|---|---|
| Menu | toggle |  | off |

### (unparsed group)

| Label | Type | Options | Observed |
|---|---|---|---|
| Background color | color-picker |  | Palette color |
| Text color | color-picker |  | Default |
| Image ratio | select | Auto / Portrait / Square | Portrait |
| Image corner radius | range-with-numeric-input |  | 0px |

### Typography

| Label | Type | Options | Observed |
|---|---|---|---|
| Top level size | select | S04 (5): 10px...18px | 14px |
| Submenu size | select | Small / Medium / Large | Medium |
| Font | select | Body / Subheading / Heading / Accent | Body |
| Case | segmented-control | Default / Uppercase | ? |

### Submenu feature

| Label | Type | Options | Observed |
|---|---|---|---|
| Media type | select | None / Collection images / Featured products / Featured collections | Featured products |

### Mobile layout

| Label | Type | Options | Observed |
|---|---|---|---|
| Navigation bar | toggle |  | off |
| Accordion | toggle |  | off |
| Dividers | toggle |  | off |
