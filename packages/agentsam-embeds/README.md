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

## Online store chat as a template

`store_chat` is configured entirely through `default_config` / `editor_fields`; no code changes per site.

| Group | Settings |
| --- | --- |
| Launcher | `style`, `label`, `icon` (`chat_bubble`, `message`, `help`, `image`), `image`, `icon_color`, `icon_background`, positions |
| Messages | `header_label`, `greeting`, `placeholder`, `email_label`, `message_label`, `send_label`, `success_message`, `require_email` |
| Colors | `accent`, `background`, `font_color`, `invert_colors` (empty = host theme token) |
| Typography and shape | `font_family` (`inherit`, `system`, `serif`, `rounded`, `mono`), `heading_weight`, `font_size`, `border_radius` |
| Chat window | `header_style` (`filled`, `plain`), featured products |

`image` accepts a site-local path (`/media/...`) or an `https:` URL. Anything else is ignored. The editor uploads through the site's media library (`POST /api/admin/media`) and stores the returned path.
