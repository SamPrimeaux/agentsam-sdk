# @inneranimalmedia/theme-resolve

**Resolve** is an AgentSam prebuild for luxury commerce / editorial.

Quiet luxury. Loud interaction design.

A high-fashion commerce prebuild built around cinematic scroll, shoppable editorial, sticky purchase rails, lookbooks, stories, bundles, and micro-interactions that make the storefront feel directed instead of assembled.

Demo identity: **Resolve Atelier**. The demo content is fictional and exists to show the layout, interaction, and content system without carrying customer branding forward.

The complete built platform ships in `site/`; installation does not depend on the AgentSam gallery or a sync step.

## Customer storefront and portal (local-first)

Resolve ships a **portable multi-page portal** in `site/portal/` with a single
route/configuration authority in `src/portal-templates.mjs`.

The portal provides: three collections and individual collection pages, products and product details, gift cards, search, checkout preview, editorial/blogs, a 404 template, structured metaobject preview, storefront password
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

### Resolve authenticity and catalog sync

The customer routes live **inside the packaged Resolve theme**, not as an unrelated
new commerce theme. The portal imports the original Resolve compiled CSS, reuses
its capsule navigation system, Cormorant/Geist typography, black/white/oxblood
editorial treatment, and **actual package-owned editorial media**. The original
Resolve React storefront in site/index.html and its compiled JS remain unchanged.

The original compiled React demo contains 13 product examples. Their ID, names,
price, category, description and linked original media paths are extracted into
site/portal/catalog.js using npm run sync:demo-catalog (Python available at dev
build time). This is not a production inventory feed. Never generate imaginary
products when original Resolve data is available. The local preview uses those
examples, while live inventory must come from an authorized tenant catalog.

The AgentSam SDK local Theme Studio opens Resolve by default on bare localhost
editor links. It exposes **21 draft-only page templates**, section selection,
editable text/media/spacing/visibility, additive sections and the same app-embed
bridge for the original home and all customer routes. No D1, Stripe, or login
backend is written from the local preview.

### Local merchant studio controls

The ecommerce CMS's localhost editor adds a named draft creation flow for pages,
products, collections, blogs, articles, and metaobjects, plus an 18-category
appearance inspector. This is an editor extension of Resolve's existing
package, not a separately branded replacement. The shared preview settings script
inside site/portal/preview-settings.js applies to both packaged storefront and
customer pages. It uses validated fields and safely filtered optional CSS,
respects reduced motion, and never loads credentials or sends payments.

Drafts and global settings persist only in the browser-local Resolve studio
record. The publish button is disabled in local showcase mode. Production CMS
settings continue to use the original authenticated brand-section adapter.
