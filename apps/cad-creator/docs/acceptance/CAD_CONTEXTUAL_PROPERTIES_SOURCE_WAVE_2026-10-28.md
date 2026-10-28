# AgentSam CAD — Contextual Properties and Libraries integration

Date: 2026-10-28
Status: Local implementation tested; NOT committed, merged or deployed.

## Target

Keep existing CAD 2D/3D split viewport, Properties inspector and Libraries rail. Remove the disruptive full-width Code view from normal CAD navigation; source edits must use the same canonical project operations and undo/save workflow as GUI edits.

## Implemented in the existing workspace

- CAD top toolbar Preview/Edit remain viewport modes. Source is an action that focuses the existing right-side Properties > Source tab. Source does not hide the canvas.
- Properties Source shows validated BIM JSON for the selected wall, door, window, room or fixture. Source edit uses the shared CAD operation in source-operations.ts. The legacy code workspace uses the same module for compatibility; it is no longer routed through CadCreatorApp.
- Parametric elements expose existing dimension/generator parameters in Object and editable OpenSCAD source in Source. Native OCCT recipe sources are explicitly read-only in the OpenSCAD editor. Imported scene elements also remain read-only, not falsely promoted to native BIM.
- Complete project SCAD is available as read-only generated source in the right inspector.
- Existing left Libraries rail has four internal categories (Assemblies, Stock, Parametric, OpenSCAD), not an extra panel or an enormous combined scroll.
- The toolbar Parametric action opens directly to Libraries > Parametric, while Stock opens Libraries > Stock. The three preexisting OpenSCAD generator templates can create actual parametric project objects through applyDesignOperation. A selected OpenSCAD part receives registered library imports through the same update_parametric_source operation.
- The library registry still comes from D1 when running on the hosted AgentSam Worker's authenticated API, with the dated snapshot as a clearly labeled local fallback. Registry presence does not imply installed source.
- The source patch logic has one canonical source-operations.ts module; both contextual inspector and legacy editor paths reuse it. Source updates apply to the latest available project revision.
- Browser-only OpenSCAD sandbox still prohibits imports. Native-backed editing accepts syntactically safe relative .scad use/include lines; the native backend separately probes trusted local source files and refuses missing or untrusted imports.
- Source inspector offers a native compiled verified STL (compiler proof and SHA-256 required); no simulated browser STL is exported as manufacturing geometry.
- engineering-workbench.css uses semantic AgentSam dashboard color tokens for panel, canvas surface, border, ink, muted text and accent. Standalone CAD has fallbacks. Viewer mesh/material rendering remains a separate specialized system.

## Acceptance status

- Frontend TypeScript: passed.
- CAD frontend tests: 74 passing.
- Production Vite build: passed (non-blocking large MuJoCo chunk warning).
- Whitespace diff check: passed.
- Headless Chrome screenshot acceptance: attempted, but the Mac terminal's Chrome exited during Playwright launch; no claim of visual browser acceptance.
- Source + view test: render-to-static-markup verified source tab and library categorization.
- Existing CAD backend and native OpenSCAD compiler smoke tests passed in earlier wave; rerun for final release.
- PR #393 is currently open and mergeable on GitHub, with head fd5389d1, but this subsequent local UI work is NOT yet in the PR.

## Separate DreamHouse Work sprint

The other agent's Work sprint changes have their own acceptance: migration 1349 project_metrics project_id to TEXT, timer operations against time_entries, project metrics, R2-backed project_draws gallery, and grant presence lookup. Production D1 migration is still unapplied and hosted downloads/time tracking need deployment verification. Do not conflate Work metric R2 registration with editable FreeCAD BIM source promotion.

## Release gates

- Isolate and review this scoped UI change and do not sweep unrelated Cloudflare Images or other agent work into one commit.
- Validate local screenshot/selection/source/undo/edit on desktop and small screens through the browser.
- Verify native edit-save-reopen of actual DreamHouse model revisions and OCCT object identifiers.
- Apply backed-up D1 project metric migration in the Work deployment lane, and deploy compatible Local Studio Worker/frontend together.
- Resolve unrelated ecommerce TS5097 global typecheck regression before full release.
