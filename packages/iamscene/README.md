# @inneranimalmedia/iamscene

The portable InnerAnimalMedia scene format and runtime. A `.iamscene.json` document is the editable source of truth for scene identity, node hierarchy, geometry provenance, materials, assets, cameras, environments, animation tracks and declarative interactions.

The package installs the canonical AgentSam OCCT engine and shared 3D viewport as required bundled dependencies. Consumers install one package; they do not assemble renderer, geometry or adapter packages themselves.

## Install

```bash
npm install @inneranimalmedia/iamscene
```

## Author and validate

```ts
import {
  createSceneDocument,
  createSceneEditor,
  parseSceneDocument,
  serializeSceneDocument,
  validateSceneDocument,
} from '@inneranimalmedia/iamscene';

const sceneDocument = createSceneDocument({
  id: 'product-world',
  name: 'Product World',
});
const editor = createSceneEditor(sceneDocument);
editor.addNode({
  id: 'hero-group',
  name: 'Hero Group',
  kind: 'group',
  transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  visible: true,
  parentId: 'scene-root',
});
const saved = editor.serialize();
const reopened = parseSceneDocument(saved);
if (!validateSceneDocument(reopened).valid) throw new Error('Invalid scene');
```

## Showcase in a browser

```ts
import { createSceneRuntime, parseSceneDocument } from '@inneranimalmedia/iamscene';

const response = await fetch('/scenes/product-world.iamscene.json');
const sceneDocument = parseSceneDocument(await response.text());
const runtime = await createSceneRuntime({
  container: document.querySelector('#scene')!,
  document: sceneDocument,
  assetBaseUrl: new URL('/scenes/', location.origin),
});
runtime.play('intro');

// On unmount:
runtime.dispose();
```

## Scroll-controlled playback

The scene document owns animation tracks and duration. The page section owns scroll
behavior. A host can scrub an animation without starting the runtime's playback loop:

```ts
runtime.pause();
const animation = sceneDocument.animations.find((item) => item.id === 'circuit-loop');
if (!animation) throw new Error('Animation not found');

const progress = Math.max(0, Math.min(1, pageScrollProgress));
runtime.seekAnimation('circuit-loop', progress * animation.duration, { wrap: false });
```

Use `wrap: false` for scroll-driven playback so a looping animation holds its final
keyframe at the end of the section instead of jumping back to its first frame. The
page composition and its scroll preset belong to `@inneranimalmedia/theme-scenes`,
not to the portable `.iamscene.json` document. See
`examples/scroll-controlled-circuit/` for a complete sticky-page example.

## Native OCCT geometry pipeline

OCCT is owned by `@inneranimalmedia/agentsam-occt` and is a required part of this package. Store the canonical feature history in the scene node's `geometry` field; the generated GLTF is a presentation asset, never the only source of truth.

```bash
export AGENTSAM_OCCT_BIN=/absolute/path/to/agentsam-occt
iamscene build-occt scene.iamscene.json
```

The build command creates GLTF presentation geometry plus STEP and BREP geometry-source artifacts, records SHA-256 hashes and updates the scene's asset references. The native executable must be built for the host platform using the canonical `packages/agentsam-occt/native` source and OpenCascade toolchain.

## CLI

```bash
iamscene init scene.iamscene.json --name "New Scene"
iamscene validate scene.iamscene.json
iamscene inspect scene.iamscene.json
iamscene normalize scene.iamscene.json
iamscene build-occt scene.iamscene.json
```

## Document authority and interoperable sources

The IAMScene document is the portable editable scene/presentation graph. It does
not replace the native source-of-truth for a parametric CAD/BIM project, video
timeline, physics simulation or game save-state. Such a project can reference or
export a scene with stable source revisions, asset hashes, coordinate conversions
and explicit supported renderer extensions.

Consumers must not silently degrade missing runtime features. A validating
document is not proof that the host supports every shader, camera mode, model
format, scene effect or transition. Test source-to-public schema parity and
representative rendering behavior before making a deployment claim.

The JSON Schema is owned at `schema/iamscene.v1.schema.json` in this package,
exported as `@inneranimalmedia/iamscene/schema`. The public `$id` and any
legacy R2 mirrors must publish the exact same verified schema bytes.

## Document contract

- `format`: `iamscene`
- `formatVersion`: `1.0.0`
- schema: `https://schemas.inneranimalmedia.com/packages/iamscene/v1/scene.canonical.schema.json`
- coordinate system: right-handed, Y-up, meters by default
- stable IDs for nodes, materials, assets, animations and interactions
- animation tracks are deterministic and time-addressable
- OCCT feature history and source artifacts are retained alongside presentation assets
- no executable JavaScript in scene files
- no Spline runtime or Spline scene file is required by the format or runtime

See `examples/retrofuturistic-circuit-loop/` for the first authored scene and its native geometry sources.

## IAMGeometry: independent reusable geometry assets

A `.iamgeometry` file is a UTF-8 JSON manifest of **references**, not a new mesh or
CAD engine. This allows independent versioning, reuse, and runtime geometry
swapping while keeping the editable source owned by CAD Creator/OCCT (or
another native authoring tool). glTF/GLB remains the interoperable render format.
The schema is exported from `@inneranimalmedia/iamscene/geometry-schema`.

For example `assets/chair.iamgeometry`:

```json
{
  "format": "iamgeometry",
  "formatVersion": "1.0.0",
  "id": "chair-01",
  "name": "Chair",
  "units": "mm",
  "source": {
    "schema": "cad.project.v2",
    "uri": "../cad/chair-project.json",
    "elementId": "chair-01",
    "revision": 3
  },
  "defaultRenderId": "web",
  "representations": [
    { "id": "native", "role": "source", "format": "brep", "uri": "./chair.brep" },
    { "id": "web", "role": "render", "format": "glb", "uri": "./chair.glb" },
    { "id": "mobile", "role": "lod", "lod": 1, "format": "glb", "uri": "./chair-mobile.glb" }
  ]
}
```

Attach it to the **existing** `.iamscene` document's `assets` list using
`mediaType: "application/vnd.inneranimalmedia.iamgeometry+json"` and set any
mesh node's `assetRef` to its asset ID. The browser runtime resolves the
manifest's `defaultRenderId` glTF/GLB relative to the manifest URI. It does
not read BREP/STEP as a web render asset.

Use `SceneEditor.setNodeGeometryAsset(nodeId, assetRef)` to commit a
geometry-only authoring change with undo/redo. Use
`SceneRuntimeHandle.swapGeometry(nodeId, assetOrRef)` to replace the loaded
mesh at runtime. The node's identity, transform, parent, and animation target
remain unchanged. Save the document to persist a swap; runtime-only swaps
do not mutate the authoring document.

A manifest provides reference integrity and metadata validation. Actual
asset bytes/hash verification, authorization, persistence, shared-geometry
caching, LOD selection and full browser end-to-end testing must be handled
separately. No new database catalog or geometry engine is required.

## Formal interchange registry (incremental IAMScene v2 work)

`createIAMSceneFormatRegistry()` has independent `import`, `export`, `live-reference`,
and `round-trip` operations. Use `describe(id)`, `identify(filename)` or `list()`
to discover **actual registered adapters**, rather than inferring functionality
from a filename extension or a viewer that can display a mesh.

Each built-in descriptor includes `sourceTypeIds` linking it to the existing
`agentsam.source-types.v2` identity catalog. For example, `obj` maps to
`model.wavefront-obj`, not the unrelated COFF `.obj`; `stl` maps to
`model.stl`, not the EBU subtitle `.stl`. **`identify()` only supplies a
filename-based adapter candidate.** The host must use the universal source
identification evidence (signature/content/context/user choice) when suffixes
are ambiguous; an import only succeeds if the selected adapter parses the
actual input. A successful SHA-256 reference never certifies file identity.

`implemented` means the SDK provides an operation with an executable adapter;
`unavailable` means **do not call it or label it supported**. A positive
round-trip receipt describes only its named preserved properties. It does not
claim that unspecified features survive. An asset being hash-verifiable as a
live reference does **not** mean it is semantically importable or renderable.

| Input/output | Import | Export | Source reference | Round-trip | Limitations |
| --- | --- | --- | --- | --- | --- |
| `.iamscene`, `.iamscene.json` | Yes | Yes | Yes | Yes | Current canonical v1 document contract, not the future C++ scene-core v2 |
| `.iamgeometry` | Yes | Yes | Yes | Yes | Manifest + linked representations, not a mesh/BRep kernel |
| `.gltf`, `.glb` | Yes | Yes | Yes | Tested | Source-backed hierarchy/material edits; opaque animation/skin/extension data retained, not independently editable |
| `.stl`, `.obj`, `.ply` | Yes | No | Yes | No | Triangle-mesh import into individually addressable `.iamgeometry` + GLB sidecars; explicit units required, no CAD feature history |
| `.step`, `.stp`, `.brep`, `.ifc` | No | **Native OCCT opt-in** | Yes | No | Exports one authorized OCCT geometry node via verified native executable; IFC4 geometric export does not certify BIM completeness |
| `.iges`, `.igs`, `.3mf`, `.ifczip`, `.usd`, `.usda`, `.usdc`, `.usdz`, `.blend`, `.fbx`, `.dae`, `.abc`, `.vdb`, `.dxf`, `.dwg`, `.svg`, `.las`, `.laz`, `.e57` | No | No | Byte-integrity reference only | No | No native semantic adapter registered yet |
| `.png`, `.jpg`, `.jpeg`, `.exr`, `.hdr`, `.ktx2`, `.mp4`, `.m4v`, `.mov`, `.mkv`, `.wav`, `.flac`, `.otio`, `.otioz` | No | No | Byte-integrity reference only | No | Media codecs/editorial interchange remain in their specialist packages until adapters are registered and tested |

`.ifczip` is intentionally distinct from `.ifc`: producing an IFC file is not
proof that a correctly packaged ZIP archive can be exported. Likewise, `.ply`
point clouds without faces are rejected by the triangle-mesh importer rather
than silently treated as triangles. More formats are added with
`registry.registerFormat()` and `registry.registerAdapter()`; none becomes
"supported" by registration of a suffix alone.

### Portable browser / Node APIs

```ts
import { createIAMSceneFormatRegistry } from '@inneranimalmedia/iamscene';

const registry = createIAMSceneFormatRegistry();
const descriptor = registry.identify('warehouse.glb');
console.log(descriptor.operations); // four independently reported operations

const imported = await registry.import('warehouse.glb', originalGlb, {
  id: 'warehouse',
  assetUri: './warehouse.glb',
});
// Consumer persists imported.document and keeps originalGlb at assetUri.

// STL/OBJ/PLY have no reliable built-in distance unit. Supply it explicitly.
const mesh = await registry.import('bracket.stl', stlBytes, {
  id: 'bracket', assetUri: './bracket.stl', sourceUnits: 'mm',
});
// Persist EVERY mesh.generatedFiles entry (GLB + .iamgeometry) next to the scene.
// The source file stays independently linked and is never silently replaced.

// Live references re-resolve bytes through the caller's authorized storage API.
const original = await registry.reference('r2-assets/model.usdz', usdzBytes);
const refreshed = await registry.refreshReference(original, resolveFromAuthorizedStorage);
console.log(refreshed.changed, refreshed.reference.sha256);
```

For optional native CAD/BIM exports **on a machine where the actual executable
is available**, use `createIAMSceneNativeFormatRegistry({ binary })` from
`@inneranimalmedia/iamscene/node`. It checks the real OCCT `--doctor` receipt
before registering STEP, BRep and IFC exporters. Browser-only consumers do not
load or require any native binary; users are never forced to have FreeCAD or
Blender installed.

### CLI: inspect actual capabilities and verify real files

```sh
iamscene formats
# Native exports are advertised only after a successful executable doctor:
iamscene formats --binary /path/to/agentsam-occt

iamscene verify ./scene.iamscene.json
iamscene verify ./assembly.glb
iamscene convert ./bracket.stl --units mm --out ./bracket.iamscene.json
iamscene export ./wall.iamscene.json --out ./wall.ifc --binary /path/to/agentsam-occt
```

`verify` emits a structured JSON receipt with source SHA-256, actual import
status, explicit warnings and (if available) semantic round-trip evidence.
A referenced but unimplemented format reports `semanticImport: unavailable`
and exits with status `2` (not false success). Conversion refuses to overwrite
an existing destination. The source is never replaced. Native exports return
bytes only after the OCCT executable has produced a checked artifact.

For CI and release acceptance, run `AGENTSAM_OCCT_BIN=/absolute/occt npm test`
from `packages/iamscene`. The native test is skipped only when no test engine
was supplied; browser/portable tests never require OCCT. Each new importer and
exporter must add a real fixture and a loss-aware round-trip or format-specific
export check before its capability is advertised.

## IAMScene v2 authoring (experimental; v1 runtime unchanged)

`formatVersion: 2.0.0` is a new **scene file schema version**, independent
of the npm package and root SDK versions. It does not silently replace
`1.0.0`. A v2 document can hold multiple independently identified scenes,
objects, geometry, material assets, frames, cameras, skies, fog, lights,
shadows, physics settings, effects, pipelines, states, events, variables and
data sources. The schema lives at `schema/iamscene.v2.schema.json`, exported
as `@inneranimalmedia/iamscene/schema-v2`.

The v2 API exposes `createSceneV2Document`, `validateSceneV2Document`,
`parseSceneV2Document`, `serializeSceneV2Document`,
`migrateSceneV1ToV2`, `createSceneV2Editor`, and
`IAMSCENE_V2_CREATE_OBJECTS`. V2 editor transactions reject broken
cross-references before commit; objects and scene systems have independent
IDs and undo/redo histories. Migration is forward-only; an original v1 file
is never overwritten by the `migrate-v2` command.

```sh
iamscene init draft.iamscene.json --format-version 2 --name "Draft Scene"
iamscene validate draft.iamscene.json
iamscene inspect draft.iamscene.json
iamscene migrate-v2 existing.iamscene.json --out migrated.iamscene.json
```

**Runtime boundary:** The existing Three.js runtime and OCCT integrations
currently implement supported **v1** operations. Do not pass a v2 document to
`createSceneRuntime` or describe v2 particle/physics/interaction fields as
working simulations merely because the schema accepts them. A v2 object
adapter must explicitly provide verified create/inspect/render/serialize
handlers. The root SDK declares these authoring APIs as `api_only`, not
automatically authorized agent tools. The requested Spline inventory is
tracked in the repository's [PrimeTech v2 readiness spec](https://github.com/SamPrimeaux/agentsam-sdk/blob/main/docs/architecture/PRIMETECH_SCENE_V2_READINESS.md).

The public v2 `$id` is reserved for versioned schema publication; **do not
claim the R2 URL is live** until published and read back. The v1 schema and
public consumers remain unchanged.
