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


## Modular v2 schema contract pack

Canonical, reviewed source: `protocol/cad/v2/` (28 JSON Schemas and a deterministic SHA-256 manifest).
The existing `cad.project.v2.schema.json` envelope remains unchanged: opt-in
modules are not silently inserted into strict existing project payloads.

- `python3 scripts/cad/schema_pack_release.py verify` compiles all modules with
  strict Ajv Draft 2020-12 and verifies hashes and transitive references.
- `python3 scripts/cad/schema_pack_release.py stage` packages the exact same
  files under `apps/cad-creator/schemas/v2/` for offline consumers.
- CAD Creator's existing `prepack` / `package:verify` calls the staging step.
- `python3 scripts/cad/schema_pack_release.py publish` only works from a
  clean, committed `main` whose HEAD matches GitHub `main`. It publishes an
  immutable, versioned schema URL, reads objects back, then advances the public
  `apps/cad-creator/schemas/registry.v1.json` pointer last. The registry is
  the release authority; drafts never get a published status object.

Legacy `apps/cad-creator/schemas/v2/` URLs remain untouched for existing users.
Modules newly added in this revision are robotics, reference-model, camera-path,
drawing, production and deliverable-manifest. Coordinate-system already owns
placement; dedicated project revision, receipts, features, and design intent
are present in the existing pack. No duplicate schema is introduced for those.

Do not change bytes under a published release prefix. To update contracts,
bump `RELEASE` in `scripts/cad/schema_pack_release.py`, revise source `$id`s,
regenerate the manifest, test and publish a new immutable prefix. Never reuse
an npm package version for a changed publish artifact.
