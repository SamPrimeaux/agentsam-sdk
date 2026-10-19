# CAD Creator / SAM — Portable Project and Execution Contracts

**Authority:** `@inneranimalmedia/agentsam-sdk` owns the protocol; CAD machinery implements its provider ports. This is the published architecture and contract surface, not a declaration that every native provider is implemented.

## V2 project

- Source of truth: `src/lib/cad/project-v2.js`, types `project-v2.d.ts`, JSON Schema `cad.project.v2.schema.json`.
- Public schema mirror: `https://schemas.inneranimalmedia.com/apps/cad-creator/schemas/cad.project.v2.schema.json` in R2 bucket `inneranimalmedia-schemas`. The bucket-root `apps/cad-creator/` prefix is app-owned; do not nest CAD Creator inside `agentsam/`.
- The SDK's `protocol/cad/cad.project.v2.schema.json` remains the canonical source. The CAD Creator release stages an exact copy at `apps/cad-creator/schemas/cad.project.v2.schema.json`; the npm package-verification gate compares the two byte-for-byte. R2 publishing must use that same canonical artifact.
- Existing `agentsam/cad/` schema assets are legacy-compatible and should not be deleted or silently replaced during this migration.
- Projects contain typed identity, coordinate authority, editable entity data, domain modules, design intent, asset references, revision history, view/scene/film requests, output DAGs, receipts, delivery profiles and professional-review state.
- `architecture.building` requires an architecture module. `mechanical.part` is valid without roofs or bedrooms.
- Native units are declared explicitly. Migration from v1 retains original editable inches, element IDs, all source arrays and unknown extension fields in `compatibility.sourceDocument`.
- `normalizeArchitecturalSource` preserves the locked SD-02 contract as original source; it does not rescale, redraw or override approved dimensions.
- Application-specific view state may be layered by CAD Creator; SDK-owned contracts must not import app-owned source.

## Strict modular schema pack (opt-in)

The canonical project document remains `cad.project.v2` at
`protocol/cad/cad.project.v2.schema.json`. A versioned, additive CAD schema
library now resides under `protocol/cad/v2/` with its authoritative index
`schema-pack.manifest.json`. The full pack is mirrored to
`inneranimalmedia-schemas/apps/cad-creator/schemas/v2/` and staged byte-for-byte
into the CAD Creator npm application.

### Contract groups

- `core/`: stable entity and subshape identities, engineering coordinate frames,
  precision, parametric feature nodes, typed constraints, BIM relationships,
  immutable revisions and output receipts.
- `modules/`: parametric, architecture, mechanical, landscape and product
  design domains with explicit module schemas and versions.
- `interchange/`: native BREP/STEP/FCStd/BLEND source provenance, IFC mappings,
  stable GlobalId associations and IDS/bSDD/BCF references.
- `presentation/`: model-bound views, dimensioned sheets, scenes and real
  walkthrough/cinematic camera paths.
- `intent/`: human-approved locked requirements and non-destructive alternatives.
- `validation/`: document, semantic, native-geometry and deliverable results.

**Compatibility boundary:** legacy v2 geometry entities intentionally have
`additionalProperties: false`. New placement, feature, topology and type fields
must not be inserted into legacy `geometry.entities` without a lossless,
explicit migration. During migration the strict feature graph can be represented
in a versioned `modules` payload, preserving existing project data. The
schema pack is opt-in until runtime constructors, TypeScript types, serializers,
validators, fixtures and exporters enforce the same contracts.

**Engineering gate:** JSON Schema validates structure; it cannot prove ID
referential integrity, solvable sketch constraints, valid BREP topology,
appropriate BIM relationships, correct IFC round-tripping, professional
engineering suitability or render correctness. Those need SAM semantic,
native-provider and deliverable validators with correlated revision receipts.

Before beginning Astra's first full BIM build, validate approved SD-02 source
continuity, unique entity and subshape IDs, all relative $refs, coordinate
round-trips, native editable source preservation and an actual model-derived
walkthrough. Do not infer completed functionality from schema publication alone.

### Verification

`node --test test/integration/cad-v2-modular-schemas.test.mjs` checks
schema-pack identities, paths, references and essential required fields.

`npm --prefix apps/cad-creator run package:verify` stages the canonical pack
and checks exact source-to-archive byte parity. R2 publishing must compare
downloaded objects against the SDK source before claiming a finished release.

## SAM operation authority

Existing stable normalized routes remain: `cad.project.get/validate/apply/save/restore`, `cad.model.build/inspect/render/export`, and authorized `cad.job.*` routes.

New *target* CAD production capabilities are declared in `production-operations.js`, and are registered into SAM **only after** a real host provides `supportedOperationIds`, principal resolution, resource authorization, user approval, and an executor that returns a real output, checksum and receipt. Merely installing software does not advertise capability.

Every requested operation carries `project_id`, `revision`, `output_id`, optionally `workspace_id` and typed operation parameters. The provider must enforce tenant/resource ownership and protect source/private artifacts independently of the UI.

No Cloudflare Worker may execute native Blender/FreeCAD subprocesses directly. Resolve an authorized local-device, connected cloud VM, or sandbox execution lane using existing SAM adapters and queues.

## Baseline deliverable profiles

`architecture.concept`, `architecture.schematic`, `architecture.cd-preparation`, `architecture.interactive`, `architecture.cinematic`, `architecture.professional-handoff`, and `mechanical.fabrication`.

The CD profile defines G/C/A/S/M/P/E/energy and survey/engineering review requirements but does not claim verified engineering or permit-ready status. Professional seals are third-party attestations, **never auto-issued by SAM**.

An output is only `generated` if it includes its file URI, SHA-256 hash, generating project revision, executor name/version and correlated execution receipt. Output dependencies are checked for cycles; changing geometry invalidates affected outputs. Finished packages require every mandatory artifact, validated source associations and explicit publishing authorization.

## Acceptance

`node --test test/integration/cad-project-v2.test.mjs test/integration/cad-project.test.mjs test/integration/cad-project-app.test.mjs`

The tests cover a real v1 fixture, a mechanical-part project, an SD-02 architectural profile, the actual locked DreamHouse source when locally available, real output requirements, professional release defaults and authorized operation registration.

No existing platform Worker name, routes, database or R2 configuration is changed by this contract release. The CAD Creator Worker remains a separate deployment owned by `agentsam-cad-machinery`.

## Next implementation sprint (provider ports, not new contracts)

- Package actual IfcOpenShell/FreeCAD/OCCT/BREP and DXF drawing adapters behind the declared SAM capabilities.
- Connect approved project revisions to coordinated geometry, drawings, IFC, GLB, Blender and MovieMode/CoPro production stages.
- Reuse existing AgentSam workbench dashboard, Side Assistant, miniAgentSam, queue-control, GOAP, assets and project authorization. Do not build substitute shells or task registries.
- Prove output hash/receipt linkage, incremental re-generation and a professionally reviewable package from the same project revision before publicly claiming completed capability.
