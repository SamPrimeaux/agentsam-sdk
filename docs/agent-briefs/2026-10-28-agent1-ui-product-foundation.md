# AGENT 1 — Product UI owner: Sites, Theme Studio, Ecommerce CMS and Apps

## Mission

Remaster the CURRENT platform surfaces rather than design an unrelated Shopify
clone. Shopify screenshots are an information architecture reference:
active theme hero, discoverable catalog, preview before action, filtered
marketplace, and editor page/template selection. Preserve AgentSam branding,
existing components, genuine packaged assets, routes, working controls and
real data. Deliver usable desktop and mobile CMS flows.

## Start here

- Existing SDK package gallery: apps/ecommerce-cms-agentsam/frontend/static/store.html,
  frontend/static/js/store.js and theme-product-browser.js.
- Existing editor: frontend/static/js/theme-editor.js,
  frontend/static/js/theme-settings-live.js and resolve-theme-settings.js.
- SDK source-backed catalog: packages/catalog/src/theme-products.mjs.
- Original themes: packages/theme-resolve, theme-violet, theme-plain-jane
  and apps/theme-gallery-preview.
- Host CMS routes: app/dashboard/pages/cms/CmsPage.tsx,
  CmsShellLayout.tsx, and studio/StudioCmsHost.tsx.
- CMS navigation compatibility: src/core/agentsam/cms/routing/cms-route.js.
- Existing portable client editor: apps/client-cms-editor frontend.
- Existing SDK local studio: apps/local-studio.
- FNF real preview: /admin/store and /admin/theme-editor on Fuel N Free Time.
- Hosted public-facing Sites surface: /sites. Trace server ownership before
  editing; the screenshot alone does not prove a file/route mapping.

## Deliver the following screens as ONE system

A. Sites home/Online Store:
  top status/actions, valid active theme screenshot when installed,
  separate mobile preview, verified last saved/published state;
  empty theme means a clear setup CTA (Browse / Import / Create).
  Display live metrics only when measured; no blank metric boxes or
  misleading "Active". Do not hide a failed iframe silently.

B. Discover Themes:
  real previews from package catalog, search, industry/category, free/paid
  only when price is known, capability tags, sort, filter counts, site
  compatibility, preview and source/version details. Use stable cards
  from real original theme output, not arbitrary placeholder art.
  Preview / Inspect / Customize draft are distinct from Install / Publish.
  Product not released -> no purchase/install CTA.

C. Theme Studio:
  fixed small toolbar + site and theme picker; editable page/section/block
  left tree with Header / Template / Footer; center real preview; right
  schema-generated inspector. Work with the EXISTING editor as-is and improve
  it in place. A page picker supports Home, Products, Collections, Cart,
  Checkout, Customer accounts, Blogs, Articles, Pages, Search, Password, 404,
  with a Create action on legitimately empty categories.
  Never show a content inspector for a preview-only section as if saving
  will reach D1. Explicitly differentiate draft-only and persisted changes.

D. Global theme settings:
  Dynamic brand name, logo, favicon, palette, contrast, typography,
  layout/canvas, motion, header/footer, buttons, inputs, product cards,
  badges, swatches, variants, search, drawers, cart, checkout and media.
  Each group renders actual schema fields and serializes to the same
  versioned CMS setting record. No inert decorative settings.

E. Apps and product-library foundation:
  Browse / Installed / Updates / Details use the same canonical product
  cards, release version and receipt model as themes. Display capability
  requirements, permissions and connection states; app install is gated.
  Do not introduce a parallel app store data authority.

## Mobile interaction contract

At <= 768px, no fixed three-column workstation. Use canvas-first preview,
a compact route switcher, an optional bottom dock with context actions, and
collapsible single-purpose panels. Left sections and right settings become
one-at-a-time sheets, with persistent selected item and clear close/back.
At tablet widths collapse the least-used rail. Avoid body overflow; nested
previews only scroll inside their clearly bounded container.

Minimum 44x44px touch controls; maintain accessible semantics, visible focus,
keyboard traversal, reduced-motion support and no mobile parallax. Preserve
real editing operations, rather than compress them to icon-only buttons.

## State model, before components

Each site has loading | ready | absent | error for live theme.
Each package has source_only | preview_ready | draft | reviewed | released.
Each site package binding has not_installed | installing | installed |
upgrade_available | failed (only server-authoritative data).
Draft has clean | dirty | saving | saved | save_failed; publishing is
separate and permission-gated.
Preview provenance is stored separately from live identity.

These must be represented consistently in catalog, store dashboard, Studio,
page picker, and Apps. The existing local preview endpoint is strictly
read-only; never promote its "preview_ready" to a customer installation.

## Ordered implementation tasks

1. Map and screenshot actual hosted /sites, FNF /admin/store, SDK local
   /admin/store and all editor entry points with current state and viewport.
2. Fix contradictory state labels, safe loading/error placeholders, retry,
   uninitialized screens and false/no-action buttons.
3. Implement responsive shell. Prove mobile without horizontal overflow.
4. Unify catalog card and resource picker data interfaces; re-use packaged
   Resolve/Violet/Journal previews and version metadata. No API fork.
5. Wire real theme global settings and section/block editing only after
   Agent 2 signs off on the persistence adapter.
6. Build read-only Apps library cards and scope/entitlement states.
7. Submit screenshots, Playwright tests, route/interaction truth matrix and
   a bounded PR; do not deploy or publish without user approval.

## Acceptance demonstration (mandatory)

- New site with no template -> Browse -> preview original Journal ->
  create local draft -> open real article -> select section/block.
- Existing FNF site -> view real active theme and saved version ->
  edit a section -> save draft -> reload to prove persistence ->
  live unchanged until explicitly published.
- Resolve site -> switch among Home/Collections/Account/Cart/Article
  views without loading an unrelated bespoke design.
- Narrow mobile browser -> browse themes, open Studio, navigate sections,
  edit a field, save, return to preview with no horizontal page scrolling.
- Nonworking backend -> honest failure with Retry, no fake "Active" badge.
- All actions tested against actual auth/authorization states;
  preview-only environments may not claim a successful customer write.

## Do not

Do not alter original company/customer logos or replace authentic theme media.
Do not invent filler components that differ from original storefront markup.
Do not modify customer D1/R2 data, rewrite package licenses, create a
second persistence schema, publish or deploy.
