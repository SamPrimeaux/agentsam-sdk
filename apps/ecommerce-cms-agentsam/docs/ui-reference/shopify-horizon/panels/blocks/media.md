# blocks / media

<!-- agentsam-notes -->
> **Build target: the AgentSam editor.** These controls are a reference spec. Do not link to or name Shopify; see `../../translations.md` (Sidekick = AgentSam and miniAgentSam).
> Owner: existing section/block schema, rendered by renderInspector and renderField in theme-editor.js
> Package: `p-blocks-media` in `swarm/packages.json`
> Note: Ask for changes (Sidekick) = AgentSam (full) and miniAgentSam in the CMS editor.
<!-- /agentsam-notes -->

Controls: 8  
Evidence: E027 (evidence/shopify/blocks/media/settings-expanded.png)

### Displays media from parent product

| Label | Type | Options | Observed |
|---|---|---|---|
| Aspect ratio | select | Auto / Portrait / Square / Landscape | Auto |

### Borders

| Label | Type | Options | Observed |
|---|---|---|---|
| Style | segmented-control | None / Solid | ? |
| Corner radius | range-with-numeric-input |  | 0px |

### Padding

| Label | Type | Options | Observed |
|---|---|---|---|
| Top | range-with-numeric-input |  | 0px |
| Bottom | range-with-numeric-input |  | 0px |
| Left | range-with-numeric-input |  | 0px |
| Right | range-with-numeric-input |  | 0px |
| Ask for changes... | text-or-rich-text |  | - |
