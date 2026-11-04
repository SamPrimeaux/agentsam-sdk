# blocks / price

<!-- agentsam-notes -->
> **Build target: the AgentSam editor.** These controls are a reference spec. Do not link to or name Shopify; see `../../translations.md` (Sidekick = AgentSam and miniAgentSam).
> Owner: existing section/block schema, rendered by renderInspector and renderField in theme-editor.js
> Package: `p-blocks-price` in `swarm/packages.json`
> Note: Shop Pay and accelerated checkout = checkout wallet buttons through Stripe checkout. Do not mention Shop Pay.
<!-- /agentsam-notes -->

Controls: 10  
Evidence: E030 (evidence/shopify/blocks/price/settings-expanded.png)

### (unparsed group)

| Label | Type | Options | Observed |
|---|---|---|---|
| Show sale price first | toggle |  | on |
| Show Shop Pay payment options | toggle |  | off |
| Tax information | toggle |  | off |
| Width | segmented-control | Fit / Fill | ? |

### Typography

| Label | Type | Options | Observed |
|---|---|---|---|
| Preset | select | S03 (9): Default...Custom | Heading 6 |

### Appearance

| Label | Type | Options | Observed |
|---|---|---|---|
| Text color | color-picker |  | Default |

### Padding

| Label | Type | Options | Observed |
|---|---|---|---|
| Top | range-with-numeric-input |  | 0px |
| Bottom | range-with-numeric-input |  | 0px |
| Left | range-with-numeric-input |  | 0px |
| Right | range-with-numeric-input |  | 0px |
