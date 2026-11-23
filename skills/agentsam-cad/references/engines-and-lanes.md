# Engines and lanes

An **engine** makes geometry; a **lane** is where it runs (local device, remote VM, Docker
service). Pick the engine for the job, then an authorized lane. Workers never run native
binaries.

## Blender (`agentsam cad blender …`)

- Best for: meshes, scenes, lights/cameras, render previews, GLB/STL/OBJ delivery.
- Discovery order: `--blender-bin <path>` → `AGENTSAM_BLENDER_BIN` → `PATH` → common install
  locations. `~/.agentsam/cad.json` records what was found and its `source`.
- Commands: `status`, `build <recipe.json> --out <m.blend> [--input <base.blend>]`,
  `inspect <m.blend>`, `render-preview <m.blend> --out <p.png> [--camera] [--scene] [--width] [--height]`,
  `export <m.blend> --format glb|stl|obj --out <file> [--objects a,b] [--collection name]`.
  Shared: `--timeout 1..600` (default 120), `--cwd`, `--json`; `--no-apply-modifiers` is accepted.
- Build consumes a typed recipe only (`protocol/cad/blender-recipe.schema.json`; worked example
  `examples/cad/blender-box-with-hole.recipe.json`). It never evaluates Python.
- Every result carries `execution_lane`, the Blender version, and an artifact `sha256`.
- Limit: `inspect` reports objects, dimensions, bounds, materials, cameras and modifiers. It does
  not report vertex/face counts or volume, so it cannot by itself prove an interior feature
  such as a hole. Check the recipe's operation list and the preview image for that.

## OCCT (native `agentsam-occt`)

- Best for: exact solids (boolean cut, box solids, persisted feature replay), STEP/BREP/glTF/IFC4.
- Executable: `~/.agentsam/bin/agentsam-occt` or the absolute path in `AGENTSAM_OCCT_BIN`.
  `--doctor` prints an `AGENTSAM_RESULT={…}` receipt with the OCCT version and capabilities
  (`solid.box.create`, `solid.cut`, `solid.inspect.step`, `solid.export.step`, `feature.replay`,
  `sketch.solve2d`, `solid.tessellate`, `drawing.svg`, `solid.export.brep`, `solid.export.gltf`,
  `bim.export.ifc4`).
- Reached through `design_model_build|inspect|export` with `engine:"occt"` (optionally
  `parametric_object_id`, `element_id`). Build replays the selected revision's `nativeHistory`.
- Every native call must end with a receipt whose `ok` is true, `engine` is `occt`, and
  `operation` matches the one requested. Missing or mismatched receipt = not done.
- Inspection reports `volume_mm3` (millimetres, must be a positive finite number).
- Build recipe for the executable lives in `packages/agentsam-occt/README.md`. The package never
  installs a kernel or falls back to approximate geometry.

## FreeCAD

- Best for: parametric solids and STEP/IGES/BREP/STL interchange.
- Binary: `freecadcmd` (recorded in `~/.agentsam/cad.json`). Adapter:
  `services/cad/freecad/adapter.py`, results on a line prefixed `AGENTSAM_RESULT=`.
- Export formats: `step`, `stp`, `iges`, `brep`, `stl`.
- Reached through `cad.job.generate` (`engine:"freecad"`) or the Docker executor. Python-only
  discovery: `agentsam_sdk.cad.discover_freecad` / `probe_freecad`.

## OpenSCAD

- Best for: simple CSG parts from source.
- Source is validated against forbidden patterns before compile (`validateOpenScadSource`);
  `test/integration/openscad-honesty.test.mjs` pins the "no fake output" behavior.
- Reached through `cad.job.generate` (`engine:"openscad"`) or the Docker executor.

## Docker CAD service

- Default `http://127.0.0.1:8793` (`/health`). Executors exist for OpenSCAD, FreeCAD and Blender.
- Treat an unreachable service as an unavailable lane, not an error to paper over: fall back to
  a native lane if one is discovered, otherwise report it.

## Formats

A format reference identifies a format; it does not claim a provider can import, preview,
validate, convert or export it. Ambiguous extensions (`.stl`, `.obj`, `.ts`, `.nc`) stay
candidates until content or context resolves them. Promise only what the chosen engine's
export list above supports.
