# @inneranimalmedia/agentsam-embeds

Single home for installable storefront embeds: **Form**, **Form popup**, **Online store chat** (inbox) and **AgentSamGrow capture** (feeds `agentsam-campaign`).

- `agentsam.embeds.json` is the only source: each `storefront_embeds[]` entry carries `default_config` and `editor_fields` (the schema the editor's left panel renders).
- Hosts consume it through the CMS catalog generator (`scripts/sync-theme-embed-catalog.mjs`), which installs entries as page-owned `cms_page_sections`. Nothing is copied into the host app.
- `@inneranimalmedia/agentsam-embeds/chat-widget` registers `<agentsam-store-chat config='{...}'>`; colors default to host theme tokens.
- `npm test` validates every embed and its editor fields.

Import `@inneranimalmedia/agentsam-embeds/form-widget` for the inline contact
and Grow signup component. Set the trusted host transport on `submitMessage`
or configure a same-origin endpoint. The transport must return a durable
`{ id, status: "received" | "confirmation_required" }` receipt. Set the chat
element's `products` to site-owned published products before mounting it.
The widget configuration carries presentation. The storefront host is
responsible for the site boundary, consent storage, inbox access and campaign
delivery. Forms and chat preserve entries when a submission fails.
