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
- schema: `https://schemas.inneranimalmedia.com/packages/iamscene/v1/scene.schema.json`
- coordinate system: right-handed, Y-up, meters by default
- stable IDs for nodes, materials, assets, animations and interactions
- animation tracks are deterministic and time-addressable
- OCCT feature history and source artifacts are retained alongside presentation assets
- no executable JavaScript in scene files
- no Spline runtime or Spline scene file is required by the format or runtime

See `examples/retrofuturistic-circuit-loop/` for the first authored scene and its native geometry sources.
