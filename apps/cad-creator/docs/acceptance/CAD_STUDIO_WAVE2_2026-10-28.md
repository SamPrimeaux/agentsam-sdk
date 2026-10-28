# CAD Studio Wave 2 — Source-backed implementation and acceptance

Canonical UI is AgentSam's hosted `/admin/cad` route and Local Studio CAD app stage. The standalone CAD package at `127.0.0.1:3000` remains a development preview using the shared `agentsam-nav` package, not a second project/model authority.

## Implemented locally (not deployed)

- Discarded the floating SamSketch options/"LIVE TOOL" banner and removed its unconnected preview controls from the visible tool rail; no independent Freehand-to-CAD canvas is presented. Drafting uses the existing Plan and 2D/3D split workspace.
- Kept Objects and Properties independently available at normal widths. Added project-derived Assets and wall-assembly Libraries tabs, with stable selection and contextual inspector.
- The inspector supports typed wall edits, metadata-bearing layered construction assemblies, total-thickness updates via existing `update_wall` operations and deletion via canonical project operations. Changing layer thickness updates the same wall's overall dimension, not a separate render-only representation.
- Moved Save Revision to the toolbar, dispatching to the existing local revision authority or authenticated hosted saving; retained receipt handling and surfaced save result. Read-only hosted GLB scenes without a registered design document are not allowed to save as BIM.
- Replaced the Connected Providers toolbar popover with renderer-measured FPS, frame time, draw calls, triangles, geometries and texture counts; user-selectable resolution quality is runtime-only and does not modify the project.
- Removed local light/dark and accent controls; app appearance follows the host nav/theme style and embedded host theme updates.

## Native C++ engine and local browser integration

- Canonical SDK engine: packages/agentsam-occt/native; its existing packaged runtime and sibling dylibs were safely installed into the user-local OCCT executable path with full dependencies. The previous executable was backed up as ~/.agentsam/bin/agentsam-occt.pre-wave2-20261028 for rollback.
- The upgraded kernel reports OCCT 7.9.3, persistent sessions, BRep wall/opening operations, history/undo, native mesh, SVG, STEP/BREP/glTF/IFC4 export capabilities. Canonical C++ tests: 3/3 PASS, including wall-with-door 2,622,000,000 mm³ BRep/triangle agreement and exact file exports.
- Geometry conversion from SamSketch inches/2D endpoints to OCCT millimetres/Z-up now has one shared native-plan.ts implementation under shared/cad, used by backend and frontend.
- A loopback-only same-origin preview endpoint (POST /api/cad/project/native/evaluate) validates walls/openings, rebuilds the CURRENT design snapshot in a disposable C++ session and returns actual mesh vertices and volume to the 3D viewport. This endpoint does not save, mutate, or impersonate a project revision.
- Verified via temporary HTTP server on port 3015: HTTP 200, engine occt, verified true, one wall with door, 28 triangles, ~2.622 billion mm³, 2 features. Backend tests cover malicious geometry refusal and real native evaluation.
- Browser solid inspector now measures the same C++ mesh. Standalone model exports requiring the desktop authoring host remain disabled.
- The existing port 3000 local server must restart to load updated backend route; the hosted /admin/cad is NOT changed.

Not yet established: live browser visual/interaction QA, registered DreamHouse V1.5 editable BIM source, multilayer ply solids, full IFC interoperability / professional documentation review. The local runtime now has a validated, immutable V1 schematic registration, dreamhouse-v1-wip revision 1 (31 walls, 33 doors, 11 windows, 21 rooms), seeded only if absent from the existing /Users/samprimeaux/dreamhouse/builds/v1/DreamHouse-V1.cad-creator.project.json source. The original DreamHouse repository and hosted V1.5 scene were not modified. This is not V1.5 or a replacement for the later FreeCAD project. Standalone loopback now opens this source by default; explicit access=public-demo opens the example.

## Acceptance work before release

1. Open the actual project via the authenticated host, confirm the exact CAD document source is registered and writable, never replace a visual-only scene with a fabricated design source.
2. Validate wall create/move/delete with 2D and 3D changes from the same revision, including hosted openings and undo/redo.
3. Verify Save Revision produces an authoritative read-back, and roll back on errors/conflicts.
4. Validate the three left tabs, simultaneous panel behavior, and mobile compact layout in a real browser. No visual QA is claimed from compilation alone.
5. Verify renderer quality controls change actual WebGL pixel ratio and metrics are measured from the active canvas.
6. Verify native BRep synchronization after browser draft operations and undo/save in an actual project; validate IFC export/reimport separately.
7. Use the existing host navigation and theme contract; remove any remaining standalone preview parity differences before release.
8. Record final sources, CI/build receipts, signed git commit, review and release before declaring hosted deployment complete.

Do not publish unfinished BIM drawings or construction outputs as professionally approved.

## Wave 2.1 corrections — 2026-10-28

- Restarted stale CAD backend. Native evaluate now resolves (invalid request 422 rather than 404), with saved local DreamHouse V1 revision 1.
- Removed Advanced CAD Tools disclosure, duplicate 2D/3D contextual controls and independent SamSketch rail. Direct drafting tools occupy the top toolbar.
- Moved architectural fixture stock from modal to Libraries search/category list; selecting a preset arms one 2D placement with its actual dimensions.
- Moved measured quantities into the Project inspector; removed invented $185/ft2 canvas budget.
- Code now shares model revisions: validated BIM object JSON parameters update through canonical operations, OpenSCAD source uses the existing ParametricEditor and explicit Apply after sandbox validation. Selection jumps directly to Code.
- CAM is a separate manufacturing preparation stage (not a relabelled Franka chess simulation). Its outputs are not machine-ready.
- Viewer now frames from actual project bounds and aligns ground/grid; improved native error reporting, defensive JSON response parsing and removed deprecated shadow preset / passive-wheel preventDefault warnings.
- Code/BOM regression checks added. Package typecheck passed; frontend 65 tests passed, backend 7 tests passed + 1 FreeCAD-specific skipped; production build passed.

## P0 end-to-end acceptance gates — not completed by UI wiring

1. **Native multilayer solids:** A wall assembly has ordered material layers and sum-thickness invariants. C++ OCCT must generate a separate valid, identity-stable BRep for every ply, resolve joins/corners, cut doors/windows through every affected ply, and preserve hosts across revisions. Current UI layers are still metadata and overall wall thickness.
2. **Single geometry authority:** The same project operation record and nativeHistory must drive 2D, BRep, Three meshes, section views, undo/redo, STEP and IFC. Independently re-import IFC4 material layer sets, openings, and element IDs and compare dimensions. Preview fallback is marked, never silently authoritative.
3. **Accurate BOM:** Derive material quantities from native per-layer volumes/areas plus verified openings. Construction budget requires user-supplied unit pricing, labor, waste and scope, never guessed rates.
4. **Code and LSP:** Replace interim text areas with the installed agentsam-ide/monaco editor. Host-scoped LSP JSON-RPC transport must initialize and return real diagnostics before its status is shown as ready. Source edits must undergo AST/schema validation, change preview, explicit apply, native evaluation, signed revision receipt and reopen. Support OpenSCAD and native OCCT recipes first; add CadQuery/build123d only with a verified sandbox and exchange contract.
5. **Hosted BIM / scene:** Reconcile DreamHouse V1.5 FreeCAD/Blender source with the registered editable CAD project. Current local V1 schematic is an honest source and not equivalent to V1.5. World viewer quality needs real PBR assets, camera/input QA, world LODs and native solid parity, not UI polish alone.
6. **CAM:** Manufacturing pathway remains separate from robotics chess. Production readiness requires validated machine/material metadata, preflight and vetted postprocessor; no actual machining operations from this preparatory UI.
7. **Franka reusable component:** Export a verified, authorized standalone robot GLB/asset manifest from the existing MuJoCo visual source and package a lightweight 3D component without MuJoCo WASM/chess/CAD renderer. License/attribution, material fidelity, size, disposal and public-page rendering need acceptance tests. Source asset extraction is blocked by unavailable remote-host DNS; not delivered yet.
8. **Release:** Browser interaction, mobile fit, dirty/save/readback/undo, real native CAD layer parity, user/host authorization, CI/build, signed commit, review and hosted merge/deploy must all pass. Live Vite changes are not a production release.

## 2026-10-28 CAD tool activation and telemetry evidence

- Live local Mac native doctor returned HTTP 200, OCCT 7.9.3 ready; design_project_get returned HTTP 200 and revision 1. Four native cad-project-occt-contract integration tests passed, including STEP reopen and digest verification.
- Added local-only GET /api/cad/project/capabilities using the existing runtime.catalog() and runtime.nativeDoctor(). A fresh ephemeral Express instance returned HTTP 200, all nine canonical cad.project.v1 tools, execution_lane local, OCCT ready and hosted explicitly unavailable. No second registry.
- D1 production registry has nine canonical CAD tool rows inactive. Never flip is_active before proving authenticated host -> authorized Mac connection -> scoped CAD executor -> persisted operation receipt. This is a dispatch/auth gap, not missing native geometry.
- Next: bind createCadOperations({projectTools, resolveTrustedContext, authorize, requestApproval}) in the authenticated host with a fixed trusted workspace/project root; enforce project ownership, expected revision, and write approval, verify returned hashes, and report Mac-offline readiness. Model-provided filesystem or shell instructions must never be treated as authority. Activate D1 rows only after successful hosted per-operation invocation.
- Existing agentsam-analytics operations event contracts can record sanitized timings and verified results; Cloudflare query adapters belong server-side, with null/unavailable for missing sources.
