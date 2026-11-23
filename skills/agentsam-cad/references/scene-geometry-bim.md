# IAMScene, IAMGeometry and BIM

CAD makes geometry; **IAMScene** composes it; **IAMGeometry** references it; **BIM** carries
building semantics. Each has its own authority. Do not collapse them.

## Who owns what

| Thing | Owner | Is | Is not |
|---|---|---|---|
| `cad.project` (v1 runtime, v2 target) | CAD project store | editable, revisioned design source | a render format |
| `.iamscene` / `.iamscene.json` | `@inneranimalmedia/iamscene` | editable scene: nodes, materials, assets, cameras, animation (v1 canonical; v2 authoring format exists) | a geometry kernel |
| `.iamgeometry` | `@inneranimalmedia/iamscene` | JSON manifest of **references** (source CAD element + native/render/LOD representations) | a mesh or BRep |
| OCCT (`agentsam-occt`) | `@inneranimalmedia/agentsam-occt` | exact solid kernel; STEP/BREP/glTF/IFC4 | a viewer |
| IFC source | the original `.ifc` | authority for building semantics | something to "reconstruct" |

## `iamscene` CLI (separate binary from `agentsam`)

```sh
iamscene init <file> [--name <n>] [--format-version 1|2]
iamscene validate <file>          # valid? runtimeSupport is reported, not assumed
iamscene inspect <file>           # counts: objects, geometryResources, assets, systems, behaviors
iamscene migrate-v2 <v1-file> --out <v2-file>   # source unchanged
iamscene formats [--binary <native-occt>]       # the real adapter registry (below)
iamscene export <scene.iamscene.json> --out <file.step|.brep|.ifc> --binary <native-occt>
iamscene verify <file> [--units m|cm|mm|in|ft]
iamscene convert <file> [--units …] [--out <scene.iamscene.json>]
iamscene normalize <file>
iamscene build-occt <file> [--binary <abs-path>] [--output <asset-dir>]
```

Observed: `init --format-version 2`, `validate` (→ `valid:true`, `runtimeSupport:"not-verified"`),
`inspect` and `formats --binary <occt>` all run. `export`, `verify`, `convert`, `normalize`,
`build-occt` were not exercised. `runtimeSupport:"not-verified"` means a valid document is not
proof that a renderer plays it.

SAM operations: `iamscene.v2.create|validate|edit|migrate`, `iamscene.format.list|import|export|reference|round-trip`,
`iamscene.native.export` (opt-in Node/desktop OCCT STEP, BREP and geometric IFC4 export, only after
the native engine passes `--doctor`).

## Format registry: ask it, don't infer from an extension

`iamscene formats` reports four independent operations per format (`import`, `export`,
`live-reference`, `round-trip`), each `implemented` or `unavailable`. `unavailable` means do not
call it and do not call the format "supported". Snapshot with the native OCCT binary supplied:

| Format | Import | Export | Notes |
|---|---|---|---|
| `.iamscene`, `.iamgeometry` | yes | yes | native, round-trips |
| `.gltf`, `.glb` | yes | yes | opaque source payloads preserved; not all mesh/animation internals editable |
| `.step/.stp`, `.brep` | no | yes (OCCT) | no semantic importer; linked bytes are references, not editable elements |
| `.ifc` | no | yes (OCCT, geometric IFC4) | importer below is read-only semantics |
| `.stl`, `.obj`, `.ply` | yes | no | triangle meshes only; **source units required**; point clouds without faces rejected |
| `.iges`, `.3mf`, `.ifczip`, `.usd*`, `.blend`, `.fbx`, `.dae`, `.abc`, `.vdb`, `.dxf`, `.dwg`, `.svg`, images, media | no | no | live-reference only (SHA-256 identity) |

Rules that follow from the registry:

- `identify(filename)` yields a **candidate**. `.stl`/`.obj` are ambiguous with unrelated formats;
  confirm with content or context before importing.
- Mesh import (`stl|obj|ply`) must be given `sourceUnits` (`mm`, …); there is no reliable default.
  It produces individually addressable `.iamgeometry` + GLB sidecars. Persist **every**
  `generatedFiles` entry next to the scene; the original source file stays separately linked.
- A SHA-256 reference proves bytes did not change. It does not prove identity, importability or
  renderability.
- A positive round-trip receipt covers only the properties it names.
- Native STEP/BREP/IFC export registers only when the real OCCT `--doctor` receipt passes
  (`createIAMSceneNativeFormatRegistry({ binary })` from `@inneranimalmedia/iamscene/node`).
  Browser-only hosts do not get it.

## IAMGeometry

A manifest points to a CAD source (`source: {schema:"cad.project.v2", uri, elementId, revision}`)
and lists representations (`native` brep, `web` glb, `lod` glb…) with a `defaultRenderId`. The
browser runtime loads only the glTF/GLB representation; it never reads BREP/STEP as a render
asset. Attach it to a scene `assets` list with
`mediaType: "application/vnd.inneranimalmedia.iamgeometry+json"` and set a mesh node's `assetRef`.
Swap geometry without changing node identity via `SceneEditor.setNodeGeometryAsset` (authoring,
undoable) or `SceneRuntimeHandle.swapGeometry` (runtime only; save to persist). A manifest gives
reference integrity, not byte/hash verification, authorization or LOD selection; do those separately.
Schemas: `@inneranimalmedia/iamscene/geometry-schema`, `packages/iamscene/schema/`.

## BIM

- **IFC in → v2 (read-only semantics).** `src/lib/cad/bim-bridge.js` projects an IFC inspection
  into `cad.project.v2` with `geometryAuthority:"source-ifc"`. The original IFC stays the
  authority. No geometric reconstruction, no parametric editing, no IFC rewrite. It refuses
  truncated inspections (`cad_ifc_inspection_incomplete`), duplicate GlobalIds, unresolved
  relations, a missing source URI, and more than 50,000 entities without pagination. IFC
  GlobalIds are encoded losslessly into CAD ids (`ifc:<hex>`).
- **IFC out.** Geometric IFC4 export through OCCT (`design_model_export` on `engine:"occt"`, or
  `iamscene export … --out x.ifc --binary <occt>`).
- **Building export.** `cad.building.export` (host-authorized, source-driven rectangular building)
  yields IFC4, STEP, DXF, PDF, GLB and MP4 and needs an installed and probed Python CAD
  environment. Python client: `agentsam_sdk.cad.building.CadBuildingClient(endpoint, token)` with
  `probe()`, `export(source, base=None)`, `download(artifact)`; call `probe()` first and treat a
  false result as "not available here".
- Target production ops such as `cad.bim.ifc.export` and `cad.schedule.generate` are contracts until
  a host registers a provider (see `projects-and-operations.md`).
