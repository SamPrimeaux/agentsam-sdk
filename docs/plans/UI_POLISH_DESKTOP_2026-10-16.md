# Local Studio desktop polish — focused branch handoff

**Branch:** `ui-polish-desktop` (cut from the latest `agentsam-sdk/main` on 2026-10-16)  
**Status:** Work intake and acceptance notes only. No runtime or CAD UI changes have been implemented on this branch yet.

## Product intent

InnerAnimalMedia Experience Standard: **Craft over spectacle. Substance over promises.**  
Companion principle: **Complex underneath. Effortless above.**

Local Studio should be a calm, coherent, highly capable workspace, inspired by the interaction *discipline* of modern desktop/Work applications rather than imitating their branding. Improve and reconnect existing UI/runtime capabilities; avoid adding a second shell, state authority, or design system.

## Desktop polish workstreams

### A. One composable layout contract
- Trace `apps/local-studio/frontend/agentsam/AgentSamPage.tsx`, `shell.css`, `src/components/shell/trail-workspace.tsx`, and shared `packages/agentsam-workbench` resize/layout components.
- Replace overlapping hard-coded split maxima with a container-aware policy. Persist preferred pane proportions separately from the effective size allowed by the currently available container.
- Preserve a readable conversation measure, while allowing browser/CAD/editor/terminal canvases to use all available space.
- When the primary pane and contextual pane cannot both be usable, use a focused/overlay presentation; never squeeze the composer offscreen.
- Restore sidebar, tabs, split ratios, project and active conversation after restart. Keep hover/focus, panel swap, drag, reset and keyboard resize functional.

### B. Native-feeling PTY, clipboard, and multimodal input
- Fix the xterm paste path so Command-V uses a standard paste event rather than triggering an unnecessary clipboard API permission prompt.
- Correct nested terminal scrolling, flex constraints, fit-addon/ResizeObserver churn, and the fresh-terminal horizontal-scrollbar jitter. Preserve real scrollback.
- Distinguish ordinary text/path paste from images. Drop or paste a screenshot into an AgentSam terminal workflow via a secure staged-asset/context reference; NEVER inject image binary into PTY stdin.
- An image staged in Chat must be attached to the *submitted* message, persist through conversation reopen, and reach a provider/model with verified image capability. Do not silently omit the image and then reply that AgentSam cannot analyze it.
- Maintain platform permissions, audit evidence, attachment lifecycle, and failure/retry states.

### C. Contextual Work and live executions
- Keep the composer visually quiet, with predictable hover, focus, keyboard and reduced-motion behavior.
- Surface actual GOAP/Plan/SAM stages, authorized tool commands, verified receipts, pending approval and resume state from existing runtime authority. No invented stages/progress.
- Make voice input optional, user-authorized, editable before submission, and independent of the terminal's shell stream.
- Reuse the existing conversation/session contracts. Do not confuse localStorage cache with cloud-authoritative persistence.

### D. Release verification
- Test compact, standard, and wide installed macOS windows, with navigation expanded and collapsed, one/two panes, multiple terminal tabs, and varied content sizes.
- Verify with the **bundled desktop SPA in Tauri**, not only the hosted site. Respect `docs/product/LOCAL_STUDIO_DESKTOP_EXPERIENCE.md`; the real Local Studio UI must be packaged in the app.
- Keep CI focused during implementation; do one consolidated integration and packaged desktop acceptance pass before merge. Preserve unrelated active branches/worktrees.

## CAD integration notes — guardrails for this desktop branch

CAD Creator remains its own experimental npm workspace at `apps/cad-creator`, not part of the SDK root workspace graph. It already has 2D/3D, robotics, tool adapters and its own frontend. Local Studio should host CAD as a cohesive **workspace surface**, not duplicate or silently fork its project model or CAD runtime.

Key source contracts to inspect:
- `apps/cad-creator/README.md`: active CAD Creator app, shared CAD types and server.
- `docs/cad-project-tools.md`: authoritative editable `DesignProject`, inches as canonical document units, revision-aware saves, immutable artifacts, renderer interchange.
- `src/lib/cad/{discovery,freecad,blender}.js`, `services/cad/freecad/adapter.py`, `services/cad/blender/adapter.py`: local native/CAD adapters.
- `src/lib/cad-docker.js`: existing OpenSCAD/FreeCAD/Blender Docker lanes.
- `apps/cad-creator/frontend/src/workspaces/robotics/DiagnosticOverlay.tsx`: tool/telemetry visualization to audit for genuine runtime status.

Important distinctions:
1. **FreeCAD / OpenCASCADE**: precision/parametric solids and STEP/IGES; inspect actual compatible Python bindings/runtime rather than assuming any bundled application library is a complete developer SDK.
2. **OpenSCAD**: deterministic constructive solids. **Blender**: scenes, lighting, animation, mesh assets and GLB exports. These complement, rather than replace, the canonical editable design document.
3. GLB is a rendering/preview interchange; do **not** treat it as lossless editable CAD/BIM data or claim IFC roundtrip where unsupported.
4. The robotics diagnostic overlay currently has default tool integration statuses, including FreeCAD shown as `connected`; ensure the rendered status is based on a real capability/discovery probe, or explicitly label it a design/demo fallback. Likewise, don't present illustrative telemetry as observed data.
5. The robot arm can become a genuinely useful demo **only** when transform gizmos, joint limits, kinematics, collision/telemetry and save/export are backed by real scene/runtime behavior. Do not let a beautiful control panel imply operations that aren't connected.
6. CAD needs the same global shell affordances as other surfaces: drag/paste images, fit-to-view, selection-specific inspector, responsive split layouts, autosave/revision visibility, undo/redo and contextual AgentSam help.
7. Avoid recreating CAD Creator inside `apps/local-studio`: share cross-product workbench primitives and inject domain adapters. Leave CAD-specific geometry, kernels and source formats in the CAD domain.
8. The specific real-machine Blender crash/Metal/sandbox behavior should be discovered and reported by the adapter rather than hidden behind a fictitious `ready` badge.

## Scope / branch discipline

This is a desktop polish branch, **not** an authorization for unbounded CAD feature redevelopment. CAD-specific changes should remain on their existing owner branch unless they are small, proven shared UI primitives or necessary integration fixes.

Before modifying overlapping source files, fetch and compare currently active WIP branches/PRs, especially earlier terminal, shell, conversation and image-attachment repairs. Reuse completed work. Commit/push completed batches and merge only when actual tests, branch protections and desktop acceptance pass; clean up proven merged worktrees without discarding unique user assets.

**Success:** open Local Studio, attach a screenshot and get an image-grounded response; open terminal/browser/CAD side by side without layout jitter; inspect an actual CAD/robotic artifact or live run; switch context and restart without losing progress.