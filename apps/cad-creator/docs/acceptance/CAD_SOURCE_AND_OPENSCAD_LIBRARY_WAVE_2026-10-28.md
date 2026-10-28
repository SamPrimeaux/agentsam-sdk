# AgentSam CAD — Source Library & OpenSCAD Tooling Acceptance

Date: 2026-10-28
Status: LOCAL VERIFIED — NOT MERGED OR DEPLOYED
Versions: CAD Creator 2.6.15; Local Studio/Backend 2.6.15; OpenSCAD catalog contract agentsam.openscad-library.v2.

## Implementation

- Retained the original CAD Creator and the two existing native FreeCAD BIM starters.
- Indexed 84 local project files: 80 DreamHouse and four AgentSam 3D Studio. Source roles are explicitly native, review or evidence.
- Source inspector: GLB viewer using shared AgentSam 3D Viewer, image/text preview, original download and deliberate native-application actions for FreeCAD, Blender and OpenSCAD. Only stable indexed source IDs may be resolved.
- D1 registry API is implemented in the actual Local Studio Worker, which hosts agentsam.inneranimalmedia.com. Account-session authorization for listing, superadmin approval for create/edit/deactivate with version conflict checks. D1 table: agentsam_openscad_libraries.
- Bundled, dated snapshot of 26 D1 records is a standalone/local fallback, NOT a competing database.
- Toggleable OpenSCAD library browser in Parametric Code tab: search/filter, licensing, safe import insertion, and superadmin catalog changes on live host.
- Local trusted-file probe validates whether source exists in known OpenSCAD roots, rejects traversal and external symlinks. D1-registered does not imply installed.
- Verified STL path: native OpenSCAD or validated Docker only. Server execution no longer returns a simulated fallback as an export. Input limits, local host/origin checks, compiler receipt and SHA-256 enforced.

## Evidence

- Local /api/cad/bim-starters: 2 native BIM starters, 84 real discovered sources.
- ArchDetail: 435 source objects, 129 preview meshes. BIMExample: 362 source objects, 113 preview meshes.
- DreamHouse V1.5 review GLB retrieved from /api/cad/sources/{id}/preview: 6,005,304 bytes, SHA-256 83c0714f3eccac35e0a0c2c1df7681bf5fbc368c35d1b35474fec40d749df6d7, matching the original source.
- Native OpenSCAD HTTP smoke: verified 1443-byte STL SHA-256 e8c7020e8ae8dd762af8d14ee2babd2919d9d578ab7247b70c903ecc2072b587.
- Actual installed local OpenSCAD library compiled to native STL in backend test.
- CAD frontend: 67/67 passing. Backend: 11 passed, one skipped. BIM starters: 2/2 passing. D1 catalog CRUD: 5/5 passing. CAD publishing verifier passed. Frontend/backend production builds passed.

## Remaining acceptance gates

1. Live D1 catalog and UI are NOT YET DEPLOYED. Merge and deploy only reviewed isolated changes after browser E2E.
2. D1/R2 cloud registration of discovered DreamHouse assets needs work through existing project gallery; locally indexed assets are not automatically cloud-backed.
3. DreamHouse V1.5 FreeCAD/IFC promotion remains blocked; Mac FreeCAD Python imports fail with Getting HOME path from system failed. V1.5 GLB is a review artifact, not synchronized native BIM.
4. BOSL2 is registered in D1 but its include source is not installed in recognized Mac search roots. Installation needs a version-pinned, license-reviewed, user-approved procedure.
5. Local Studio global typecheck has an unrelated TS5097 issue in ecommerce-cms-agentsam/backend/agentsam/d1-mutation.ts.
6. Browser screenshot QA, large-scene optimization, shader/material polish and full native BIM edit-save-reopen still outstanding.
7. No physical machine operation or robot command has been enabled.

## Source ownership

CAD backend: apps/cad-creator/backend/src/cad/source-discovery.ts, source-browser.ts, openscad-library-probe.ts, openscad.ts, server.ts.
CAD UI: apps/cad-creator/frontend/src/components/OpenScadLibraryPane.tsx, ParametricEditor.tsx, CadSourceInspector.tsx, BimStartersWorkspace.tsx.
Hosted D1: apps/local-studio/backend/worker/cad-openscad-libraries.js and index.js.
Snapshot: apps/cad-creator/data/openscad-libraries-snapshot.json.

Avoid committing or merging unrelated staged files.
