---
name: agentsam-cad
description: >
  Drive AgentSam's real CAD machinery end to end: choose the right entry point, engine and
  execution lane; build, inspect, render and export models; and prove every step with hashes
  and receipts. Covers Blender typed recipes, revisioned CAD projects (design_* tools,
  cad.project.* / cad.model.* SAM operations, the house-baseline and edit-preview workflows),
  native OpenCascade (OCCT) solids with STEP/BREP/glTF/IFC output, FreeCAD/OpenSCAD jobs,
  IAMScene and IAMGeometry documents, and BIM/IFC semantics.
  Use for any programmatic CAD work, .blend/.glb/.stl/.obj/.step artifacts, parametric edits,
  model inspection, render previews, unit or dimension questions, revision conflicts, and
  "does CAD work here". Triggers on "cad", "blender", "occt", "opencascade", "freecad",
  "openscad", "iamscene", "iamgeometry", "bim", "ifc", "step file", "glb", ".blend", "recipe",
  "box with hole", "courtyard house", "design_model", "cad project", "revision conflict".
metadata:
  short-description: "CAD end to end: pick entry point and lane, build, inspect, render, export, and prove each step"
  aliases:
    - cad
    - blender
    - occt
    - bim
    - iamscene
user-invocable: true
---

# AgentSam CAD

CAD fails quietly. A build can exit 0 with the wrong geometry, the wrong units, or a stale
revision. Every step here is meant to be provable, and "unsupported" is a valid answer.

## The map: three layers, never skip one

1. **Contract** — what is being made. A Blender recipe (`protocol/cad/blender-recipe.schema.json`)
   or a CAD project: editable, revisioned, validated. The runtime today is the inch-based
   project (`cad.project.v1`); `protocol/cad/cad.project.v2.schema.json` is the portable target.
2. **Operation** — who may run it. CLI commands, `design_*` project tools, or SAM operations
   (`cad.project.*`, `cad.model.*`, `cad.job.*`). Writes are approval-gated in a SAM host.
3. **Engine + lane** — where it executes: Blender, OCCT, FreeCAD or OpenSCAD on a local device,
   a remote VM, or the Docker CAD service. Cloudflare Workers never spawn these; use an
   authorized lane.

Around those sit the scene/geometry layer (**IAMScene** composes, **IAMGeometry** references, OCCT
makes exact solids) and **BIM** (IFC semantics in, IFC4 out). Each has its own authority; see
`references/scene-geometry-bim.md`.

## Pick the entry point

| Goal | Use |
|---|---|
| One-off model from a typed recipe | `agentsam cad blender build <recipe.json> --out <m.blend> --json` |
| Inspect, preview or export a `.blend` | `agentsam cad blender inspect \| render-preview \| export` (SAM: `cad.blender.inspect` with `{"source":"<m.blend>"}`) |
| Editable project with revisions (walls, rooms, openings, parametric objects) | `agentsam cad project <get\|validate\|apply\|save\|restore\|build\|inspect\|render\|export> <request.json> --root <dir>` |
| The whole validated path in one run | `agentsam cad project workflow cad.house_baseline <in.json> --root <dir>` or `cad.edit_preview` |
| Exact solids → STEP / BREP / glTF / IFC4 | `design_model_build` with `engine:"occt"` (native `agentsam-occt`) |
| FreeCAD / OpenSCAD generation | `cad.job.generate` with `engine` = `freecad` \| `openscad` \| `blender` through an authorized runner, or the local/Docker executors in `src/lib/cad/` |
| Scene documents, geometry manifests, format import/export | the `iamscene` CLI and `iamscene.*` SAM operations; ask `iamscene formats` what is really implemented |
| BIM / IFC | read-only IFC semantics into `cad.project.v2`; IFC4 export via OCCT; `cad.building.export` |
| Python, no Node (`pip install agentsam-sdk`) | `agentsam cad doctor` (proves FreeCAD/OCCT with a real solid) and `agentsam cad build --request req.json --out part.step` (local FreeCAD, no service needed); in code `agentsam_sdk.cad`: `discover_freecad().run(request)`, `probe_freecad`, `CadBuildingClient` for the remote service |

Routing note: both installs ship an `agentsam` command and whichever is first on `PATH` answers.
The Node one routes `cad blender` and `cad project`; the pip one routes `cad doctor` and `cad build`.
Check `agentsam --version` and `agentsam cad --help` if a subcommand seems missing. Either way,
FreeCAD, OpenSCAD, OCCT and BIM are reached through the tools, operations and executors above.
Confirm what this checkout and host expose with `agentsam cad project tools` and
`iamscene formats` before choosing, and use whichever path they list.

## Discover before you act

```sh
agentsam cad blender status --json     # available, binary, version, execution_lane
agentsam cad project tools             # live tool catalog + input schemas: the source of truth
agentsam cad project workflows         # workflow keys, requires, provides, steps
~/.agentsam/bin/agentsam-occt --doctor # OCCT receipt: version + capabilities (override: AGENTSAM_OCCT_BIN)
cat ~/.agentsam/cad.json               # discovered openscad / freecad / blender binaries and their source
```

A capability exists only when the tool is advertised **and** a probe passes. Installed software
alone advertises nothing. If `available` is false, `status` returns install guidance; relay it
and stop. Never produce a stand-in artifact.

## Standard loop

1. **Discover** (above). Know the engine, version and lane before promising output.
2. **Validate the contract.** `design_project_validate` for projects; a bad recipe fails at build.
   A validation failure halts the pipeline before any write.
3. **Write with `expected_revision`.** Save or apply; on `revision_conflict` re-read and
   re-apply, never retry blind.
4. **Build.**
5. **Inspect and compare.** The build artifact `sha256` must equal the inspect `input.sha256`.
   Then compare objects and dimensions to what was asked, not just the exit code.
6. **Render a preview** and look at the PNG.
7. **Export** in the format the consumer needs.
8. **Report** using the format at the bottom.

## Rules that prevent the usual failures

- **Units first.** v1 projects store inches (`"units":"in"`); the recipe converter emits metres
  (864 in becomes 21.9456 m); OCCT receipts report millimetres (`volume_mm3`). Name the unit
  whenever you state a dimension.
- **Typed operations only.** Recipes and feature logs are data. Arbitrary Python is never
  evaluated, OpenSCAD source is pattern-checked, and OCCT replays a revision's persisted
  `nativeHistory` instead of accepting caller-supplied feature histories.
- **Revision discipline.** Saves are immutable; restore creates a new revision; `batch_operations`
  (up to 256) is atomic. Stale writes fail with `revision_conflict`.
- **Unsupported is an answer.** `roof_geometry_not_supported`, `unsupported_operation:<type>`
  and similar errors are reported verbatim. Never approximate with substitute geometry.
- **Proof beats exit codes.** A step is done when it has an artifact, a sha256 and a receipt that
  names the right operation. "It worked" is not evidence.
- **Don't claim what isn't advertised.** Production capabilities such as `cad.drawing.generate`,
  `cad.bim.ifc.export` and `cad.quantity.takeoff` are contract targets; they exist only when a
  host registers a provider that returns a real output, checksum and receipt.
- **Evidence stays out of the repo.** Use a temp or gitignored `--root`; the project runtime writes
  `.agentsam/cad/{projects,artifacts,workflow-runs}` under it.

## Report format

Engine + version + lane; each artifact path with its sha256; the unit; the objects and
dimensions you checked against intent; and an explicit list of what you did **not** verify.

## Go deeper (load only what the task needs)

- `references/engines-and-lanes.md` — Blender, OCCT, FreeCAD, OpenSCAD, Docker: discovery, formats, limits.
- `references/scene-geometry-bim.md` — IAMScene, IAMGeometry, the format registry, IFC/BIM paths.
- `references/projects-and-operations.md` — project contract, edit operations, tools, workflows, SAM ids, run modes.
- `references/proof-and-triage.md` — hash chain, per-engine geometry checks, error triage, how to re-verify this skill.
