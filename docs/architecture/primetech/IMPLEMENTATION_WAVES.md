# PrimeTech implementation waves — ordered engineering instructions
**Status:** Planned / TODO unless explicitly labeled repository-identified.  
**Execution priority:** CAD Creator is Lane 1. SamSketch is Lane 2. Shared infrastructure is Lane 0 and must be exercised immediately in the active product; it is not a pretext for months of untested abstraction.  
**Scope guard:** These waves add a portable editor UX system, not a new global shell, second geometry kernel, duplicate media catalog or rewritten app-specific document model.

## Wave overview

| Wave | Primary lane | Visible result required to exit | State |
| --- | --- | --- | --- |
| W00 — Inventory and contract reconciliation | Lane 0 + CAD | Audited owner-by-owner command/precision matrix and baseline recordings | TODO |
| W01 — Native CAD-first shared workspace slice | Lane 1 + Lane 0 | CAD Create menu, contextual toolstrip, responsive dock and one native operation | TODO |
| W02 — CAD precision and source authority | Lane 1 | Native wall lifecycle, authoritative inspector, source-gated review, 2D/3D/Split, save/reopen | TODO |
| W03 — SamSketch second consumer | Lane 2 + Lane 0 | Same shared components; real vector/object editing, undo/redo, save/reopen | TODO |
| W04 — Universal property and viewport depth | Lanes 1 + 2 | Precision field family and per-pane camera/scene controls reusable by other engines | TODO |
| W05 — Assets, templates and type | Lanes 1 + 2 | Real searchable object/asset/template browsers and licensed font workflows | TODO |
| W06 — Scenes, animation and data bindings | Eligible engine lanes | Real camera/light/material/environment runtime paths; no phantom event toggles | TODO |
| W07 — Adoption, packaging and release acceptance | All consumers | Independently installable UI, human acceptance and deployed build proof | TODO |

Work on a focused branch/PR per wave. Where dependencies permit, split specialist implementations from shared infrastructure without removing working controls before their replacement is proven.

---

## W00 — Audit and baseline (do before moving source)

**Owner:** Lane 0 architecture with Lane 1 CAD command inventory first.  
**Entry:** Current GitHub main and working hosted CAD route are available.

### Instructions
- [ ] Confirm current repository head and all existing `design-workspace` contracts/exports. Map existing component owner, app importer, domain authority and feature tests.
- [ ] Audit every visible CAD toolbar, Quick Add row, inspector tab, project selector, grid/snap control, 2D/3D/Split pane, environment field, source warning and keyboard shortcut to its actual onClick/handler. Include current asset catalog endpoint and its authorization.
- [ ] Audit native CAD wall/geometry create/update/save operations, exact unit representation, object IDs, source revision model, undo/redo and native-versus-imported classification. Record whether each operation is working, partial, source-gated or absent.
- [ ] Audit SamSketch `main.ts`, `design-adapter.ts`, `native-scene-editor.ts`, settings drawer, gallery, text/typeface, material, vector/node tools, scene profiles and real persistence. Do not conflate screenshot controls with persisted edits.
- [ ] Inspect package exports, style dependency graphs, component tests, PR #711 patch and current theme provider. Enumerate literal-color violations by file.
- [ ] Inventory existing camera, environment, IAMScene animation, CoPro, fonts, asset catalogs and media services before adding equivalents.
- [ ] Record desktop baseline at 2560×1440 and mobile 390×844; include panel dimensions, dark/light/custom, collapsed/opened controls, long project tree and view-only sources.
- [ ] Build `command-capability-audit.md` as a *generated* implementation artifact: ID, display label, owning file, handler, engine, permission, revision check, units, shortcut, undo policy, persistence, status, evidence link.

### Exit gate
A traceable source-to-click map exists; each implemented command has a handler and persistence claim verified or marked unknown. No proposal claims an unverified modeling operation works.

## W01 — CAD proves the shared shell and Create contract

**Owner:** Lane 1 CAD + Lane 0 Workbench.  
**Goal:** The first real reusable improvement is installed and used *inside CAD Creator*, not demonstrated only in a component sandbox.

### Contract/package work
- [ ] Add `editor-commands.ts`, `editor-command-context.ts`, `editor-capabilities.ts` and `editor-session.ts` with tests under `packages/agentsam-contracts/src/`.
- [ ] Introduce `@inneranimalmedia/agentsam-workbench/editor` subpath with `EditorWorkspace`, `EditorToolbar`, `EditorCreateMenu`, `EditorMenuPrimitives`, `EditorStatusBar` and `EditorToolState`.
- [ ] Extend `DesignWorkspaceFrame` only as needed for controlled dock state and split-pane safety. Preserve its existing explorer/inspector/assistant slots and layout persistence.
- [ ] Resolve semantic theme tokens through one provider; remove temporary leaf fallbacks rather than inserting local hardcoded palettes.
- [ ] Implement mouse/touch/keyboard/focus/menu scroll/Escape handling once and prove it can be driven by a non-CAD mock adapter.

### CAD binding
- [ ] Replace *presentation* of `QuickAddMenu.tsx` with the Workbench Create menu; retain `catalog.ts` and the actual CAD handlers as the authoritative source.
- [ ] Bind the first demonstrably working CAD create command (native Wall if verified); if it is not actually supported in current native document, surface the failure truthfully and implement the missing operation in CAD before marking W01 complete.
- [ ] Preserve Preview/Edit/Source and 2D/3D/Split modes, correct active tool highlight, precise command labels, keyboard parity and status feedback.
- [ ] Separate Templates from creation rows and distinguish asset browsing from starting a whole project.
- [ ] Build the smallest source-aware `EditorCommandContext`; a review-only mesh must not get a native-editable Wall action.

### Exit gate
Human opens hosted `/admin/cad`, clicks `+`, chooses a supported native command, creates an object, selects it and sees real status. Escape cancels the next uncommitted placement. Light/dark/custom and mobile are acceptable. No duplicate Create menu remains in the visible editor. Unit tests plus click recording required.

## W02 — CAD: precision, BIM authority, document and viewport

**Owner:** Lane 1 CAD + shared inspector fields.  
**Goal:** CAD can execute and persist a real, precision-authored native workflow while source-linked DreamHouse elements remain truthfully review-only.

### Instructions
- [ ] Add `editor-inspector.ts`, `editor-precision.ts`, `editor-viewport.ts` contracts.
- [ ] Build `EditorInspectorHost` and field primitives (`NumericField` with units, `AxisTriplet`, enum, switch, slider, color, asset ref, source banner, validation/commit controls).
- [ ] Bind *native* wall inspector to real wall property operations: plan coordinates, level/height/thickness/material where supported; handle engineering units, snapping, dimension display and constraints from CAD engine data, not client guesses.
- [ ] Demonstrate native Wall create → select → exact numerical modify → add/adjust opening if engine supports it → inspect BOM/quantities → undo/redo → save → reload → compare canonical geometry.
- [ ] Expose `native-editable / instance-editable / source-linked-review / read-only-revision` in source-aware inspector. Reject stale revision and unauthorized proposal at backend, not only through a gray button.
- [ ] Open a real authorized native source via a verified handoff if available; otherwise explain unavailable source and keep geometry controls disabled.
- [ ] Preserve 1,881-element DreamHouse hierarchy using virtualized tree, selection/filter and frame; verify no flattening of stable source IDs.
- [ ] Replace the undersized scene control card with readable viewport controls: orientation gizmo, projection when supported, plan/isometric/front/side presets, zoom/frame, grid/snapping and pane focus. Keep authored camera editing separate.
- [ ] In Split, scope menus and asset/template sheets to active pane or dock, with zero overlay blocking the other pane; allow independent interaction in both panes.
- [ ] Inspect/document actual lighting/exposure/material/source-color/site controls. Any added sky/HDRI/fog/sun controls must be bound to real renderer parameters.
- [ ] Preserve CAD approval bridge and native source authority on host and guest.

### Exit gate
A saved native wall has the same precise modeled values after a hard reload; a source-linked scene element stays review-only and routes correctly; 1,881 source items remain selectable; 2D, 3D and Split are navigable; invalid/stale/unauthorized edits do not mutate the document. Record receipts and visual evidence.

## W03 — SamSketch consumes the same components, without losing its engine

**Owner:** Lane 2 SamSketch; Lane 0 supplies no bespoke SamSketch-only widget forks.

### Instructions
- [ ] Map existing tools in `apps/samsketch/src/main.ts` and `native-scene-editor.ts` into the same semantic registry; extract handlers into domain command adapters, keeping Three.js/IAMScene ownership.
- [ ] Replace the misleading `Icons` command-card tab with a real tool palette/Create menu. Keep actual icon *assets* in the asset library, not under editor commands.
- [ ] Mount the same `EditorWorkspace`, `EditorCreateMenu`, `EditorToolbar` and `EditorInspectorHost` components that CAD uses; adapt existing host/guest bridge without stacking another shell around the iframe.
- [ ] Support select → rectangle/ellipse/path creation → point/curve editing → transform, precise node/size/rotation values, undo/redo, save/reopen. If point editing requires new vector-engine work, record that as domain TODO and implement before claiming completion.
- [ ] Retain existing object tree, source part transforms, appearance/visibility and PBR finishes; bind to real material/instance state.
- [ ] Ensure type-specific inspectors for path, polygon, source mesh, group, text and scene, not a flattened universal form.
- [ ] Fix `SamSketchAssistantPane.tsx` hardcoded styling and mini input. Reuse one composer primitive with a contextual selection adapter, keeping global and mini assistant roles distinct.
- [ ] Preserve full Typeface Studio as a specialist glyph/metrics editor; ordinary Text insertion must remain direct and editable.
- [ ] Clean gallery navigation: titled and covered items, domain/context differentiation, favorites/starters/drafts, remove broad unhelpful Untitled rows by improving metadata, not deleting user data.

### Exit gate
The **same Workbench UI exports** have been exercised in CAD and SamSketch. SamSketch can create, edit path nodes and object transforms, undo/redo, save, hard reload and preserve values/source relationships. No duplicate assistant identity, no command-as-asset confusion and no regressions in scene presentation.

## W04 — Precision and inspector depth for any eligible editor

**Owner:** Lane 0 contracts + specialist adapters; begin with CAD and SamSketch regression tests.

### Instructions
- [ ] Define precision semantics by domain: explicit model-space units; coordinate basis; screen-to-model transform; input rounding vs storage; tolerances; snap types; constraints and error feedback.
- [ ] Implement consistent numeric field behavior (typing/commit/cancel/scrub), rotation and transform triplets, linked axes, unit conversions, validation and reset; prove accurate model mutations for both lanes.
- [ ] Implement selection-aware inspector schemas: empty, 2D shape, point/path, text, group, instance, native BIM, imported source, camera, scene and material.
- [ ] Implement node handles/curve controls as a specialist engine feature surfaced through shared interaction contracts; do not ask the React inspector to author geometry.
- [ ] Define viewport orientation, perspective/orthographic, camera selector, camera preview dock and zoom popover semantics. Viewport camera != authored camera != Play Camera.
- [ ] Make full scene environment panels composable and legible: light (ambient and objects), environment/HDRI, fog, atmosphere, postprocessing, simulation, color pipeline, shadows and terrain where backed.
- [ ] Deliver capability failures with exact disabled reasons and recovery (e.g. missing source authorization, uninstalled adapter or read-only revision).

### Exit gate
A precision matrix passes for CAD wall geometry, SamSketch path/node data, mesh instance transforms, text metrics and camera values where operations are supported. No visual-only numeric fields or fake precision.

## W05 — Project discovery, assets, templates and fonts

**Owner:** Shared resource UI + existing asset authorities + specialist insert/instantiate adapters.

### Instructions
- [ ] Build reusable `EditorResourceExplorer`, `EditorObjectTree`, `EditorAssetBrowser` and `EditorTemplateBrowser`. Avoid another collection database.
- [ ] Implement Objects/Assets/Libraries as distinct concepts. Use types/categories, search, ownership/permission/source badges, template object-vs-scene separation, preview and actual insertion.
- [ ] For large CAD hierarchy validate virtualization and reveal-on-select; for SamSketch validate object gallery previews and source references.
- [ ] Inventory Theme Store R2 fonts and license evidence **before** exposing them as stock. Extract metadata from actual binaries: family, style, weight, variable axes, coverage, hash, source, version, embedding/edit/distribution rights.
- [ ] Build ordinary text `T` → text content → font picker (System/Stock/Brand/My Fonts) → preview → apply → save/reopen; keep `Open in Typeface Studio` a separate expert action.
- [ ] Validate font source round-trip, contour/node edits, sidebearings, kerning, Unicode mappings, TTF export and a versioned derivative. Do not equate export button visibility with font-engine validity.
- [ ] Ensure template install/instantiate preserves account/source permission and selected project state. No new-user account cross-leaks.

### Exit gate
Users can find and insert a licensed object/template/font from the real catalog, edit an instance without changing immutable source bytes, save/reload, and find the asset again. Search/no-result, mobile and error states verified.

## W06 — Scene authoring, events, variables and data-backed interaction

**Owner:** IAMScene/SamScene/eligible CAD or SamSketch runtime adapter; Workbench hosts controls only.

### Instructions
- [ ] Inventory actual scene/document runtime for authored cameras, light objects, material layers, simulation, effects, scene timeline, states, events and typed data.
- [ ] Bind `SceneEnvironmentInspector` to real sky/sun/HDRI, fog, shadows, exposure, materials, site and effects operations. Treat absent capabilities as TODO in registry rather than active toggles.
- [ ] Implement camera object create/select/transform/FOV/clipping/preview/use/pin; preserve personal viewport camera behavior independently.
- [ ] Implement real animation keyframe add/select/scrub/play/save/reload before adding Timeline buttons to general navigation.
- [ ] Where runtime exists: state/event/action/variable registry with typed Number, Boolean, String, Time and integration bindings; scoped permissions for webhooks/API/AI actions; validated triggers and observable effects.
- [ ] Keep video editing and rendering authority in CoPro/MovieMode; shared timeline dock is UI, not a parallel player/render engine.
- [ ] Verify data lifecycle including delete/rename/dependency references, runtime execution, undo/redo and reload.

### Exit gate
An authored camera, light/environment change, and one supported animation or event can be created, saved, reloaded and observed executing. Unsupported features never look active.

## W07 — Portability and production acceptance

**Owner:** Workbench package/release maintainers + all specialist consumers.

### Instructions
- [ ] Export package subpath and CSS consistently from build artifacts; test packaged import from a fresh independent fixture outside monorepo source aliases.
- [ ] Verify all installed consumers obtain the same component version; no package-src relative imports, no duplicate editor shell in route and iframe.
- [ ] Exercise accessibility: focus return, arrow key navigation, shortcut conflicts, screen-reader labels, touch targets and drawers.
- [ ] QA themes: light/dark/custom and missing-host theme bootstrap; static lint for prohibited literal UI colors.
- [ ] QA viewports: desktop 2560×1440, 1920×1080 and mobile 390×844; verify split pane and context menu placement.
- [ ] QA revision permissions, tenant isolation, source-linked edit prevention, concurrent edit conflicts, app reinstall and offline failure states.
- [ ] Replay common human tasks in deployed build, not just dev server: Create → Edit precise value → Inspect → Undo → Redo → Save → Hard reload → Verify revision; repeat per relevant mode.
- [ ] Document supported, degraded and uninstalled feature behavior. Prepare one deprecation map for former duplicated controls with no removal until all consumers pass.
- [ ] Version packages with changelog, tests, provenance of release build, installer smoke test and post-deploy acceptance evidence.

### Exit gate
Shared editor components are importable outside this monorepo, both priority lanes pass human click-through and source-security checks, and no unsupported menu command is silently enabled.

---

## First PR: mandatory scope (do not broaden)
Suggested PR name: `feat(workbench): portable editor create and toolstrip, CAD proof consumer`.

**Files to introduce:** contracts command/context/capability/session; `workbench/src/editor/index.ts`, workspace composition, menu primitives, Create menu, toolbar/tool state and shared styles.  
**Files to adjust:** Workbench exports/package.json, `DesignWorkspaceFrame` as required, CAD Quick Add presentation and CAD app adapter/host rendering, theme projection.  
**Files to keep authoritative:** CAD catalog API, CAD domain modeling, approvals, native source/revision, original CAD project data.  
**Pass criteria:** real CAD insertion+selection+cancel and at least one exact property change can be observed/saved; dark/light/custom/mobile behavior and no duplicate toolbar.  
**Non-goals:** rewriting CAD modeling engine, implementing every desired primitive, copying specialist engines, rebuilding global app nav, installing all future event/animation tools.

## PR #711 merge gate (existing, open as of baseline)
- [ ] Remove local CSS literal fallback colors introduced in `apps/cad-creator/frontend/src/components/quick-add/quick-add.css`; provide semantic defaults at theme provider boundary.
- [ ] Preserve documented application-owned material color values and allowed transparency effects.
- [ ] Test gallery inside the active host theme, missing-theme bootstrap, all supported colorways and mobile. Confirm no blank gallery.
- [ ] Check PR head and rebase/reconcile with the shared Create menu work; avoid merging obsolete duplicate menu CSS into the final owner.

## Mandatory per-wave evidence record
Store with each PR:
```yaml
wave: Wxx
lane: 1 | 2 | shared | eligible-runtime
repo_head: "<commit>"
actual_changed_files: []
supported_commands_verified: []
source_gated_commands_verified: []
screenshots_or_recordings: []
revision_receipts: []
document_before_after: []
negative_tests: []
desktop_mobile_theme_cases: []
independent_package_test: pass | fail | not-applicable
human_acceptance: accepted | rejected | pending
known_todos: []
```
**Rule:** A passing build is evidence the package compiles, not proof that an actual editor interaction works.
