---
name: agentsam-cad
description: >
  Plan, open, import, inspect, edit, compare, validate, render, convert, and export CAD, BIM,
  engineering, and 3D assets through AgentSam's existing contracts and engines. Use when someone
  asks to work with a CAD file or project, make or repair geometry, check dimensions or units,
  build a model, generate drawings, render a preview, prepare fabrication outputs, or debug an
  engine. Covers Blender, FreeCAD, OpenSCAD, native OCCT, CAD project contracts, SAM CAD jobs,
  IAMScene, IAMGeometry, and BIM/IFC. Triggers on CAD, BIM, IFC, STEP, STP, IGES, BREP, FCStd,
  STL, OBJ, PLY, 3MF, DXF, DWG, SVG, GLB, GLTF, BLEND, MOV, MP4, .ifc, .step, .stl, .blend, .mov,
  "open/import this model", "why won't this file import", "convert this CAD file", "box with a
  hole", "check FreeCAD/Blender/OCCT", "compare these models", and "export a drawing".
metadata:
  short-description: "Route CAD/BIM work through real contracts, engines and verified outputs"
  aliases:
    - cad
    - blender
    - freecad
    - openscad
    - occt
    - bim
    - ifc
    - iamscene
    - iamgeometry
user-invocable: true
---

# AgentSam CAD

Treat CAD as source-controlled engineering work, not a one-shot image-generation task. Preserve the
original source, coordinate system, units, semantic identity and revision. A successful process
exit is not proof that the geometry is correct.

## Route the work correctly

1. **Contract — what is authoritative?** A typed Blender recipe, a revisioned CAD project, an IFC
   source, an `.iamscene` document, or an `.iamgeometry` reference manifest. The canonical portable
   project envelope is `cad.project.v2` (`protocol/cad/cad.project.v2.schema.json`). The local
   `agentsam cad project` file-store workflow is still the legacy v1 runtime; do not send a v2
   document through it. Use a host project adapter only when its live tool catalog confirms v2
   support. See `references/projects-and-operations.md`.
2. **Operation — who may perform it?** Use the existing `design_*`, `cad.project.*`, `cad.model.*`,
   `cad.job.*`, `cad.bim.ifc.*`, or `iamscene.*` operation that matches the task. A skill or manifest
   is not an authorization grant. Host operations must enforce tenant, project, workspace and
   resource scope plus required approval.
3. **Engine and lane — where will it run?** Choose Blender, FreeCAD, OpenSCAD, OCCT, IfcOpenShell,
   or IAMScene's registered adapters, then use an authorized local-device, remote-VM or CAD-service
   lane. A Cloudflare Worker must not spawn native geometry binaries.
4. **Proof — what did the engine actually produce?** Check the source hash, project revision,
   engine/version, operation receipt, output bytes/hash, units, geometry/semantic checks and any
   unsupported steps. Never promote `planned` or `running` to `generated` or `validated` by inference.

## Choose the existing entry point

| Goal | Start here |
|---|---|
| Build a mesh/scene from a typed recipe | Node CLI: `agentsam cad blender build <recipe.json> --out <model.blend> --json` |
| Inspect, render or export a Blender model | `agentsam cad blender inspect`, `render-preview`, `export`; inspect topology as well as dimensions |
| Create or edit a legacy local project | Node CLI: `agentsam cad project <get\|validate\|apply\|save\|restore\|build\|inspect\|render\|export>`; this local store is v1, not the v2 authoring runtime |
| Run the existing local project workflows | `agentsam cad project workflow cad.house_baseline …` or `cad.edit_preview`; both are legacy v1 workflows |
| Build exact solids / STEP / BREP / GLB | Existing `design_model_*` tools with `engine:"occt"`, backed by the native `agentsam-occt` binary |
| Run FreeCAD locally without Node | Python CLI: `agentsam cad build --request req.json --out part.step`; use `agentsam cad doctor --engine all` first |
| Generate with FreeCAD, OpenSCAD or Blender as durable work | Existing host operation `cad.job.generate`; use `AgentSamClient.cad_jobs` with an injected trusted host invoker |
| Inspect, validate, compare or edit IFC | Node CLI: `agentsam cad ifc status\|inspect\|validate\|diff\|edit`; edit writes a new IFC file, never overwrites the source |
| Inventory native CAD source assets | `AgentSamClient(procedure_invoker=trusted_host).assets.inventory()`; reuses the authorized `repo.asset.inventory@0.1.0` PrimeTech procedure, not a local duplicate scanner |
| Author or exchange scenes and geometry references | `iamscene` CLI and existing `iamscene.*` SAM operations; query `iamscene formats` before import/export |
| Transfer provider files or run short advertised provider operations | Python `CadServiceClient`; use `download_to()` for large artifacts |

Both the Node SDK and the Python distribution install an executable named `agentsam`. The command
on `PATH` decides which CLI answers. Check `which agentsam` and `agentsam --version` before assuming
a subcommand exists: Node owns `cad blender`, `cad ifc`, and `cad project`; pip owns `cad doctor`
and the local FreeCAD `cad build` lane.

## Discover capabilities before selecting an engine

Run only the discovery commands relevant to the selected installation:

```sh
# Node SDK / SAM project and IFC tools
agentsam cad blender status --json
agentsam cad ifc status --json
agentsam cad project tools
agentsam cad project workflows

# Python SDK / local native engines
agentsam cad doctor --engine all

# IAMScene's actual adapter matrix; pass the discovered native OCCT binary when needed
iamscene formats --binary ~/.agentsam/bin/agentsam-occt
```

Treat the live host catalog and engine receipts as authoritative. `contracts/source-types.v2.json`
and `src/lib/cad/format-policy.js` identify file/source formats; they do not prove that an engine
can import, edit, preview, convert or export them. IAMScene's format registry reports those
operations separately. See `references/engines-and-lanes.md` and
`references/scene-geometry-bim.md`.

## Required execution sequence

1. **Inventory the source.** Keep the original immutable. Identify format from signatures/content
   and application context, not extension alone. Resolve ambiguous `.stl`, `.obj`, `.nc` and similar
   suffixes before choosing a reader.
2. **Lock the design authority.** Prefer the existing project/scene/IFC source and its revision.
   Preserve source units, coordinate frame, element IDs, GlobalIds, relationships and unknown
   extension data. Do not silently rescale or redraw approved dimensions.
3. **Check the real engine and lane.** A binary on disk is not a ready engine. Run its doctor/probe
   and confirm the required operation is advertised by the selected host.
4. **Validate inputs before writes.** Validate the project schema, domain module, recipe, IFC edit
   request, units and source references. Use the current revision and expected hash/revision.
5. **Execute through the existing host.** Use typed operations and trusted job invokers. Do not
   launch arbitrary Python, construct shell strings, create a second queue, or bypass SAM approval.
6. **Inspect the produced artifact.** Check dimensions and units, but also topology/volume for
   solids, manifold state for meshes, and GlobalIds/relationships/properties for IFC. Open the
   preview when one is produced.
7. **Verify and report.** Match the inspected input SHA-256 to the built artifact SHA-256. For a
   v2 output, require its file URI, SHA-256, source project revision, executor/version and correlated
   receipt before calling it `generated`; require validation evidence before calling it `validated`.
8. **State limitations explicitly.** Separate verified facts, calculations, declared source values,
   proposals and professional-review requirements. `professionalReview.permitReady` and `sealed`
   remain false; SAM never issues professional seals.

## Hard boundaries

- A format identity is not an adapter capability. Never infer import/export from an extension.
- A valid `cad.project.v2` schema is not proof that the selected host has a v2 authoring runtime.
  CAD artifact/evidence storage is not project-document persistence; the current Worker scaffold
  reports `worker_routes_not_wired`, while the project-tools route is still local Node/v1.
- IFC semantic projection into a CAD project is source-linked/read-only. The IFC edit operation edits
  an allowlisted set of source properties into a **new file**; it is not parametric geometry editing.
- `CadBuildingClient` is a compatibility wrapper for the experimental rectangular-building proof,
  not the general CAD job API. It must refuse readiness until runtime proof is advertised.
- `CadServiceClient` handles short provider HTTP operations and file transfer. `CadJobClient` uses
  the host's existing `cad.job.*` lifecycle. They are not interchangeable.
- No local SQLite queue, duplicate project store, duplicate format catalog, fake geometry kernel,
  guessed unit, or silent fallback.

## Load the relevant reference only when needed

- Engine choice, binary discovery, provider lanes: `references/engines-and-lanes.md`.
- Project revisions, v1/v2 boundaries, SAM operations and workflow contracts:
  `references/projects-and-operations.md`.
- IAMScene, IAMGeometry, format capability matrix and BIM/IFC: `references/scene-geometry-bim.md`.
- Python clients, durable jobs, authenticated service transport and large files:
  `references/python-service-and-jobs.md`.
- Hash chains, geometric/semantic proof, errors and triage: `references/proof-and-triage.md`.
