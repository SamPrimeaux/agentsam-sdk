# blocks / email-signup

<!-- agentsam-notes -->
> **Build target: the AgentSam editor.** These controls are a reference spec. Do not link to or name Shopify; see `../../translations.md` (Sidekick = AgentSam and miniAgentSam).
> Owner: existing section/block schema, rendered by renderInspector and renderField in theme-editor.js
> Package: `p-blocks-email-signup` in `swarm/packages.json`
<!-- /agentsam-notes -->

Controls: 20  
Evidence: E023 (evidence/shopify/blocks/email-signup/settings-expanded.png)

### (unparsed group)

| Label | Type | Options | Observed |
|---|---|---|---|
| Width | segmented-control | Fill / Custom | ? |
| Border thickness | range-with-numeric-input |  | 1px |
| Corner radius | range-with-numeric-input |  | 100px |
| Background | color-picker |  | Palette color |
| Text | color-picker |  | Palette color |
| Borders | color-picker |  | Palette color |
| Text preset | select | S05 (8): Default...Heading 6 | Paragraph |
| Link text color | color-picker |  | Default |
| Display | segmented-control | Text / Arrow | ? |
| Integrated button | toggle |  | on |

### Heading

| Label | Type | Options | Observed |
|---|---|---|---|
| Text | text-or-rich-text |  | - |
| Color | color-picker |  | Select |
| Text preset | select | S05 (8): Default...Heading 6 | Heading 3 |

### Input

| Label | Type | Options | Observed |
|---|---|---|---|
| Border | segmented-control | All / Underline / None | ? |
| Style | segmented-control | Default / Custom | ? |

### Submit button

| Label | Type | Options | Observed |
|---|---|---|---|
| Style | select | Primary / Secondary / Link / Custom | Link |

### Padding

| Label | Type | Options | Observed |
|---|---|---|---|
| Top | range-with-numeric-input |  | 0px |
| Bottom | range-with-numeric-input |  | 0px |
| Left | range-with-numeric-input |  | 0px |
| Right | range-with-numeric-input |  | 0px |
