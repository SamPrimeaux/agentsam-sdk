# CAD project tools — implementation contract

Ticket: tkt_ae8044139c294a6a. Work branch: feat/cad-project-tools-20260922.

## Geometry and surfaces
CAD Creator's editable DesignProject is canonical: coordinates, wall thickness/heights, furniture and room polygons are inches; scale must equal 1. Door/window locations are ratios along their host wall. IDs survive edits and native generation. Display units do not rescale the document.

The existing IAM Design Studio BIM viewport consumes GLB with placement metadata. It does not edit a FreeCAD/BIM object tree. Blender receives metres; exported GLB is the preview interchange, while project JSON remains editable. There is no IFC semantic roundtrip in this implementation.

The courtyard fixture is a reference-derived massing baseline with a 72 by 60 foot bounding envelope, two 22 foot wings and 28 foot centre span. The envelope is not enclosed floor area. Height is an explicit assumption. Roof generation, nonrectangular floor triangulation and parametric-object evaluation are not yet supported by this native adapter and fail explicitly.

## Shared handlers
Nine tools: project get, validate, atomic apply, save, restore; native build, inspect, render, export. Schemas live in shared/cad/src/domain/project-tools.js, geometry validation/edits in project-contract.js, and execution in src/lib/cad/project-runtime.js.

CLI, SDK agent capability adapter, CAD Creator HTTP API and frontend tool dispatcher invoke these same handlers. App builds package the runtime and Blender adapter, including standalone scaffolds.

Save requires expected_revision (0 for new). Restore creates another immutable revision. CLI edits emit filesystem-backed SSE updates to the app; unsaved browser edits are retained on conflict. Native receipts bind content hashes and model digests to exact revisions.

## Running
From the SDK checkout:
```sh
node bin/agentsam cad project tools
node bin/agentsam cad project save request.json --root /absolute/project-root
node bin/agentsam cad project workflows
node bin/agentsam cad project workflow cad.house_baseline baseline-request.json --root /absolute/project-root
node bin/agentsam cad project workflow cad.edit_preview edit-request.json --root /absolute/project-root
npm run dev --prefix apps/cad-creator
```
Baseline request is {project: DesignProject}; edit request is {project_id, expected_revision, operation}. Set AGENTSAM_CAD_PROJECT_ROOT on the app to the same --root used by the CLI. Open the saved project ID using the revision panel.

Local state is .agentsam/cad/projects, native artifacts .agentsam/cad/artifacts, and workflow evidence .agentsam/cad/workflow-runs under the selected root. A native engine is required; there is no simulated success.

## Existing D1 structures
No tables are added.

| Existing structure | Role |
|---|---|
| agentsam_tools | Schema, handler_key cad_project, capability, lifecycle/visibility |
| agentsam_capabilities + agentsam_tool_capabilities | Existing design.read/write/export with exact operations |
| designstudio_design_blueprints | Editable project in sketch_json; revision/hash in generation_config_json |
| scene_snapshots + R2 | Immutable project snapshots; CAD_PROJECT type; owner-scoped access |
| agentsam_workflows / nodes / edges | Baseline and edit-preview graphs, pinned tools, prerequisites |
| agentsam_workflow_runs | Account-owned workflow execution |
| agentsam_executions / execution_steps | Per-tool attempt and verification output |
| agentsam_artifacts / execution_artifacts | Private durable output and per-execution evidence; only populate for actual uploaded objects |
| agentsam_workspace_state / plans / plan tasks / work tracking checkpoint | Existing GOAP work tracking, separate from geometry and execution evidence |

D1ProjectStore implements the existing blueprint/snapshot mapping with injected D1 and R2 bindings, authenticated host scope and transactional optimistic concurrency. It has been tested against the existing schemas. The local app currently uses FileProjectStore; it does not claim automatic cloud synchronisation.

GOAP metadata exposes prerequisites and effects. Effects are returned only after completed verified execution. The existing /goap work tracker has not been replaced by a new planner; consuming these action definitions through its planner remains an integration task.

## Registry and hosted boundary
Generate: node scripts/cad-registry.mjs
Check committed/source parity: node scripts/cad-registry.mjs --check
Check a live D1 export: node scripts/cad-registry-verify.mjs live-rows.json

registry/cad-project includes generated tools, schemas, bindings, capability associations, workflow graphs and SQL. The IAM repo carries the identical manifest and migration plus its backend cad_project bridge. Transport adds sdk_root/project_root and nests the common schema in input. It resolves account identity from authenticated run context and executes through the owned local terminal lane.

The seed deliberately registers tools inactive and workflows draft. Local native proof is not hosted deployment proof. Do not activate until the IAM binding is deployed and the catalog path completes the same roundtrip. Do not widen OAuth/client grants as part of seeding.

## Verification
```sh
node --test test/cad-project.test.mjs test/cad-project-d1.test.mjs test/cad-project-workflow.test.mjs
AGENTSAM_TEST_NATIVE_CAD=1 node --test test/cad-project-native.test.mjs
npm run package:verify --prefix apps/cad-creator
AGENTSAM_TEST_CAD_APP=1 node --test test/cad-project-app.test.mjs
node scripts/cad-registry.mjs --check
```
Verified on the local Mac: real .blend, GLB and PNG; edit/restore rebuild; both workflows; production app API + SSE + stale-write rejection; package build/typecheck/tests. Hosted deployment, browser visual review, D1 host wiring and IFC roundtrip are not claimed by these checks.
