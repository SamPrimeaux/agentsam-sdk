# Ecommerce CMS / Theme Studio — 18-panel component specification

**As inspected:** 2026-10-10. **Owner:** InnerAnimalMedia reusable Ecommerce CMS, developed and accepted first in FuelNFreetime. **Status:** implemented and browser-tested as frontend preview; D1/R2-backed global Theme Settings are NOT implemented. Do not claim full merchant persistence from the current fixtures.

## 1. Source of truth and design boundaries

- Frontend definitions, field keys, defaults, events and sample preview: apps/ecommerce-cms-agentsam/frontend/static/js/theme-settings-panel.js.
- Shared inspector control geometry, states, focus, mobile and modal presentation: apps/ecommerce-cms-agentsam/frontend/static/css/theme-settings-panel.css.
- Editor boot order: apps/ecommerce-cms-agentsam/frontend/static/theme-editor.html, loading the main theme-editor.js before theme-settings-panel.js.
- Separate CMS draft, section history, inspector, preview and publication code: apps/ecommerce-cms-agentsam/frontend/static/js/theme-editor.js and backend/cms/api.js.
- Existing content/definition/style authority: cms_pages, cms_page_sections, cms_section_blocks, cms_globals, cms_definitions, cms_artifacts, cms_revisions and existing media authority. Inspect actual schemas before migrations; never add opportunistic duplicate CMS tables.
- Tests: apps/ecommerce-cms-agentsam/tests/theme-settings-panel.test.mjs, tests/theme-settings-panel-browser-smoke.mjs, apps/ecommerce-cms-agentsam/tests/theme-toolbar-behavior.test.mjs and tests/cms-live-source-browser-smoke.mjs.

**Merchant principle:** A prepackaged theme provides defaults, never locked styling. Global token changes must update inheriting controls without destroying per-section or per-block overrides. The intended resolution is theme defaults → component defaults → merchant overrides → responsive overrides, with Reset deleting only the applicable override.

**Current implementation boundary:** ThemeSettingsPanel.getState() reports sessionStorage and published=false. localKey() is namespaced ia:theme-ui-review:v1 by selected theme name and page slug. This is browser-session demonstration state, NOT a CMS draft. The toolbar Save button does not persist these settings. Selected example images, fixture collections and preview interactions do not modify R2, D1 or public commerce data.

## 2. Shared UI component contract

The rail contains exactly 18 accordion categories in the order below. Only one opens at a time; opening a second closes the first; clicking the active heading collapses all. The up-chevron, visual highlight, aria-expanded=true, hidden=false, aria-hidden=false and inert=false must be synchronized. The component's openCategory(key) owns the active key, never multiple booleans. Switching categories preserves inputs and should preserve the clicked row's scroll position.

All categories use the same 46px accordion row, two-column settings grid, 34px selects, 35-by-21px switches, segmented button groups, slider plus synchronized numeric input and unit, color-chip field, focus ring, tooltips and group separators. Keyboard Tab, Enter, Space, Escape and visible focus should be tested consistently. No visually improvised one-off control variants, invisible horizontal overflow or truncated unhelpful labels. Device widths are validated with 1440, 834 and 390px screenshots.

Field descriptors are declared using sw (switch), co (color), sl (bounded numeric range), se (select), seg (segmented options), f (media/resource/name/code), group and help. fieldMap/defaults/state/set/sync are the current review-state foundation. They should later be derived from one runtime-validated installed-theme definition, not inferred from JavaScript values. Shared dialog supports Apply, Cancel, Escape, X and focus return. Apply modifies preview values; Cancel leaves original values unchanged. Category demonstrations are sample-only. Whitelisted preview CSS currently updates only select visual properties; it does not prove that every setting changes a live FNF component.

## 3. Complete panel catalog

### 01 — Logo and favicon / brand
**Purpose:** Site and header identity. **Controls:** brand.name Manage store name; brand.default default logo media; brand.inverse inverse logo media; brand.favicon media. Includes help explaining inverse use on transparent headers. **Current frontend:** name dialog; bundled sample-image or local-file picker, Replace/Remove and local media preview. **Backend acceptance:** real merchant identity and R2 media references, true favicon and mobile header application, correct normal/inverse logo selection, asset validation and version history. Never rewrite the original packaged media.

### 02 — Color palette / palette
**Purpose:** Reusable shared swatches with linked roles. **Controls:** palette.colors and palette.0–.3 initially #FFFFFF, #000000, #303030, #DADADA; Add creates extra swatch slots. **Current frontend:** palette editor and color picker with hex/native input; paletteLinks allows color-role linkage, separate from literal hex values. **Backend acceptance:** stable swatch IDs, theme-scoped inheritance, unlink/reset, contrast/accessibility, one coherent revision and live reflection across native and generated sections; changing a linked swatch must not overwrite a local literal color.

### 03 — Typography / type
**Purpose:** Sitewide text roles and reusable presets. **Controls:** type.text; type.font.Body, Subheading, Heading, Accent (review font options Inter/Arial/Georgia/System sans-serif); type.p.size (14px) and type.p.line (Loose); type.h1–h6 each has .font, .size, .line, .spacing, .case. H1–H6 starting sizes: 56, 48, 32, 24, 14, 12px. Line choices Tight/Normal/Loose, letter spacing Tight/Normal/Wide, case Default/Uppercase. **Current frontend:** one type hierarchy sample, not all storefront typography bindings. **Backend acceptance:** actual font source and role resolution, semantic headings/paragraphs, rich-text compatibility, mobile scaling, complete preset propagation, instance override and reset.

### 04 — Page / page
**Purpose:** Global page background and container width. **Controls:** page.bg white and page.width Narrow/Standard/Wide/Full width (Narrow default). **Current frontend:** sample-width diagram. **Backend acceptance:** actual layout tokens for responsive gutters, max-width and full-bleed layouts, preview/live parity.

### 05 — Animations / motion
**Purpose:** Global motion defaults. **Controls:** motion.page (off); motion.product product-card-to-PDP (off); motion.cart Add to cart (on); motion.hover None/Subtle lift/Image zoom/Soft fade. **Current frontend:** a sample animated/focusable card with Play transition and status indicators. **Backend acceptance:** real scene support, bounded timing/easing, meaningful effect per actual component, reduced-motion accessibility, no unsupported fake toggles.

### 06 — Badges / badges
**Purpose:** Sale and sold-out presentation. **Controls:** badges.position Top left/Top right/Bottom left/Bottom right (Top right); badges.radius 100px; badges.saleBg white; saleText black; soldBg #EEF1EA; soldText black; badges.font role Body; badges.case Default/Uppercase. **Current frontend:** static sale/out-of-stock examples. **Backend acceptance:** real discount/inventory status, collision-free placements, readable labels and valid contrast on product imagery.

### 07 — Buttons / buttons
**Purpose:** Global primary/secondary/pill defaults, with per-instance control. **Controls for each of buttons.primary, buttons.secondary, buttons.pills:** .bg, .text, .border, .borderW (0–10px), .radius (0–100px), .font (Body/Accent), .case (Default/Uppercase); buttons.pills.active Solid/Outline. Primary default black/white, no border, 14px radius; secondary transparent/black, 1px border, 14px radius; pill light-gray/black, 1px border, 100px radius. **Current frontend:** clickable styled samples. **Backend acceptance:** actual CTA rendering, hover/focus/disabled variants, inheritance and reset. A merchant override to one CTA never changes the sibling or packaged default.

### 08 — Cart / cart
**Purpose:** Cart display and optional merchant features. **Controls:** cart.type Page/Drawer (Drawer); cart.title case; cart.priceFont role (Subheading); cart.auto auto-open (off); cart.note (off), cart.discount (on), cart.installments (on), cart.accelerated (on); cart.empty link; cart.mediaBorder None/Solid; cart.mediaRadius 0px. **Current frontend:** sample cart totals and simulated overlay only. **Backend acceptance:** integrate existing commerce cart and account scope; real provider support and localized totals, not mock checkout; accessible drawer focus/Escape; actual link selection.

### 09 — Drawers / drawers
**Purpose:** Shared storefront drawer styling. **Controls:** drawers.bg white, drawers.text black, drawers.border #DDDDDD. **Current frontend:** preview drawer example. **Backend acceptance:** actual cart/mobile-nav/registered drawers. Do not turn the CMS editor's fixed three-column inspector itself into a slide-out drawer.

### 10 — Icons / icons
**Purpose:** Consistent stroke for supported native glyphs. **Controls:** icons.stroke Thin/Default/Heavy. **Current frontend:** scaled icon sample. **Backend acceptance:** consistent icon geometry across supported components without overriding custom merchant SVGs or the reusable AgentSam brand symbol.

### 11 — Input fields / inputs
**Purpose:** Shared form control styles. **Controls:** inputs.bg white; inputs.text #303030; inputs.border #DDDDDD; inputs.thickness 1px (0–10); inputs.radius 4px; inputs.preset Paragraph or Heading 1–6. **Current frontend:** text/email/disabled/invalid samples. **Backend acceptance:** real input labels, focus/validation/error/disabled semantics, merchant-facing forms and mobile targets.

### 12 — Popovers and modals / overlays
**Purpose:** Layered surfaces without divergent native browser UI. **Controls:** overlays.bg white, text black, radius 14px, border #DDDDDD, thickness 1px, shadow on, shadowColor black. **Current frontend:** clickable simulated popover/modal with keyboard close behavior. **Backend acceptance:** one shared primitive, correct overlay positioning, focus containment and return, escape/click-outside policy, reduced motion, correct responsive presentation.

### 13 — Prices / prices
**Purpose:** Toggle currency code at designated output locations. **Exactly four switches:** prices.product off, prices.cards off, prices.items off, prices.total on. **Current frontend:** "$45.00" fixtures with optional USD. **Backend acceptance:** render actual merchant currency/locale from commerce authority; changes to display formatting must never mutate price values or currency configuration.

### 14 — Product cards / cards
**Purpose:** Card content, look and interactions. **Controls:** cards.quick true, cards.mobileQuick false, cards.bg white, cards.text black, cards.second image-on-hover true, cards.carousel true. **Current frontend:** fixture product card with click/hover and simulated quick add. **Backend acceptance:** actual product IDs, variants, media states, available actions, keyboard and mobile behavior. No fixture data hardcoded into reusable product defaults.

### 15 — Search / search
**Purpose:** Search popover and empty-state catalog recommendation. **Controls:** search.empty collection resource; search.productRadius 0px; search.cardRadius 4px; search.title Default/Uppercase. **Current frontend:** single local fixture query and sample resource-picker choices. **Backend acceptance:** real account-scoped indexed search, collection IDs, zero-result/loading states, keyboard search/selection, accurate accessible results.

### 16 — Swatches / swatches
**Purpose:** Present material/color/image variant choices. **Controls:** swatches.images false; width 34px (18–72); height 34px (18–72); radius 32px; borders None/Solid (Solid); thickness 1px (0–8); opacity 10% (0–100). **Current frontend:** selected/unavailable mock swatches; local sample images. **Backend acceptance:** real available variants, linked product imagery, focus/disabled/selected states, selection drives correct product/variant state.

### 17 — Variant pickers / variants
**Purpose:** Global picker surface and selection styles. **Controls:** variants.bg white, text black, border #DDDDDD; selectedBg black, selectedText white, selectedBorder black; thickness 1px (0–10); radius 14px; width Fit/Fill (Fill). **Current frontend:** Small/Medium/Large mock buttons. **Backend acceptance:** real option combinations, stock/sale state, option selection, responsive layout and correct binding to swatches.

### 18 — Custom CSS / css
**Purpose:** Advanced merchant styling without modifying the distributed theme source. **Control:** css.source, an editable source area with simple sample CSS and visual syntax highlighting. **Current frontend:** text is retained in review state but is explicitly NOT injected into the admin or public storefront. **Backend acceptance:** safe syntax/selector validation, scoped artifact preparation, versioned draft preview, restore, audit and publication through existing approved theme authoring contract. Never evaluate arbitrary JS.

## 4. Media and structured resource rules

Image, video and model3d/GLB are separate media kinds under the same reusable media authority; GLB must not be misrepresented as an image or video. Logo/favicon pickers use supported images, whereas a 3D-aware section should later use the appropriate model3d media field and renderer. Collection, article, product, page and structured metaobject selections must resolve real resource IDs with account/site permissions; plain fixture labels are not authority. Templates, definitions, placed sections, nested blocks, structured records and design tokens remain separate concerns. No wholesale Liquid conversion.

## 5. Phase 2 binding contract

1. Load the installed theme's schema and current merchant/global values from existing versioned CMS authority; do not infer types from initial values.
2. Render the identical inspector controls already established; every value has inherited, overridden and responsive override states. Reset deletes only the applicable override.
3. Apply changes to the draft preview immediately. Save through the authenticated CMS draft/revision endpoint with optimistic concurrency, and verify D1/R2 readback.
4. Reload in a new session and confirm values persist. Publish explicit reviewed revision; verify public route matches draft preview (global header included). Restore an earlier revision to prove rollback.
5. In native and AgentSam-generated blocks use the same schema, inspector, persistence and inheritance semantics. If a component lacks a runtime capability, mark it unsupported rather than pretending it works.
6. Protect source assets, published customer content, tenant scope and existing working paths. FNF is only the first consuming installation, never the package's hardcoded identity.

## 6. Acceptance and release evidence

The current 12 unit/control tests, desktop/tablet/mobile Chromium screenshot workflow and admin build cover the **frontend preview**, not production persistence. Expand with a real authenticated merchant browser journey: change every field type, verify immediate storefront preview, Save, reload, Reset, publish, compare published HTML/CSS, restore revision; test keyboard, focus, reduced-motion, errors/409 and cross-tenant isolation. Publish must not silently occur during code deployment; saving a draft must not automatically publish it.

**Handoff checkpoint:** source commit and build, actual Worker version, exact APIs called, D1/R2 readback, hosted screenshots, cases passed and failed, user-observed acceptance. "All accordion headings exist" and "CI is green" are never sufficient to mark the settings system complete.

See companion document EDITOR-SAVE-PUBLISH-PREVIEW-TRIAGE-2026-10-10.md for issues confirmed by the new merchant screenshots and specific repair acceptance.
