# Project contracts, revisions, operations and workflows

## Canonical portable project contract

`cad.project.v2` is the canonical portable CAD project envelope. Its schema is
`protocol/cad/cad.project.v2.schema.json`; implementation and helpers live in
`src/lib/cad/project-v2.js`; its modular schema pack is under `protocol/cad/v2/`.

A v2 project carries typed identity/domain/revision, explicit coordinate system and units, editable
geometry entities/relationships/constraints, domain modules, source/derived assets, views/sheets,
scenes/productions, output dependencies, delivery packages, receipts, revisions and professional
review state. `architecture.building` requires an architecture module; `mechanical.part` does not
inherit building-only concepts such as rooms or roofs.

The source-types catalog supplies `sourceKindRef` and `formatRef`. A format reference identifies a
format; it does not assert that an engine can read, edit, validate, preview or export it.

V1 remains a compatibility/migration input. `normalizeCadV1` preserves original editable inches,
IDs, arrays and unknown source fields in `compatibility.sourceDocument`; it does not rescale approved
geometry. Keep the original v1 document recoverable.

### Important current runtime boundary

The Node `agentsam cad project` local CLI still creates `createProjectRuntime()` with
`FileProjectStore` and the legacy v1 editable-project contract. Its `cad.house_baseline` and
`cad.edit_preview` workflows are v1 workflows. In `agentsam-cad-machinery`, the CAD Creator frontend
still uses `LocalProjectRepository`/browser localStorage and its local backend project routes use
the v1 file-store runtime; the Worker/schema release path stages the v2 contract but does not supply
a v2 project persistence/authoring host. The SDK's v2 validator, normalizer, output invalidation and
completion helpers do not by themselves make any of those paths a full v2 authoring runtime. The
SAM CAD pack delegates project operations to an injected host `projectTools` adapter; use v2 there
only when the live host advertises and validates it. Do not send a v2 document through the v1 local
file-store path or claim that localStorage is durable project authority.

This is a real integration gap, not a reason to add another project store or new parallel route.
The completion path is to replace the localStorage/v1 authority with the existing CAD Creator host
persistence, then wire the existing `cad.project.*` / `design_*` operation family to the canonical
v2 contract and its revision/output receipts. Until that host is deployed, v2 is a contract/schema
and validation capability, not an end-to-end CAD Creator project lifecycle.

## Local v1 project CLI (compatibility path)

```sh
agentsam cad project <get|validate|apply|save|restore|build|inspect|render|export|tools> <request.json> --root <dir>
agentsam cad project workflows
agentsam cad project workflow cad.house_baseline <input.json> --root <dir>
agentsam cad project workflow cad.edit_preview <edit.json> --root <dir>
```

The local store writes immutable revisions and per-revision artifacts under
`.agentsam/cad/projects/` and `.agentsam/cad/artifacts/`. Use a temporary or gitignored root. The
live `agentsam cad project tools` output is authoritative for tool names and input schemas.

## Existing SAM project and model operations

The canonical operation family is:

- `cad.project.get`, `cad.project.validate`, `cad.project.apply`, `cad.project.save`,
  `cad.project.restore`.
- `cad.model.build`, `cad.model.inspect`, `cad.model.render`, `cad.model.export`.
- The local/legacy tool names include `design_project_get`, `design_project_validate`,
  `design_apply_operation`, `design_project_save`, `design_project_restore`,
  `design_model_build`, `design_model_inspect`, `design_model_render`, and
  `design_model_export`.

The SAM pack delegates to the host's project adapter. Apply/save/restore/build/render/export require
the relevant host capability and approval. The local v1 tool table is not proof that a connected
host implements the v2 project contract.

## Durable host-owned CAD jobs

`cad.job.generate`, `cad.job.status` and `cad.job.execute` are the existing durable job lifecycle.
The host owns principal resolution, project/workspace authorization, approval, runner dispatch and
`agentsam_cad_jobs` persistence. `createCadHttpPorts()` already supplies the `jobs` port and maps
these operations to the existing authenticated `/api/cad/openscad/generate`, `/api/cad/freecad/script`,
`/api/cad/blender/script`, `/api/cad/jobs/:id` and `/api/cad/jobs/:id/execute` routes. Do not create a
second queue or route family. Supported engine choices are host-advertised; common job engines
include `freecad`, `openscad` and `blender`. The SAM pack registers `cad.job.*` only when the host
passes the existing `jobs` port to `createCadOperations` and exposes those operations in its live
catalog; a client facade or manifest alone does not make a host runner available.

Python source exposes `AgentSamClient.cad_jobs` and `AsyncAgentSamClient.cad_jobs`. Supply the
trusted host invoker as `cad_job_invoker`; the default client fails closed with
`cad_job_host_not_configured`. The invoker is not a caller-controlled shell or generic stdio bridge.
See `references/python-service-and-jobs.md`.

## Output state and revision rules

V2 output states are `planned`, `queued`, `running`, `generated`, `validated`, `approved`, `stale`,
`failed` and `blocked`. A v2 output is only `generated` when it has its real file URI, SHA-256,
generating project revision, executor name/version and correlated execution receipt. `validated`
requires validation evidence; `approved` requires the required review/authorization. Geometry edits
invalidate dependent outputs. Check dependency cycles before execution.

`professionalReview.permitReady` and `professionalReview.sealed` remain false in the schema. A
successful model build, IFC validation or IDS check is not a permit, professional seal or legal
certification.

## IFC operations

The existing `cad.bim.ifc.inspect`, `cad.bim.ifc.validate`, `cad.bim.ifc.diff` and `cad.bim.ifc.edit`
operations use the IfcOpenShell adapter. `agentsam cad ifc` exposes the corresponding Node CLI.
`edit` writes a **new** IFC file and verifies no new validation errors, preserved GlobalIds and no
changes outside the edited objects. This is direct IFC source editing, not v2 project geometry
editing or a general project-to-IFC round-trip pipeline. See `references/scene-geometry-bim.md`.

## Production operation declarations

`src/lib/cad/production-operations.js` declares target production operations (drawings, schedules,
quantity takeoff, scene/video/presentation and deliverable packaging). They register only when a
real host advertises the operation, resolves principal/resource scope, enforces approval and returns
real artifacts, hashes and receipts. A declaration is not an available provider.
