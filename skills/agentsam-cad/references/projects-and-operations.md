# Projects, edits, tools, workflows, SAM operations

## Two project contracts

- **v1 (`cad.project.v1`) — what the local runtime executes today.** Inch-based. Collections:
  `walls`, `rooms`, `doors`, `windows`, `furniture`, `parametricObjects`, plus `lighting`,
  `sketchDocument`, `roofType`, `ceilingHeight`. Fixture: `test/fixtures/cad/courtyard-house.json`.
- **v2 (`cad.project.v2`) — the portable target.** Schema `protocol/cad/cad.project.v2.schema.json`,
  source `src/lib/cad/project-v2.js`. Required top-level keys: `schema, id, name, domain, revision,
  coordinateSystem, geometry, modules, assets, views, sheets, scenes, productions, outputs,
  packages, receipts, revisions, professionalReview`. Native units are declared explicitly;
  `architecture.building` requires an architecture module; `mechanical.part` is valid without
  roofs or bedrooms. v1 migration keeps original editable inches and unknown fields under
  `compatibility.sourceDocument`; it never rescales approved dimensions.
- Domain modules and core pieces live under `protocol/cad/v2/` (`core/`, `intent/`,
  `interchange/`, `modules/`, `presentation/`, `validation/`).

## Local project store (CLI)

`--root <dir>` (default: cwd) holds:

```
<root>/.agentsam/cad/projects/<id>/{1.json,2.json,head.json}   # immutable revisions
<root>/.agentsam/cad/artifacts/<id>/<revision>/…               # model.blend, model.glb, courtyard.png, *.json receipts
<root>/.agentsam/cad/workflow-runs/<run_id>.json               # per-step evidence
```

Use a temp or gitignored root. Request files are JSON; pass `-` to read stdin.

## Tools (`agentsam cad project tools` prints the live catalog; trust it over this table)

| Tool | Does | Key input | Capability |
|---|---|---|---|
| `design_project_get` | read a revision | `project_id`, `revision?`, `expected_content_hash?` | design.read |
| `design_project_validate` | validate geometry and references | `project` or `project_id` (+`revision`) | design.read |
| `design_apply_operation` | atomic typed edit | `project_id`, `expected_revision`, `operation{type,…}`, `message?` | design.write |
| `design_project_save` | save an immutable revision | `project`, `expected_revision` | design.write |
| `design_project_restore` | restore old geometry as a **new** revision | `project_id`, `revision`, `expected_revision` | design.write |
| `design_model_build` | build the revision model | `project_id`, `revision?`, `engine` = `occt`\|`blender`, `parametric_object_id?`, `element_id?` | design.write |
| `design_model_inspect` | inspect the built model | `project_id`, `revision?`, `engine?` | design.read |
| `design_model_render` | render a PNG | `project_id`, `revision?` | design.export |
| `design_model_export` | export the built model | `project_id`, `revision?`, `format?`, `engine?`, `element_id?` | design.export |

In a SAM host, apply, save, restore, build, render and export need explicit approval.

## Edit operations (`design_apply_operation.operation.type`)

Verified types: `create_wall`, `create_room`, `add_door`, `add_window`, `add_fixture`,
`create_parametric_object`, `update_wall|room|door|window|fixture` (`{<kind>Id, updates}`),
`delete_*` (deleting a wall cascades to its doors and windows), `move_element`
(`elementType`, `elementId`, `dx`, `dy`, `dz?`), `set_lighting`, `attach_sketch`,
`update_parametric_parameter`, `update_parametric_source`, `batch_operations` (≤256, atomic),
`convert_sketch_selection`. The authoritative list is `applyProjectOperation` in
`src/lib/cad/editable-project-contract.js`. An unknown type fails `unsupported_operation:<type>`;
a bad id fails `element_not_found:<id>`; the result is re-validated before it is saved.

Example request (`edit.json`):

```json
{"project_id":"courtyard-house-fixture","expected_revision":1,
 "operation":{"type":"update_wall","wallId":"wall-0","updates":{"height3D":132}},
 "message":"raise wall-0"}
```

## Workflows

| Key | Steps | Needs |
|---|---|---|
| `cad.house_baseline` | validate → save → reopen → build → inspect → render → export | a valid candidate project; Blender available |
| `cad.edit_preview` | read → edit → reopen → build → inspect → render → export | a saved project and its `expected_revision`; Blender available |

```sh
# input shape: {"project": <project>}   |   {"project_id","expected_revision","operation"}
agentsam cad project workflow cad.house_baseline in.json --root "$ROOT"
agentsam cad project workflow cad.edit_preview   edit.json --root "$ROOT"
```

A workflow halts on invalid validation (`project_invalid`) and on a stale revision
(`revision_conflict`) without claiming any effect.

## SAM operations

- Stable: `cad.project.get|validate|apply|save|restore`, `cad.model.build|inspect|render|export`,
  `cad.job.generate|execute|status`, and standalone `cad.blender.inspect` (`{"source":"<path>"}`).
- Run modes resolve to those operations: `cad.inspect`→`cad.project.get`, `cad.create`→`cad.project.save`,
  `cad.edit`→`cad.project.apply`, `cad.export`→`cad.model.export` (`glb|stl|obj`),
  `cad.generate`→`cad.job.generate` (needs `project_id`, `workspace_id`, `engine`, `prompt`).
- Target production operations (registered only when a host supplies an authorized provider that
  returns an artifact URI, checksum and receipt): `cad.geometry.validate`, `cad.bim.ifc.export`,
  `cad.solid.export`, `cad.mesh.export`, `cad.native.export`, `cad.drawing.generate`,
  `cad.schedule.generate`, `cad.quantity.takeoff`, `cad.document.prepare`, `cad.scene.build`,
  `cad.scene.optimize`, `cad.walkthrough.package`, `cad.presentation.render`, `cad.video.render`,
  `cad.video.project.export`, `cad.deliverables.package`. Check what the host advertises; do not
  assume.
- Every operation carries `project_id`, `revision` and (where needed) `workspace_id`; the provider
  enforces tenant and resource ownership regardless of the UI.
