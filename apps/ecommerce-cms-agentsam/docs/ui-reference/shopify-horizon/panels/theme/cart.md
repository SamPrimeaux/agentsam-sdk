# theme / Cart

<!-- agentsam-notes -->
> **Build target: the AgentSam editor.** These controls are a reference spec. Do not link to or name Shopify; see `../../translations.md` (Sidekick = AgentSam and miniAgentSam).
> Owner: theme settings bridge: theme-settings-live.js with CmsThemeSettings; field definitions in theme-settings-panel.js are reference only (not loaded)
> Package: `p-theme-cart` in `swarm/packages.json`
> Note: Shop Pay and accelerated checkout = checkout wallet buttons through Stripe checkout. Do not mention Shop Pay.
<!-- /agentsam-notes -->

Controls: 10  
Evidence: E068 (evidence/shopify/theme/cart/expanded.png)

### Cart

| Label | Type | Options | Observed |
|---|---|---|---|
| Type | segmented-control | Page / Drawer | ? |
| Product title case | segmented-control | Default / Uppercase | ? |
| Price font | select | Body / Subheading / Heading / Accent | Subheading |

### Cart features

| Label | Type | Options | Observed |
|---|---|---|---|
| Allow note to seller | toggle |  | off |
| Allow discounts in cart | toggle |  | on |
| Show Shop Pay payment options | toggle |  | on |

### (unparsed group)

| Label | Type | Options | Observed |
|---|---|---|---|
| Accelerated checkout buttons | toggle |  | on |
| Empty cart button link | text-or-rich-text |  | - |

### Product media

| Label | Type | Options | Observed |
|---|---|---|---|
| Border style | segmented-control | None / Solid | ? |
| Corner radius | range-with-numeric-input |  | 0px |
