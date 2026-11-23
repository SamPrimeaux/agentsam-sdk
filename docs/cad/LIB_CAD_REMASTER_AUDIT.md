# CAD SDK authority, portability and scale audit

This audit is based on the current implementation in `src/lib/cad` and the
CAD Creator backend. It distinguishes verified behavior from pending work.
**Do not introduce another CAD project model, another file format catalog,
another shell, or a DreamHouse-specific rendering engine.**

## What owns what

| Existing module(s) | Current owner / behavior | Required evolution |
| --- | --- | --- |
| `project-v2.js`, `project-v2.d.ts` | Portable `cad.project.v2` project model, source and output format references, receipt rules, revision invalidation | Single project authority for the authoring runtime. Stable, revisioned semantic edits and durable geometry identities |
| `bim-bridge.js` | Verified read-only projection of `agentsam.bim.model.v1` inspections into v2, keyed by IFC GlobalId | Full IFC import/edit/export provider with geometry and semantic round-trip proof |
| `delivery-profiles.js`, `production-operations.js` | Desired deliverables; runtime operations exposed only by authorized provider ports | Match operation + concrete encoder/engine + file format + geometry capability; validate real bytes and professional-review state |
| `format-policy.js` | CAD context roles derived from root `agentsam.source-types.v2` catalog | Do not create more ad-hoc extension allowlists. Add content identification and format-specific codec proofs separately |
| `editable-project-contract.js`, `project-contract.js` | Older inch-based model (walls, doors, windows, rooms) | Compatibility facade for legacy documents only; never make it the authority for new v2 projects |
| `project-cli.js`, `project-runtime.js`, `project-tools.js`, `project-workflows.js` | Installed local design runtime still uses the legacy project document and revision flows | Route project commands through one v2 command API; expose accurate host operation support and typed errors, not universal format promises |
| `project-store.js`, `d1-project-store.js` | Legacy file and authenticated D1/R2 stores | v2 persistence with immutable revisions, ownership scoping, optimistic concurrency and byte-verified assets; no separate project truth per surface |
| `project-recipe.js` | Legacy Blender projection with rectangular-floor and operation-count limits; roofs can reject | Replace as general CAD compiler with reusable IAMScene/IAMGeometry + IFC/OCCT/IfcOpenShell engine adapters; preserve only as v1 compatibility |
| `discovery.js` | Native and container availability probes | Probe individual operations, codecs, installed library versions and execution lanes per customer host |
| `blender.js`, `freecad.js`, `openscad.js`, `occt-native-provider.mjs` | Execution adapters and receipts for their individual engine families | Share provider execution/evidence contract; use installed engines rather than duplicating geometry algorithms |
| `docker-executor.js` | HTTP transport to container CAD service | Verify artifact hashes and sizes independently; preserve binary STL and 3MF as bytes; stream large payloads and enforce time/size limits |
| CAD Creator `source-discovery.ts`, `source-browser.ts` | Local-only folder scan, source IDs, hash + download; wider format identities now derived from shared policy | Replace synchronous, capped filesystem traversal with authenticated, paginated source indexes and hash-once immutable manifests |
| IAMScene/IAMGeometry package | Native scene graph, linked geometry and supported mesh/GLB adapters | Scene/world/presentation representation, not a replacement for semantic BIM or exact BREP |

## Immediate acceptance gates for actual IFC editing

1. **Import:** Parse a real IFC with IfcOpenShell, preserve its original bytes/hash, spatial tree, GlobalIds, properties, quantities, classifications, placements, representations and opening/filling/containment links. Current semantic projection is read-only.
2. **Select:** CAD Creator selection, properties, BIM tree, types, openings and schedules must resolve to one identity across viewer, IFC and v2 project.
3. **Edit:** Execute typed edits through `ifcopenshell.api` and OCCT where geometry is required; preserve identifiers or record explicit GUID remaps. Never silently flatten IFC to GLB.
4. **Export and compare:** Write IFC4, reopen through an independent parse, prove semantic counts, element identity, placements, opening relationships, psets, quantities and changed geometry. Report losses rather than claiming a round trip.
5. **Drawings and schedules:** Recut PDF/DXF/SVG sheets from the current source revision. Verify dimensions and scales, and mark professional review required when appropriate.
6. **Publish:** R2 objects and D1 project/revision/artifact rows must be ownership-scoped, hash-verified and atomically promoted. Draft source != approved building documents.
7. **Scale:** Paginated project assets, asynchronous background content extraction, bounded memory/CPU, cancellation, per-tenant storage quotas and no repo-specific or customer-name-specific file paths.

## Formats and their actual responsibilities

- **IFC/IFCZIP:** canonical BIM semantics; IfcOpenShell read/author/write. A recognized extension is not proof an archive importer exists.
- **STEP/IGES/BREP:** accurate engineering solids and geometry; OCCT and FreeCAD.
- **STL/OBJ/PLY/3MF:** fabrication/mesh interchange; meshes are not parametric solids. Units and watertightness need validation.
- **SVG/DXF/PDF:** dimensioned vector drawing and sheet exchange; SVG is a source/deliverable type, not automatically an editable CAD sketch.
- **GLB/glTF/IAMScene/IAMGeometry/USD/BLEND:** native and interchange scene/geometry/workflow content. Keep linkable original sources.
- **MOV/MP4/OTIO/WAV:** film deliverables; MovieMode/CoPro or authorized media service performs real encoding/editing, while CAD provides model-derived scene sources.
- **E57/LAS/LAZ:** survey/point cloud reference data; never automatically interpreted as triangulated surface geometry.

Before declaring any new format `implemented`, prove its operation with real
fixtures, byte/semantic validation, round-trip loss report when meaningful, and
a customer-installation capability probe. Format recognition alone is not
that proof.
