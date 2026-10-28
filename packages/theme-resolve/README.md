# @inneranimalmedia/theme-resolve

**Resolve** is an AgentSam prebuild for luxury commerce / editorial.

Quiet luxury. Loud interaction design.

A high-fashion commerce prebuild built around cinematic scroll, shoppable editorial, sticky purchase rails, lookbooks, stories, bundles, and micro-interactions that make the storefront feel directed instead of assembled.

Demo identity: **Resolve Atelier**. The demo content is fictional and exists to show the layout, interaction, and content system without carrying customer branding forward.

The complete built platform ships in `site/`; installation does not depend on the AgentSam gallery or a sync step.

## Customer storefront and portal (local-first)

Resolve ships a **portable multi-page portal** in `site/portal/` with a single
route/configuration authority in `src/portal-templates.mjs`.

The portal provides: collections, an individual collection, storefront password
experience, customer sign-in, sign-up, dashboard, orders, saved items, profile and
cart. It uses dynamic brand tokens (name, logo asset URL, burgundy accent, gradient,
glass opacity and parallax), with reduced-motion support.

`createTheme().portalTemplates` exposes the stable CMS page draft descriptors.
Each draft maps to a `cms_pages` template key and ordered `cms_page_sections`
keys. Installation must supply an authenticated `account_id` and create private
drafts before any real publication. The SDK local preview **does not** write D1.

Materialization expands each route into a physical
`portal/<route>/index.html` and rewrites its base URL, so deep-link refreshes
work on ordinary static hosts without requiring a catch-all rewrite. The
`portal.js` client navigates those routes with the History API.

### Customer authentication boundary

The forms render email/password/name inputs, but **never authenticate users or
store passwords**. The sample customer has a visibly marked demo session in
sessionStorage. The example orders and catalog are fictional; preview carts and
saved items are session-only. A host must implement production signup/signin,
password reset, CSRF protections, secure server-side sessions, tenant-scoped
orders, inventory-priced carts and Stripe payments before switching from preview.

The CMS inspector edits appearance/interaction in the existing local Theme Studio
and can export a draft JSON proposal. It is not a substitute for a permissioned
customer-account backend.
