# Theme Studio mobile layout — regression register and acceptance contract

Status: **Open until verified on a real iPhone in regular Safari.** Applies to the reusable, customer-neutral `apps/ecommerce-cms-agentsam` editor. FuelNFreetime is its first customer acceptance case, not a hardcoded default.

## Ownership and non-regression rules

- **Preserve:** top page-first toolbar, Undo/Redo, Gorilla Side Assistant button, canvas inspection, Sections / Preview / Edit tabs, existing separate admin dock, header/footer/global editing, draft/save/undo, the real miniAgentSam composer and Side Assistant.
- **Only one viewport sizing authority.** The shared shell and Theme Studio must not independently subtract `visualViewport.height` from `100dvh`, stack `calc(100dvh - 56px/165px/170px)`, or add speculative negative margins to cover a browser-owned area.
- **Browser-first, not Home Screen app.** Normal iPhone Safari is the primary gate. `viewport-fit=cover` should remain; avoid standalone web-app metadata as a workaround.
- **Do not invent app-space to force Safari's native floating address bar to disappear.** Distinguish visually: computed tab-bottom vs visualViewport bottom, actual document overflow, and the platform-owned gray/address-bar region. iOS browser chrome is not an editor DOM child.
- The active scrollable pane must respond to native touch and support scroll handoff at its boundary. Do not disable overscroll globally, capture body touch gestures, fake an extra spacer/scroll runway, or break Safari's natural gestures.
- The selected storefront element must remain identifiable while editing; don't let the Hero / Edit selection handle obscure the section CTA or miniAgentSam hide the top toolbar.
- No duplicated inspector or composer; one selection state, one draft state, and one authoritative inspector that changes presentation on mobile. Any code changes must be confined to the shared editor, not tenant templates.
- Never claim this problem is fixed solely because Chromium and static CSS assertions are green. Actual Safari visual acceptance remains required.

## Defects and tracking

| ID | Observation / expected behavior | Current status |
| --- | --- | --- |
| MOB-01 | Repeated tall gray region under the three-tab navigation and above Safari's floating address bar, across Home, Shop and other pages. Reproduce in normal Safari; measure browser vs DOM and scroll collapse. | Open: browser-owned area suspected; no source-backed proof that it can be recovered |
| MOB-02 | Earlier height fixes fought: shell `100dvh`, JS `visualViewport` subtraction, fixed pane heights, duplicated overrides and panel bottoms. Must have a single ownership contract. | Partially mitigated in PRs #107/#108; refactor and device verification pending |
| MOB-03 | Sections, preview iframe, and inspector have nested `overflow: hidden/auto` and `overscroll-behavior: contain`, potentially preventing Safari toolbar collapse. | Scroll chaining adjustment in this branch; real Safari outcome unverified |
| MOB-04 | A persistent Hero / Edit selection card can cover a storefront CTA. Selection-specific positioning must avoid selected content and not replace the three tabs. | Open |
| MOB-05 | Contextual miniAgentSam can appear over the top page/save toolbar on mobile. It should stay within the visible preview, clear of the mobile tabs, even when selected content fills the screen. | Bounds contract and actual browser assertion in this branch; pending CI and iPhone |
| MOB-06 | Large editing sheet leaves insufficient view of selected heading/image, particularly when keyboard opens. Preserve compact, balanced and expanded states plus scroll position. | Open visual acceptance |
| MOB-07 | Raw asset URLs and “Source details” in everyday inspector are still unnecessary merchant-facing complexity; asset library should own original/link and manual URL entry. | Open — don't add another permanent dropdown |
| MOB-08 | Media gallery previews sometimes compress instead of displaying thumbnails in their proper aspect ratio; 3D model assets need a model-aware preview. | Picker image aspect-ratio fix and batched card rendering proposed in PR #113. Pending GitHub CI and actual iPhone Safari acceptance; model-aware previews remain open. |
| MOB-09 | Internal theme preview labels, separate whole-theme variants, and sparse Add Section catalog should evolve toward interchangeable reusable sections with visual previews (Shopify-grade). | Open — no source/publishing rewrite authorized |
| MOB-10 | Mobile editor must not drift into duplicated mockup-only interactions. Require touch and Save/reload validations in real pages for heading styles, section reorder, asset selection, Header/Footer, miniAgentSam. | Open acceptance |
| MOB-11 | CSS contains overlapping mobile declarations, fixed inspector offsets and `!important` sizing; a single layout contract is preferable to additional overrides. | Open technical debt |

## 2026-10-13 follow-up: dashboard-versus-editor evidence and concrete shared-shell mismatch

Two side-by-side iPhone Safari screenshots show the normal dashboard content and its preserved mobile dock extending lower into the available page than Theme Studio's white Sections / Preview / Edit tab row. The issue is **not** unique to a merchant page or hero. Earlier accounts that treated the entire gap as unreachable native Safari chrome were incomplete.

Source inspection found that `frontend/static/css/console.css` reserves `calc(100dvh - var(--c-topbar-h))` for every full-bleed `.console-main--bleed`. The normal dashboard mounts a top bar, whereas `frontend/shell.js` omits that top bar for `shell-mode-theme-editor`. This branch adds an exact editor-specific override to remove the hidden header's reservation while retaining the header deduction elsewhere.

The added browser fixture compares the exact shared shell class combinations, verifies the editor's tab row reaches the shell bottom and confirms an ordinary dashboard still preserves its own topbar layout. The *real iPhone Safari result remains the final acceptance gate*. If a residual gap remains, capture computed shell/main/tab rectangles and `visualViewport` and distinguish it from browser-owned chrome; do not blindly add another `100dvh`/negative-offset rule.

## Physical iPhone Safari release gate

1. Confirm which Git SHA and Worker deployment version the live editor actually serves before screenshots. Compare in an ordinary Safari tab, **not** installed as a web app.
2. At widths 320, 360, 375, 390 and 430 CSS pixels (emulator coverage supplemental), record `window.innerHeight`, `window.visualViewport?.height`, `visualViewport?.offsetTop`, `.theme-studio`, `.console-shell`, `.te-mobile-pane-switch` and the bottom of the visible page. Report a DOM-owned gap separately from native Safari chrome.
3. Swipe the real Sections list, page preview and inspector: verify scrolling, address bar expansion/collapse (if permitted by Safari), intact selection state and no horizontal scroll.
4. Open miniAgentSam beside selected heading and CTA: its composer must not cover the top toolbar, bottom tabs or selection, and selecting alone must not send a model request.
5. Open the inspector, keyboard and media picker: preview retains usable context, active field remains visible, and saving/reloading persists changes.
6. Verify desktop three-rail layout and existing admin dock are unchanged.

## Product Studio / Completeful — **separate sprint**, from 2026-10-13 supporting handoff

These issues came in the accompanying Product Studio notes and must not be silently merged into Theme Studio work: approved garment Front/Back image authority and Comfort Colors 1717 visual regression; stock/mockup role/variant/location mappings in Completeful, D1/R2 provenance; shared Product Studio miniAgentSam toggle currently located too low in the workspace and missing structured selected-artwork context; misleading **“Connect Completeful fulfillment”** wording for an existing supplier-product creation/link action. Treat Completeful as an installed provider adapter, not a mandatory merchant reconnect wizard. Preserve the original catalog assets and test them in their own Product Studio sprint. No Completeful code changes are authorized by this Theme Studio layout branch.

## Historical caution

PRs #100/#102 restored editor capabilities, #103 established the page-first mobile toolbar, #105 refined media inspector and sheets, #107 added an ultimately unwanted standalone-app path, and #108 removed its competing viewport cap. Passing CI did not resolve MOB-01 on the physical iPhone. Never revive stale CSS/JS patches from those branches without checking present `main`.
