# sections / hero

<!-- agentsam-notes -->
> **Build target: the AgentSam editor.** These controls are a reference spec. Do not link to or name Shopify; see `../../translations.md` (Sidekick = AgentSam and miniAgentSam).
> Owner: existing section/block schema, rendered by renderInspector and renderField in theme-editor.js
> Package: `p-sections-hero` in `swarm/packages.json`
> Note: Ask for changes (Sidekick) = AgentSam (full) and miniAgentSam in the CMS editor.
<!-- /agentsam-notes -->

Controls: 30  
Evidence: E047 (evidence/shopify/sections/hero/color-overlay-open.png), E048 (evidence/shopify/sections/hero/context-menu.png), E049 (evidence/shopify/sections/hero/custom-css.png), E050 (evidence/shopify/sections/hero/custom-height.png), E051 (evidence/shopify/sections/hero/menu-keyboard-focus.png), E052 (evidence/shopify/sections/hero/mobile-media-conditional.png), E053 (evidence/shopify/sections/hero/settings-expanded.png), E054 (evidence/shopify/sections/hero/video-conditional-dirty.png)

### Media 1

| Label | Type | Options | Observed |
|---|---|---|---|
| Type | segmented-control | Image / Video | ? |
| Upload images | toggle |  | off |
| Video | toggle |  | off |

### Media 2

| Label | Type | Options | Observed |
|---|---|---|---|
| Type | segmented-control | Image / Video | ? |
| Upload images | toggle |  | off |

### Mobile media

| Label | Type | Options | Observed |
|---|---|---|---|
| Stack media | toggle |  | off |
| Show different media on mobile | toggle |  | off |

### Section link

| Label | Type | Options | Observed |
|---|---|---|---|
| Link | text-or-rich-text |  | - |
| Open link in new tab | toggle |  | off |

### Layout

| Label | Type | Options | Observed |
|---|---|---|---|
| Direction | segmented-control | Vertical / Horizontal | ? |
| Align text baseline | toggle |  | on |
| Alignment | segmented-control | Left / Center / Right | ? |
| Position | select | Top / Center / Bottom / Space between | Bottom |
| Gap | range-with-numeric-input |  | 24px |
| Width | segmented-control | Page / Full | ? |
| Height | select | S06 (6): Auto...Custom | Medium |
| Custom height | range-with-numeric-input |  | 50% |

### Appearance

| Label | Type | Options | Observed |
|---|---|---|---|
| Background color | color-picker |  | Transparent |
| Media overlay | toggle |  | on |
| Overlay color | color-picker |  | #121212 |
| Overlay style | segmented-control | Solid / Gradient | ? |
| Blurred reflection | toggle |  | off |

### Padding

| Label | Type | Options | Observed |
|---|---|---|---|
| Top | range-with-numeric-input |  | 100px |
| Bottom | range-with-numeric-input |  | 72px |

### Custom CSS

| Label | Type | Options | Observed |
|---|---|---|---|
| Ask for changes... | text-or-rich-text |  | - |
| 1 | text-or-rich-text |  | - |

### Mobile media 1

| Label | Type | Options | Observed |
|---|---|---|---|
| Type | segmented-control | Image / Video | ? |
| Upload images | toggle |  | off |

### Mobile media 2

| Label | Type | Options | Observed |
|---|---|---|---|
| Type | segmented-control | Image / Video | ? |
| Upload images | toggle |  | off |
