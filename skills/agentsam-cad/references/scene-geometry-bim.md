# IAMScene, IAMGeometry, formats and BIM/IFC

Keep the authorities separate:

| Asset or contract | Owns | Does not mean |
|---|---|---|
| `cad.project.v2` | Portable revisioned CAD/BIM project source and output graph | Every local CLI or engine already executes every v2 module |
| `.iamscene` / `.iamscene.json` | Editable scene document: nodes, materials, assets, cameras, animation and scene behavior | A B-Rep geometry kernel |
| `.iamgeometry` | Reusable manifest of source/native/render/LOD geometry references | A mesh, STEP file or B-Rep by itself |
| `agentsam-occt` | Exact solid kernel and native STEP/BREP/glTF/IFC4 operations | A general file viewer or universal importer |
| Original `.ifc` | Authority for building semantics and GlobalIds | A mesh or automatically editable CAD solid |

## IAMScene

The `iamscene` executable is separate from `agentsam`. Common commands include:

```sh
iamscene init <file> [--name <name>] [--format-version 1|2]
iamscene validate <file>
iamscene inspect <file>
iamscene migrate-v2 <v1-file> --out <v2-file>
iamscene formats [--binary <agentsam-occt>]
iamscene export <scene> --out <file> --binary <agentsam-occt>
iamscene verify <file> [--units m|cm|mm|in|ft]
iamscene convert <file> [--units ...] [--out <scene>]
iamscene normalize <file>
iamscene build-occt <file> [--binary <absolute-path>] [--output <asset-dir>]
```

Use `iamscene formats` as the live adapter authority. A valid document can still report
`runtimeSupport:"not-verified"`; schema validity is not proof that a renderer or native engine can
execute every feature. Existing SAM surfaces include `iamscene.v2.create|validate|edit|migrate`,
`iamscene.format.list|import|export|reference|round-trip` and opt-in `iamscene.native.export`.

## IAMScene format capabilities

The format registry distinguishes **import**, **export**, **live-reference** and **round-trip**.
Do not infer one from another. The checked-in registry currently describes these broad boundaries;
query the installed registry for the exact version and provider state:

| Format family | Current IAMScene behavior | Important limit |
|---|---|---|
| `.iamscene`, `.iamgeometry` | Native import/export and round-trip | Keep scene and geometry manifests distinct |
| `.gltf`, `.glb` | Import/export | Opaque payload preservation does not make every animation/mesh detail editable |
| `.step`, `.stp`, `.brep` | Native OCCT export; no general semantic import | A linked file is a reference, not editable CAD entities |
| `.ifc` | Native OCCT geometric IFC4 export; no semantic importer | IFC semantics use the separate BIM bridge below |
| `.stl`, `.obj`, `.ply` | Triangle-mesh import | Source units are mandatory; this is not parametric solid reconstruction |
| `.iges`, `.3mf`, `.ifczip`, `.usd*`, `.blend`, `.fbx`, `.dae`, `.abc`, `.vdb`, `.dxf`, `.dwg`, `.svg`, images and media | Live-reference only unless the live registry says otherwise | Reference identity is not a codec or edit capability |

`identify(filename)` produces a candidate, not a final type. Confirm ambiguous extensions from file
content/signature and application context. Mesh import requires explicit `sourceUnits`; preserve the
original source and every generated `.iamgeometry`/GLB sidecar. A SHA-256 proves byte identity, not
semantic correctness or renderability.

## IAMGeometry

An `.iamgeometry` manifest identifies a source CAD element and its representations (for example
native BREP plus web/LOD GLB). The browser runtime loads the GLB representation; it does not render
STEP/BREP directly. Attach the manifest to the scene assets collection using `mediaType: "application/vnd.inneranimalmedia.iamgeometry+json"` and reference it from the mesh node. Use `SceneEditor.setNodeGeometryAsset` for undoable
authoring or `SceneRuntimeHandle.swapGeometry` for runtime-only swaps; save to persist. A manifest
provides reference integrity, not independent authorization, byte verification or LOD selection.

## Shared format identity vs capability

`contracts/source-types.v2.json` is the shared format/source identity catalog. The CAD
`format-policy.js` maps CAD-relevant suffixes to that catalog. `docs/cad/FORMAT_SUPPORT.md` records
format families and known capability gaps. None of these identity/discovery layers proves a reader,
writer, converter, previewer or round-trip adapter exists. The live IAMScene registry and the
selected host's advertised operations decide.

Notable current boundaries:

- SVG and MOV are recognized for routing, archiving and delivery planning; they do not have
  IAMScene semantic import/export adapters.
- FCStd and BLEND must retain their native source and trusted external application; a GLB preview
  does not replace an editable native file.
- 3MF, RVT, DWG, IFCZIP and USD suffix recognition is not proof of a working reader/writer.
- STL/OBJ/PLY mesh import is not parametric reconstruction.

## BIM and IFC

### Semantic inspection and project projection

`src/lib/cad/bim-bridge.js` projects a bounded IFC inspection into `cad.project.v2` with
`geometryAuthority:"source-ifc"`. It preserves the original IFC as the semantic authority and
creates source-linked semantic entities; it does not reconstruct B-Rep geometry or make those
entities parametric CAD objects. It rejects incomplete/truncated inspection, duplicate GlobalIds,
unresolved relations, missing source URI and oversized unpaginated entity sets.

### IFC validation, diff and safe edit

The IfcOpenShell adapter is exposed through `agentsam cad ifc` and SAM operations:

- `cad.bim.ifc.inspect` — semantic inventory and source evidence.
- `cad.bim.ifc.validate` — schema/model validation.
- `cad.bim.ifc.diff` — compare two IFC files by GlobalId and semantic properties.
- `cad.bim.ifc.edit` — allowlisted attribute/property edits into a **new output file**.

The edit path never overwrites the source. It validates the result, requires no new validation errors,
preserves every GlobalId and proves changes stayed within the edited objects. It is not arbitrary
Python, general geometry editing, or full `cad.project.v2` import/edit/export parity. The latter and
independent IFC round-trip proof remain separate work.

### IFC export and building proof

OCCT advertises geometric IFC4 export when its native doctor reports `bim.export.ifc4`; IAMScene
native export is opt-in and also requires the real OCCT binary. This is geometric export, not a
semantic IFC authoring pipeline. The `cad.building.export` endpoint and `CadBuildingClient` remain a
bounded experimental rectangular-building proof. The endpoint requires runtime proof and is not
the general long-running CAD job API; use host-owned `cad.job.*` for durable project work.

Never describe IFC validation, IDS validation, or a geometric IFC4 export as permit-ready, sealed,
professionally reviewed or code-compliant without the corresponding independent review.
