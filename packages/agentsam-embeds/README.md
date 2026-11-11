# @inneranimalmedia/agentsam-embeds

Single home for installable storefront embeds: **Form**, **Form popup**, **Online store chat** (inbox) and **AgentSamGrow capture** (feeds `agentsam-campaign`).

- `agentsam.embeds.json` is the only source: each `storefront_embeds[]` entry carries `default_config` and `editor_fields` (the schema the editor's left panel renders).
- Hosts consume it through the CMS catalog generator (`scripts/sync-theme-embed-catalog.mjs`), which installs entries as page-owned `cms_page_sections`. Nothing is copied into the host app.
- `@inneranimalmedia/agentsam-embeds/chat-widget` registers `<agentsam-store-chat config='{...}'>`; colors default to host theme tokens.
- `npm test` validates every embed and its editor fields.
