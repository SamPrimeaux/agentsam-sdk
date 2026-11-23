# Engines and execution lanes

An **engine** creates or interprets geometry. A **lane** is the authorized place it runs: local
machine, remote VM or the CAD service. Check the engine's real readiness and the host's advertised
operation before using a lane. Native binaries do not run inside a Cloudflare Worker.

## Blender

- Use for mesh/scene construction, cameras, lighting, render previews and GLB/STL/OBJ export.
- Node CLI: `agentsam cad blender status|build|inspect|render-preview|export`.
- Build accepts the typed recipe at `protocol/cad/blender-recipe.schema.json`; it does not evaluate
  arbitrary Python. Example: `examples/cad/blender-box-with-hole.recipe.json`.
- Discovery: `--blender-bin` → `AGENTSAM_BLENDER_BIN` → `PATH` → standard installation locations.
- `inspect` returns the input hash, scene objects, transforms, dimensions, bounds, materials,
  cameras/collections and evaluated mesh metrics. Mesh metrics include vertices/edges/faces/triangles,
  shells, non-manifold edges, genus and volume when the mesh is closed. For a closed single-shell
  mesh, genus 1 is evidence of one through-hole; still compare the measured geometry to the request.
- Every build/inspect/render/export step must echo the hash of the exact input it consumed.

## OpenCascade (OCCT)

- Use the native C++ `agentsam-occt` kernel for exact B-Rep solids, boolean operations, feature
  replay, sketch solving, tessellation and drawing generation.
- Locate `~/.agentsam/bin/agentsam-occt` or set `AGENTSAM_OCCT_BIN`. `--doctor` returns version and
  advertised capabilities. The Python `probe_occt()` performs a real box → STEP export → STEP reopen
  and checks the measured volume; a found binary alone is not ready.
- Existing `design_model_build|inspect|export` operations select `engine:"occt"` where the host
  advertises them. Native receipts must identify `engine:"occt"`, the requested operation and the
  measured output. `volume_mm3` is in mm³.
- The current native build recipe and operations are documented in `packages/agentsam-occt/README.md`.
  Do not substitute approximate Python geometry for OCCT.

## FreeCAD

- Use for parametric solids and native CAD interchange. The shared discovery algorithm is implemented
  in Python (`agentsam_sdk.cad`) and Node (`src/lib/cad/freecad-host.js`) and tested against the same
  fixture. It supports a Python host with the correct FreeCAD library environment and command-mode
  `FreeCADCmd`; do not launch the adapter with a bare system `python3`.
- One adapter lives at `python/agentsam_sdk/cad/adapters/freecad.py` and is packaged for the Python
  wheel, npm package and Docker context. It reports B-Rep volume/area, face/edge/vertex counts and
  bounds. `agentsam cad doctor --engine all` probes the native host; `agentsam cad build --request
  req.json --out part.step` is the Python local lane and does not require Node.
- Overrides: `AGENTSAM_FREECAD_PYTHON`, `AGENTSAM_FREECAD_CMD`, `AGENTSAM_FREECAD_HOME`, and
  `AGENTSAM_FREECAD_LIB`. The host must be probed before reporting ready.
- Durable generation uses `cad.job.generate` with `engine:"freecad"` only through an authorized host
  runner. The local build proof and a durable project job are different lanes.

## OpenSCAD

- Use for validated source-driven CSG. `validateOpenScadSource` rejects forbidden source patterns
  before compile; the integration tests pin the no-fake-output behavior.
- There is no separate `agentsam cad openscad` CLI. Use the host-owned `cad.job.generate` operation
  with `engine:"openscad"` or an advertised Docker CAD service executor.

## Docker / hosted CAD service

- The local development service defaults to `http://127.0.0.1:8793`; check `/health` and its
  authenticated capabilities before using it. Executors exist for Blender, FreeCAD and OpenSCAD;
  the service may advertise additional provider routes, but the live capability response decides.
- `CadServiceClient` is the authenticated short-request/file-transfer client. It does not create
  durable jobs. Use `CadJobClient` for host-owned long-running work.
- An unreachable service is an unavailable lane. Use another authorized, verified lane or report
  the gap; never silently substitute a different engine.

## Format and capability rule

`contracts/source-types.v2.json` is the shared source/format identity catalog. The CAD format policy
maps suffixes to identities; it is not a codec registry. IAMScene separately reports import, export,
live-reference and round-trip capability. See `docs/cad/FORMAT_SUPPORT.md` and
`references/scene-geometry-bim.md` before promising a format operation.
