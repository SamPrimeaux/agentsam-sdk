# blocks / announcement

<!-- agentsam-notes -->
> **Build target: the AgentSam editor.** These controls are a reference spec. Do not link to or name Shopify; see `../../translations.md` (Sidekick = AgentSam and miniAgentSam).
> Owner: existing section/block schema, rendered by renderInspector and renderField in theme-editor.js
> Package: `p-blocks-announcement` in `swarm/packages.json`
<!-- /agentsam-notes -->

Controls: 8  
Evidence: E019 (evidence/shopify/blocks/announcement/settings-expanded.png)

### General

| Label | Type | Options | Observed |
|---|---|---|---|
| Text | text-or-rich-text |  | - |
| Link | text-or-rich-text |  | - |

### Typography

| Label | Type | Options | Observed |
|---|---|---|---|
| Font | select | Body / Subheading / Heading / Accent | Subheading |
| Size | select | S01 (17): Default...184px | 12px |
| Weight | select | S02 (8): Default...Black | Default |
| Letter spacing | segmented-control | Tight / Normal / Loose | ? |
| Case | segmented-control | Default / Uppercase | ? |

### Appearance

| Label | Type | Options | Observed |
|---|---|---|---|
| Text color | color-picker |  | Default |
