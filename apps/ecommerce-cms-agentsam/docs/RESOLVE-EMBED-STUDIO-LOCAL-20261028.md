# Resolve Theme Studio — local interaction review

## Open
http://127.0.0.1:4357/admin/theme-editor?slug=home&showcase=resolve

Use the existing scripts/preview-sdk-showcase.mjs with PORT=4357. Resolve assets are served directly from apps/theme-gallery-preview/themes/resolve/site, not copied.

## Surfaces
1. Sections rail: Header, Hero, Collections, Editorial, Newsletter, Footer. Each selection sends an iframe message. Missing DOM anchors are shown as Unmapped. Local visibility, padding and background settings are stored in browser localStorage.
2. App embeds rail: manifest-backed announcement bar, announcement popup, contact form, newsletter signup and newsletter modal. Standard right inspector allows local install/uninstall, enable, placement, trigger, delay, text, colors, fields, required flags, double opt-in and previews.
3. Copy preview JSON: exports a proposal shaped for the existing cms_components columns, with provider, status, and settings inside config_json. No new site table is proposed.
4. Checkout and metaobject templates: visibly labeled local UI scaffolds.

## Integration authority
- The SDK root agentsam.app.json owns native announcement/contact embeds.
- The existing apps/resend/agentsam.app.json owns Resend newsletter embeds.
- The Companions newsletter_subscribers production table was checked on 2026-10-28: provider_contact_id TEXT already exists; first_name and last_name remain nullable. Do NOT rerun the ALTER there.
- Newsletter component config defaults to required_fields of email and first_name, double opt-in on. backend/cms/storefront-embed-contract.ts validates form requirements and disallows reactivation of bounced, complained and unsubscribed records. It does not write to a DB.
- A live adapter must load trusted config from cms_components, write consent and source attribution, use a credential-vault Resend connection, and handle provider unsubscribe webhooks.

## Safety and remaining gates
The isolated preview server rejects API mutation requests. The iframe intercepts native form submissions and non-GET fetches. Forms validate locally and do not send email, collect payment, create subscribers or publish. Configuration is browser-local only.

Visual browser QA, screenshots, authenticated cms_components CRUD, real Resend test sends and webhook sync are still pending. The Mac Chrome headless launch aborted in this session, so these are not claimed verified.
