# sections / header

<!-- agentsam-notes -->
> **Build target: the AgentSam editor.** These controls are a reference spec. Do not link to or name Shopify; see `../../translations.md` (Sidekick = AgentSam and miniAgentSam).
> Owner: existing section/block schema, rendered by renderInspector and renderField in theme-editor.js
> Package: `p-sections-header` in `swarm/packages.json`
> Note: Links to account, language and market settings = AgentSam admin settings routes (greenfield). See translations.md.
<!-- /agentsam-notes -->

Controls: 25  
Evidence: E046 (evidence/shopify/sections/header/settings-expanded.png)

### Logo

| Label | Type | Options | Observed |
|---|---|---|---|
| Position | segmented-control | Left / Center / Right | ? |

### Menu

| Label | Type | Options | Observed |
|---|---|---|---|
| Position | segmented-control | Left / Center / Right | ? |
| Row | segmented-control | Top / Bottom | ? |

### (unparsed group)

| Label | Type | Options | Observed |
|---|---|---|---|
| Customer account menu | toggle |  | off |
| Flag | toggle |  | off |
| Language selector | toggle |  | on |
| Font | select | Heading / Subheading / Body / Accent | Heading |
| Size | select | S04 (5): 10px...18px | 14px |
| Position | segmented-control | Left / Right | ? |
| Row | segmented-control | Top / Bottom | ? |

### Search

| Label | Type | Options | Observed |
|---|---|---|---|
| Search icon | toggle |  | on |
| Position | segmented-control | Left / Right | ? |
| Row | segmented-control | Top / Bottom | ? |

### Localization

| Label | Type | Options | Observed |
|---|---|---|---|
| Country/Region | toggle |  | on |

### Appearance

| Label | Type | Options | Observed |
|---|---|---|---|
| Width | segmented-control | Page / Full | ? |
| Height | segmented-control | Compact / Standard | ? |
| Sticky header | select | Always / On scroll up / Never | Always |
| Border thickness | range-with-numeric-input |  | 0px |

### Utilities

| Label | Type | Options | Observed |
|---|---|---|---|
| Menu style | segmented-control | Icons / Text | ? |

### Colors

| Label | Type | Options | Observed |
|---|---|---|---|
| Top row background | color-picker |  | Palette color |
| Top row text | color-picker |  | Default |

### Cart bubble

| Label | Type | Options | Observed |
|---|---|---|---|
| Bubble style | segmented-control | Default / Custom | ? |

### Home page

| Label | Type | Options | Observed |
|---|---|---|---|
| Transparent background | toggle |  | off |

### Product page

| Label | Type | Options | Observed |
|---|---|---|---|
| Transparent background | toggle |  | off |

### Collection page

| Label | Type | Options | Observed |
|---|---|---|---|
| Transparent background | toggle |  | off |
