# Theme Editor — Save, Publish and Preview Parity Repair Specification

**Date:** 2026-10-10. **First merchant acceptance environment:** FuelNFreetime /shop. **Application owner:** the reusable InnerAnimalMedia Ecommerce CMS. **Status:** merchant observations captured and relevant source paths audited. The header mismatch has not been root-caused; do not claim it has been fixed. This is a repair-ready technical issue and test specification.

## 1. What the screenshots actually prove

The merchant selected the Shop Hero section, changed its background/media, navigated through Publish live, and observed the changed hero on the public /shop page. That is a **successful observed hero change/publish journey**. It is not evidence that the newly added 18 Theme Settings fields are D1-backed, because those fields currently use sessionStorage preview state.

The authenticated editor / preview shows a dark full-width rectangular header. The /shop?preview=1 tab also shows that darker header. The published /shop tab shows a light, rounded/glass-style header while its hero reflects the new published change. These images prove a visible draft-versus-published header mismatch at the time captured, but **do not establish the root cause**. The screenshots also differ in viewport and scroll position; compare under matched dimensions before deciding which breakpoint or header style is implicated.

## 2. P0 — Save must be ready at the first edit

**Merchant requirement:** Editing a real field immediately makes the primary Save CTA plainly actionable. No need to hunt for an action or click a disabled-looking button. Save is a private draft action and must never publish live.

**Current code:** theme-editor.js markSectionDirty() calls setDirty(true); setDirty() enables #te-save when dirty. schedulePrivateAutosave() starts a 900ms timer and saveDraft({automatic:true}) can clear the dirty state, disabling Save again. This can make the CTA seem to disappear before a merchant reaches it. The 900ms automatic save path is also covered by real-browser regression tests and should not be ripped out without a migration plan.

**Implementation direction:** Resolve the split between the merchant's explicit Save affordance and background draft protection. Retain a clear interactive primary Save state during ordinary valid edits, show a truthful Saving/Saved/Failed/Conflict status, and let Save be invoked even when the latest change has already been saved automatically (idempotent confirmation without a fake mutation). A meaningful visual active state should be driven by save status, not by scattered CSS selectors or a timer alone. The button must not go visually inactive while a new edit is unsaved. Under invalid/unimported/generation-locked conditions show the reason immediately.

**Acceptance:** Before edit, after first keystroke, during autosave, after auto success, after explicit Save, on API failure and on version conflict: assert visible button state, keyboard operability, appropriate live-region text and no publication calls. Verify while multiple sections are edited, and a new edit arrives during an in-flight PUT. Retain existing autosave regression tests.

## 3. P0 — Remove the native Publish confirmation dialog

**Merchant requirement:** The toolbar's Save dropdown contains an explicit **Publish live** action. Clicking that deliberate menu action should publish without another browser-native "fuelnfreetime.com says" confirm step. The extra modal feels inconsistent with the custom product, interrupts flow and cannot be styled.

**Current code:** theme-editor.js publishPage() begins with a call to window.confirm("Publish the reviewed draft to the live storefront? This is separate from Save."). This is the source of the exact captured browser confirmation. Other confirm calls are used for unrelated destructive leave/delete actions and are **out of scope** for this repair.

**Implementation direction:** Remove only the redundant Publish live window.confirm, not the menu, draft-save preflight or permission rules. The menu option itself is an explicit publish intent. Close the dropdown after selection, disable duplicate submissions while in flight, save dirty changes first, publish the correct site globals and page revision, and show a product-styled Publishing/Published/Error result. Preserve refusal for a generation-locked, nonpublishable theme, unimported live page or insufficient permissions. Do not make the primary Save button publish.

**Acceptance:** Clicking Save performs draft PUT(s) and never POST publish. Clicking Publish live once performs at most one publish sequence after saving pending edits; no native confirm appears. Menu closes, busy state is available to assistive technology, errors are recoverable, success produces a published revision receipt, and accidental double-clicks do not create concurrent publishes. Verify zero publish requests on Cancel/closed dropdown and on blocked capability.

## 4. P0 — Preview header and published header must agree

**Merchant requirement:** A reviewed draft preview is reliable enough to approve before publishing. The same global header, logo mode, nav, colors, glass/solid background, radius, spacing and motion must resolve on /shop?preview=1 and /shop after the draft is published.

**Known routes:** theme-editor.js refreshPreview() loads /shop?preview=1 into #theme-preview for the Heuristic path and provides a detached View link. The public CMS API backend/cms/api.js tests preview=1, requires an authenticated session and uses getPreviewPage() instead of getPublishedPage(). Public published responses use getPublishedPage() and cache headers. A discrepancy in header global sections, versioned CSS assets, theme identity, publish linkage, layout breakpoint or cache therefore needs systematic inspection; none is yet proven to be the cause.

**Reproduction/diagnostic protocol:**
1. Use the same browser/device width, zoom, authentication, scroll position and active theme for /shop?preview=1 and /shop. Capture both computed header style and DOM structure before and after publishing.
2. Record the exact CMS page and site/global header revision read by the preview and published resolvers: header definition ID, section key, settings JSON/R2 hash, publication version, theme preset, design tokens and resolved media IDs. Do not log private credentials.
3. Compare server HTML, injected/linked CSS and header variant classes. Confirm whether the draft applies the intended glass/rounded variant or the live page loads a separate legacy hardcoded header. Check style priority and selectors before editing theme defaults.
4. Verify public caching and draft auth behavior separately. Never fix the mismatch by exposing authenticated preview content to public cache or by overwriting a published global with a draft unintentionally.
5. After the chosen correction, save the hero and a header-only change privately, review both routes, publish, reload without cache tricks, compare pixel appearance, then restore the previous revision.

**Acceptance:** The global header matches visually and semantically between the authenticated draft preview and the resulting live revision at the same viewport. The published page never silently picks different design tokens from the preview, and the preview never displays the wrong global header state. A test must cover both a page-level hero edit and a global header edit; test mobile and desktop.

## 5. Important publication scope / globals

Current publishPage() first saves pending dirty content. If siteDraftTouched is true, it publishes the global "site" page via /api/admin/cms/pages/site/publish, then publishes the active page via /api/admin/cms/pages/{slug}/publish. There is a real risk of unintentionally publishing unrelated global drafts if that flag is too broad. Verify exact changed site sections and publication scope before simplifying UI. Preview and live header must resolve the same versioned globals.

Changes to /shop hero and Theme Settings are separate types of edit. The old hero publishing success must not be used as evidence that Logo & favicon, Colors, Typography or any of the other 18 Theme Settings are already persisted to D1. That global settings integration is Phase 2 and should use existing CMS authority, typed schemas and non-destructive migration only if strictly needed.

## 6. Verification matrix for next engineering pass

| Journey | Expected result | Required evidence |
|---|---|---|
| Edit Hero background | Save is immediately ready; draft preview updates | Browser recording, dirty state, draft PUT, D1/R2 version |
| Wait for autosave | Explicit Save remains understandable and usable | Timed screenshot and status; no live publication |
| Click primary Save | Private draft only | No publish API request; reload readback |
| Click small arrow → Publish live | Exactly one explicit publish sequence; **no native confirm** | Browser recording and network count |
| Preview /shop?preview=1 | Authenticated current draft globals and hero | DOM/CSS/asset IDs and screenshot |
| Compare live /shop after publish | Same intended header preset and hero | Matched-viewport before/after screenshots |
| Restore previous CMS revision | Prior header/hero restored correctly | Versioned restore receipt and public readback |
| Edit Theme Settings | Clearly remains preview-only until Phase 2 | No false "saved merchant settings" UI claims |

No code deploy may implicitly publish CMS drafts. A release receipt must include commit, Worker deployment ID/version, real served frontend assets, tests, direct D1/R2 readback when changed, hosted screenshots, any remaining blocker and merchant acceptance result. "Merged", "deployed" and "merchant accepted" are distinct statuses.

## 7. Scope guard

Do not introduce another theme editor, second backend, new standalone settings database or wholesale TypeScript rewrite to address these UX problems. Work in the existing Theme Editor, the existing CMS globals/revisions/renderer and their tests. Keep tenant-neutral code reusable. All original content, Hero scenes, background media, GLBs, sections, motion and packaged themes must be preserved throughout diagnosis.
