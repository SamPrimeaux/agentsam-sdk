# Existing Theme Studio refinement plan

Planning only. No implementation authorized or performed. All tasks extend current owners. P0 means a current live usability blocker, P1 the next coherent refinement slice, P2 subsequent capability/interaction work. Numbers do not imply new database work.

## Preconditions: make the current surfaces assessable

| Task | Existing target | Evidence / acceptance |
|---|---|---|
| R0.1 Explain and resolve unresolved global-settings presentation | `frontend/static/js/theme-settings-live.js` render/read/update; `theme-editor.js:4509` bridge | Live theme-settings + recheck captures. Determine readiness vs unavailable vs missing global data. End loading with truthful state; no fabricated defaults |
| R0.2 Trace current selected section to its schema fields | `theme-editor.js` currentSectionSchema, schemaForSection, renderInspectorGroups, renderInspector:2045 | Main Hero capture has only CSS. Reuse existing schema/field renderer. A supported existing section must expose its real fields |
| R0.3 Distinguish embed catalog failure from empty/no-results | `theme-embed-review.js` boot/api/renderList/refreshInstalled | Empty catalog capture. Show appropriate state for each outcome without installing anything |

These are bounded frontend/integration investigations. If a backend dependency is confirmed, record it separately with an owner and stop short of unauthorized backend changes.

## Phase 1 — Shared UI primitives

| Task | Existing target | Revision | Acceptance |
|---|---|---|---|
| P1.1 Token and control audit | `css/theme-editor.css`, `theme-settings-live.css`, `theme-settings-panel.css` | Establish current application-owned chrome tokens for heights, gaps, radius, text, border, focus, overlay elevation | One documented token mapping; theme storefront colors do not recolor editor chrome unintentionally |
| P1.2 Menu behavior consolidation | `te-tree-actions`, `toggleToolbarMenu:4200`, closeToolbarMore, open/close theme/page menu | Use the same keyboard, outside-click, focus-return and expanded-state policy | Keyboard open → ArrowDown/Up → Escape returns focus; no destructive action executed during visual QA |
| P1.3 Normalize field rows | `renderField:1814`, `inputFor` in isolated review, live settings render | Share label/help/error/reset anatomy through existing renderers; preserve typed schemas | Text, select, switch, range, color and media variants align without per-setting bespoke components |
| P1.4 Overlay contract | Existing page/catalog/media dialogs and popovers | Standardize anchor fallback, max-height, internal scrolling, dismissal and focus containment | Long content scrolls inside overlay; trigger and footer stay reachable; no nested Escape leak |
| P1.5 State fixtures | Existing `tests/theme-toolbar-behavior.test.mjs`, `theme-settings-panel.test.mjs`, existing browser fixtures | Add only meaningful state coverage for consolidated behavior | Default/focus/active/disabled/empty/loading/error examples are reproducible; no tests that merely mirror markup |

## Phase 2 — Editor navigation and shell

| Task | Existing target | Revision | Acceptance |
|---|---|---|---|
| P2.1 Retain mode context | setEditorDrawer:3840 and drawerScroll | Refine modes without replacing shell or preview | Selection and mode-specific scroll survive round trip; controls remain discoverable on phone |
| P2.2 Tree scan/selection | renderTree:1282 and `.te-tree-row` / field/block rows | Normalize icon/indent/disclosure/hover/selected treatment | Selecting nested content preserves parent context; fixed nodes communicate limits |
| P2.3 Insertion catalog density | renderCatalog:1446 and existing section catalog dialog | Compact grouped list, optional hover/secondary preview, context/all distinction | Large catalog can be searched and scanned; no-match state retains query and clear action |
| P2.4 Page navigator consistency | renderPageOptions:1048, openPageMenu:3920 | Shared row grammar for families, back, current selection and availability | Available and unavailable routes are distinguishable without guessed pages or manufactured resource assignments |
| P2.5 Toolbar/save hierarchy | existing toolbar, More, save menu | Keep save/publish distinction and overflow access consistent | Clean Save disabled; publish remains explicit; no Save label that suggests a private draft is live |

## Phase 3 — Inspector and settings experience

| Task | Existing target | Revision | Acceptance |
|---|---|---|---|
| P3.1 Establish one authoritative global settings presentation | `theme-settings-live.js`, `CmsThemeSettings`, review-panel and Resolve field definitions | Reuse useful definitions while preserving supported installed-theme fields and existing storage bridge | No parallel browser-only settings authority; each displayed control states whether it affects current preview |
| P3.2 Conditional settings | renderInspectorGroups / schema-backed fields | Add uniform visible-when/disabled-help behavior within existing schema contract where supported | Hero-like media mode, custom size and grid/carousel branch changes reveal only relevant fields; hidden values round-trip |
| P3.3 Color control | renderField color branch, live colors, existing theme palette contract | Default/token/custom/transparent variants; one picker overlay and text alternative | Alpha and invalid hex handled; cancel/reset clear; no duplicate palette registry |
| P3.4 Typography control | live Typography group + existing font/settings definitions | Role/family/style/preview/search presentation using allowed fonts | Selection shown before application; current font preserved when source unavailable; no invented font catalog |
| P3.5 Media and links | openMediaPicker:4022 / renderMediaGrid:3957 / renderLinkField:1726 | Normalize resource chip, preview, search, empty, incompatible, loading and error states | Reuse current media store and resource resolver; original media preserved; upload remains explicit |
| P3.6 Inspector context | renderInspector:2045 / parent button / section CSS disclosure | Clear section/block/field title, parent return, inherited/default indication and no-fields explanation | Current selection always understandable; inspector never silently becomes a CSS-only dead end for supported fields |

## Phase 4 — Preview and editor interactions

| Task | Existing target | Revision | Acceptance |
|---|---|---|---|
| P4.1 Preview mapping and geometry | bindPreviewSelection:2994 / highlightPreviewSelection:3078 / scrollPreviewToSelection:2872 | Distinguish hover, selected section, selected block and repeated template | Pointer preview selection and tree selection agree after iframe load, scroll, resize and device switch |
| P4.2 MiniAgentSam placement | existing miniAgentSam open/close and selection context handlers | Keep contextual composer beside selection and out of primary text/actions | No generation on selecting/expanding; no composer overlap that hides selected content |
| P4.3 Responsive editor panes | existing phone pane, sheet-size handlers and `.te-mobile-*` CSS | Refine current one-pane phone model; verify intermediate stacking separately | 320/375/390/430, ~768 and desktop: navigation/Save/selected preview reachable, no document overflow |
| P4.4 Save/history feedback | setSaveState:756, schedulePrivateAutosave:764, history:128, saveDraft:3339 | Normalize dirty/saving/private-saved/error and undo/redo status | Controlled fixture field change → preview → undo → restored clean state; later authorized persistence test separate |

## Phase 5 — Validation

1. Establish a deterministic existing-section fixture and a real authenticated route with known schema-backed fields. Do not make a new demo editor.
2. Capture the same journey at desktop, tablet, and required phone widths: mode → tree → nested block → field → picker → dismiss → back to preview.
3. Verify Tab order, Enter/Space activation, arrow-key menus/selects, Escape topmost dismissal, focus restoration, and visible focus at each overlay type.
4. Check screen-reader naming and state semantics, selected/focused contrast, reduced motion, long labels, empty data, unavailable resources and error recovery. Screenshots alone cannot certify this.
5. Test preview ↔ tree selection and repeated instances under scroll/resize/device switches. Differentiate editor responsiveness from mobile storefront preview width.
6. In a separately authorized disposable fixture, verify actual field persistence/reload, undo/redo and publish boundaries. This read-only report does not authorize writes to prove backend functionality.
7. Use existing tests/fixtures as starting points: `theme-toolbar-behavior`, `theme-settings-panel`, `theme-merchant-settings`, `cms-setting-contract`, `theme-embed-review`, plus current local-studio browser/surface-parity scripts. Source presence is not proof these tests currently pass; none were run in this audit.

## Recommended first coherent slice

R0.1–R0.3 followed by P1.1–P1.4 and P2.1–P2.3. Deliver one verified path using the existing editor: select an existing section → inspect fields → open/dismiss a picker → switch modes → return to the same selection on desktop and phone. Backend-dependent work should be tracked without blocking independently useful control polish. No new CMS version, registry, repository, or framework is needed to begin.
