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

const document = createSceneDocument({
  id: 'product-world',
  name: 'Product World',
});
const editor = createSceneEditor(document);
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
const document = parseSceneDocument(await response.text());
const runtime = await createSceneRuntime({
  container: document.querySelector('#scene')!,
  document,
  assetBaseUrl: new URL('/scenes/', location.origin),
});
runtime.play('intro');

// On unmount:
runtime.dispose();
```

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

## Document contract

- `format`: `iamscene`
- `formatVersion`: `1.0.0`
- schema: `https://schemas.inneranimalmedia.com/iamscene/v1/scene.schema.json`
- coordinate system: right-handed, Y-up, meters by default
- stable IDs for nodes, materials, assets, animations and interactions
- animation tracks are deterministic and time-addressable
- OCCT feature history and source artifacts are retained alongside presentation assets
- no executable JavaScript in scene files
- no Spline runtime or Spline scene file is required by the format or runtime

See `examples/retrofuturistic-circuit-loop/` for the first authored scene and its native geometry sources.
