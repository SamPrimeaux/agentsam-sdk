# Resolve customer portal — local acceptance handoff

## Review URLs on the iMac

Theme Studio: http://127.0.0.1:4357/admin/theme-editor?slug=resolve-sign-in&showcase=resolve

Standalone previews (same theme package):
- /themes/resolve/demo/portal/password
- /themes/resolve/demo/portal/customer/sign-in
- /themes/resolve/demo/portal/customer/sign-up
- /themes/resolve/demo/portal/collections
- /themes/resolve/demo/portal/collections/atelier
- /themes/resolve/demo/portal/cart
- /themes/resolve/demo/portal/customer/account
- /themes/resolve/demo/portal/customer/orders
- /themes/resolve/demo/portal/customer/saved
- /themes/resolve/demo/portal/customer/profile

## What is editable now
- Switch real portal pages in the existing Theme Studio top dropdown.
- Section tree has route-specific stable section keys. Click to highlight/scroll the DOM.
- Right inspector controls dynamic brand name, logo URL, tagline, accent, gradient, glass, pointer parallax, spacing/visibility and signup/password/guest checkout toggles.
- Local brand and section settings persist in the browser; the inspector can copy draft JSON.
- Cart, saved products, filters and explicit 'Explore demo account' are interactive in the standalone theme preview.

## Authority and migration
The single page-template contract lives in packages/theme-resolve/src/portal-templates.mjs.
The SDK preview server exposes each as a draft-only response at /api/admin/cms/pages/resolve-*.
Each draft uses page_type standard, template_key resolve/*, and ordered section keys.
Do not treat fixture IDs as production IDs or assume anonymous customer data.

No real CMS or customer DB was modified. A later authenticated adapter should map these
specs to tenant-owned cms_pages and cms_page_sections, reconcile existing slugs/versions,
and transact only private drafts. Account/customer auth must be separate from admin auth.

## Release gates
- Browser screenshot QA (Chrome headless could not launch from this Mac tunnel).
- Account auth with secure password hashing/verified email, reset, CSRF and rate limits.
- Customer ownership of orders, carts and saved items, tax/inventory price reconciliation.
- Form validation server-side and consent handling.
- Authenticated CMS save/publish and tenant permission checks.
- Manual end-to-end checkout and account QA before any public launch.
