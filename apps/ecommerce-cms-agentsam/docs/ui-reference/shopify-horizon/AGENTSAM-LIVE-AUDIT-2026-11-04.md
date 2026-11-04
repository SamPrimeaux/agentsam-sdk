# AgentSam live UI audit against the Horizon editor baseline

Audit date: 2026-11-04
Target repo: `SamPrimeaux/agentsam-sdk`, current local checkout on `main`
Baseline: Horizon editor control reference captured 2026-11-03 (version 4.4.0)
Scope: the current CMS Collections Studio and Theme Editor routes, plus their local source and data ownership. This is an implementation audit, not a claim of complete control parity.

## Acceptance rule

Treat the captured editor as the interaction and control baseline: a supported control must be visible in the right context, editable, saved to the selected site's draft, reflected in preview, and retained after reload. A screenshot, a static control inventory, an empty-looking category, or a label saying “UI scaffold” does not count as a completed workflow. Reuse AgentSam's current CMS site/page/section/block authorities, preview renderer, settings bridge, and save/publish path. Do not create parallel registries or a detached editor.

The Horizon capture inventory contains 401 controls across 43 panels. Its own coverage notes mark the inventory incomplete for some long-panel lower scrolls, keyboard/focus states, picker submodes, responsive sizes, and dynamic data states. It is a baseline for required behavior, not proof that every hidden state is captured.

## Verified findings

### Collections Studio

- The authenticated production `/admin/collections` route loads a collection directory; `/admin/collections/new` loads the existing five-tab editor (Overview, Products, Presentation, Rules, SEO). This is the correct FNF flow to keep extending in the current editor.
- The selected production site showed zero collections. Shared D1 evidence also showed zero records for that selected site; the empty state is valid and must not be “fixed” by copying collections from another site.
- The “Scaffold draft products” UI was wired to a frontend adapter that always threw `Manufacturer draft scaffolding is not connected for this site.` This made the visible action non-functional. The source change now adds the authenticated Product Studio route, uses the selected `CMS_SITE_CONTEXT`, reads the plan from `cms_collections.metadata_json`, calls the existing Product Studio draft validator, and adds products to `cms_collection_items`. It preserves draft-only behavior, collection/account/site ownership, and does not publish or place supplier orders.
- Presentation initially leaked an FNF-specific `F&FT` wordmark and orange default into the transplanted editor. The wordmark is removed and new collection defaults now use the AgentSam blue accent; saved collection colors remain intact. Site-theme-derived palette resolution is still needed before the presentation presets can claim full portability.
- Save and publish are explicit controls. Scaffold first saves the collection plan as a draft, then refreshes products and memberships. This order is retained.

### Theme Editor

- The live app exposes the established Sections / Theme settings / App embeds work areas with a real preview and a section tree. Preserve that shell and its existing settings/renderer owners.
- The production `theme-project-editor` route was observed showing “UI scaffold” labels in the page picker for gift card, cart, checkout/customer accounts, search, password, 404, and metaobject templates. These are unfinished customer-facing paths and fail the no-placeholder acceptance rule until each is implemented end to end or removed from the selectable route list.
- The older parity report describes a live Theme settings loading state and a Main Hero inspector with only Custom CSS. Those observations are time- and route-specific. A later local fixture recheck loaded settings categories, but only Colors, a single Body font control, Buttons corner radius, Custom CSS, and several unbound categories; this fixture is not production evidence. Do not present either observation as current production status without rechecking the exact route and revision.
- The separate local URL on port 58712 was a disposable development fixture. It is not the production route and cannot be used as deployment proof.

## Release-blocking gaps

1. **End-to-end Theme Editor controls:** for every supported Horizon control, bind to the existing theme setting or section schema, save a private draft, update the actual preview, reload, and confirm persistence. No dead, fake, or “awaiting bindings” controls.
2. **Contextual section inspector:** selecting an existing schema-backed section must expose its declared fields with the correct typed control, validation, media/resource picker, and preview effect. Empty states must distinguish unsupported schema from loading/error.
3. **Global theme settings:** reconcile the shipped settings bridge with the 43-panel inventory. Cover all supported categories using actual theme tokens and allowed choices. Bounds must use `ranges.md`; unknown bounds remain unverified instead of guessed.
4. **Template coverage:** remove scaffold-labelled paths from the customer-facing picker until routes have an editable, previewable, saveable template backed by the canonical page/template system.
5. **Responsive/keyboard interaction:** inspect 320, 375, 390 and 430 CSS px, tablet and desktop, keyboard focus/order/dismissal, all menus/pickers and save reachability. No horizontal document scroll or compressed/unreachable editor panes.
6. **Portable collection branding:** replace FNF-specific labels and defaults with the selected site's active brand/theme tokens, while retaining the FNF Collections Studio information hierarchy and merchandising workflow.

## Evidence and scope limits

- `INDEX.md`, `controls.ndjson`, `panels/`, `ranges.md`, `gaps.md`, `translations.md`, and `shared-groups.md` preserve the captured baseline and operating notes.
- `05-AgentSam-UIUX-Parity-Matrix.md` and `06-Implementation-Plan.md` retain the prior source-to-reference mapping and suggested sequence. This audit corrects their time-sensitive live observations above.
- `02-Screenshot-Catalog.md` documents the source capture set. `evidence/agentsam-studio/` contains selected prior AgentSam review captures for default, Main Hero, Theme settings recheck, insertion catalog, phone width, and App embeds.
- The authenticated Fuel N Free Time live admin was not accessed; its local source was read-only. No FNF files or records were changed.
- No production writes or deployments were made during this audit. The draft scaffolding route is implemented only in the local `agentsam-sdk` checkout until the local diff is committed and the project is shipped.

## Current change verification

- `node --check apps/ecommerce-cms-agentsam/backend/admin/product-studio.js`: passed.
- `tsc -p apps/ecommerce-cms-agentsam/frontend/tsconfig.app.json --noEmit --incremental false`: passed.
- `node --test apps/ecommerce-cms-agentsam/tests/cms-collections-alignment.test.mjs apps/ecommerce-cms-agentsam/tests/product-studio-preparation-state.test.mjs`: 10 passed, 0 failed.
- These checks do not replace a browser demonstration of draft creation, product membership, repeated-run reuse, and selected-site isolation. That route requires a local/staging provider catalog fixture before acceptance; no real supplier-backed products were created during this audit.
