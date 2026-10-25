# `@inneranimalmedia/agentsam-occt`

The canonical reusable AgentSam OCCT capability package. It owns the shared provider contract, the browser Boolean/export adapter, and the native C++ engine source. Consumers do not maintain their own copies of OCCT operation code.

## Ownership and runtime boundaries

- `native/` is the single C++ source of truth for the `agentsam-occt` executable.
- `services/cad/occt/` is a compatibility build entrypoint that delegates to this package; it contains no second engine implementation.
- `src/native-provider.mjs` adapts the installed native executable to the existing `cad.project.v1` provider contract. The older SDK path `src/lib/cad/occt-native-provider.mjs` is a compatibility re-export only.
- `src/browser.ts` owns the browser Boolean-to-GLB operation. The host injects an OpenCascade.js loader so each site can resolve its own WASM asset and defer loading until modeling is requested.
- `@inneranimalmedia/agentsam-3d-viewer` is the presentation-only viewer package. It reads GLB/GLTF/STL; it is not a second geometry kernel.

The browser and native adapters are separate builds of the same OpenCascade kernel family because WebAssembly must run in the browser while the C++ executable runs on a native host. They share one operation contract and do not duplicate application-level geometry algorithms.

## Native build

The existing build entrypoint is preserved:

```sh
cmake -S services/cad/occt -B /tmp/agentsam-occt-build -G Ninja \
  -DAGENTSAM_OCCT_PREFIX="$(brew --prefix opencascade)" \
  -DAGENTSAM_BOOST_INCLUDE_DIR="$(brew --prefix boost)/include"
cmake --build /tmp/agentsam-occt-build
/tmp/agentsam-occt-build/agentsam-occt --doctor
```

A supported OCCT development prefix and C++20 toolchain are required. The package does not silently install a kernel or fall back to approximate geometry. Native consumers set `AGENTSAM_OCCT_BIN` to the absolute path of the verified executable; the default is `~/.agentsam/bin/agentsam-occt`.

The SDK native provider maps `design_model_build` for box solids or persisted feature logs and `design_model_inspect` for STEP. Existing `design_model_build` / `design_model_export` tools accept `engine: "occt"` and `element_id` to replay the selected immutable project revision’s `nativeHistory`; formats include STEP, BREP, glTF and IFC. Arbitrary caller-supplied feature histories are not accepted by the project tool. The legacy CLI remains compatible.

## Browser use

A host supplies its OpenCascade.js initializer and WASM URL once, then calls the shared provider's `createBooleanGLB(parameters)`. The kernel is not initialized merely by importing the package. Export filenames are unique per provider instance and temporary WASM filesystem files are removed after export.

## Workflow execution

PrimeTech remains the versioned procedure/orchestration layer. Python procedures run through the existing authorized `sam.superbash` operation and produce evidence receipts; neither PrimeTech nor SuperBash is a second CAD engine or a second terminal daemon.

## Release status

This package is an SDK workspace package and remains private pending native packaging/portability review. Do not publish or claim a standalone native installer until the platform-specific executable build and install path are validated.

## Persistent native project engine

`agentsam-occt --serve` reads one JSON request per line and writes prefixed `AGENTSAM_RESULT=` JSON receipts. OCCT diagnostic output is not a receipt. `@inneranimalmedia/agentsam-occt/session` supplies an ordered Node client with a timeout and explicit close. Tauri owns one process per project, validates project paths and checkpoints the operation log atomically. The existing hosted design document stores `nativeHistory`; no second project database is introduced.

All native coordinates are **millimetres, Z-up**. Viewport conversion is explicit; glTF export uses **metres, Y-up**. The architectural plan retains its existing inches and centre-ratio opening positions.

```json
{"action":"open","projectId":"my-existing-project"}
{"action":"apply","operation":{"id":"wall-001","type":"wall","start":[0,0],"end":[5000,0],"thickness":200,"height":3000}}
{"action":"apply","operation":{"id":"door-001","type":"opening","host":"wall-001","offset":1000,"width":900,"height":2100}}
{"action":"mesh","id":"wall-001","deflection":0.5}
{"action":"replace","operation":{"id":"wall-001","type":"wall","start":[0,0],"end":[5000,0],"thickness":200,"height":3200}}
{"action":"undo"}
{"action":"state"}
```

The unmodified wall measures 3,000,000,000 mm³. Its door cut removes 378,000,000 mm³, leaving 2,622,000,000 mm³. Mesh triangles are produced by OCCT tessellation of that same checked BRep. Opening overlap, out-of-bounds cuts, invalid solids and stale revisions reject the operation without advancing the log.

Supported feature definitions:

| Type | Parameters |
| --- | --- |
| `profile` | Closed 3D `points`, or a `sketch` solver document plus `planeZ` |
| `extrude` | `profile` ID and 3D `vector` |
| `revolve` | `profile`, `origin`, `axis`, `angle` in degrees |
| `sweep` | `profile` and 3D polyline `path` |
| `box`, `cylinder` | Dimensions / radius and height |
| `wall`, `opening` | Plan endpoints / host, left-edge offset, width, height, optional sill |
| `cut`, `fuse`, `common` | `base` and `tool` IDs |
| `transform` | `base`, optional `translation`, `axis` and `angle` |
| `fillet`, `chamfer` | `base`, `radius`, zero-based `edges` |
| `shell` | `base`, signed `distance`, zero-based closing `faces` |
| `offset` | `base`, signed `distance` |

`apply`, `replace`, `syncPlan`, `undo`, and `redo` replay into a candidate model before committing. Replacements append `$replace` events; they never erase the original feature definition. `syncPlan` appends a `$syncPlan` event for the existing plan-owned walls/openings while preserving non-plan features. `state` returns the complete operations array and cursor; `open` replays those values on another process. Every request can specify `expectedRevision` for optimistic concurrency within a live process.

**Identity limit:** element and feature IDs persist through replay and parameter edits. Face and edge indices are local to the evaluated shape. Indexed features record a base geometry fingerprint; changing that geometry rejects stale selectors and requires reselection. This does not claim to solve general persistent topological naming.

### Solver component

`agentsam-sketch-solver` is a separate CMake static library. `solveSketch` accepts `points` with `{id,x,y}` and constraints: `fixed`, `coincident`, `horizontal`, `vertical`, `distance`, `parallel`, `perpendicular`, and `equalLength`. Segment constraints use point IDs `a,b`, with `c,d` for a second segment. It returns `converged`, residual, degrees of freedom and `constrained`, `underconstrained`, or `inconsistent` status. Inconsistent profiles do not extrude. SamSketch exposes line-axis and fixed-length solving and saves the constraints in the same design document.

### Drawings and exports

`export` accepts an element ID, `format` and an absolute output path. STEP and BREP are reopened and measured before success. glTF is an embedded-buffer scene derived from the BRep mesh. IFC4 exports a tessellated `IfcWall` or proxy, semantic opening elements and `IfcRelVoidsElement` with deterministic project/element GUIDs. This is reference geometry; it does not manufacture editable FreeCAD constraints or a construction-ready model from an imported GLB.

SVG requests use `mode: "section"` with `origin`/`direction` or `mode: "projection"` with a viewing direction. Sections use OCCT intersection; projections use OCCT hidden-line removal. Curved drawing edges are sampled into SVG paths. Plan controls cut horizontally at 1,200 mm; sections cut through the selected wall centre; elevations use the wall normal. These are geometric drawings, not annotated construction sheets.

### Portable desktop runtime

`npm --prefix packages/agentsam-desktop-shell run prepare:cad` compiles this source and stages `generated/runtime/cad`. On macOS it recursively copies non-system dylibs, rewrites dependencies to `@loader_path`, removes development rpaths, includes license notices, signs the binaries and probes a relocated copy with a clean environment. The Tauri resource map includes this directory at `runtime/cad`. Normal bundle scripts and `bundle:shell-only` run this preparation. Other platform bundles fail explicitly until their dependency staging is implemented.

```sh
AGENTSAM_OCCT_BIN="$PWD/packages/agentsam-desktop-shell/src-tauri/generated/runtime/cad/agentsam-occt" \
  node --test packages/agentsam-occt/test/native-engine.test.mjs
```

The native suite verifies solid/mesh volume, immutable replay, parameter undo, failed-operation rollback, exports, drawings, solver consistency and each modeled feature family. Independent IFC validation additionally requires IfcOpenShell; an actual FreeCAD installation is required to validate native FCStd authoring. Existing DreamHouse V1.5 Blender/GLB revisions must not be relabeled as a V1.5 native BIM.
