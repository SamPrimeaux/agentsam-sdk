# `@inneranimalmedia/agentsam-3d-viewer`

A presentation-only, framework-agnostic Three.js capability for any AgentSam product or public site. It does not create geometry and does not initialize OCCT. Use it to display existing GLB, GLTF, or STL assets with responsive sizing, orbit controls, camera fitting, accessible loading/error status, and deterministic disposal.

## Mount an existing model

```ts
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mountModelViewer } from '@inneranimalmedia/agentsam-3d-viewer';

const runtime = { THREE, OrbitControls, GLTFLoader, STLLoader };
const viewer = mountModelViewer(document.querySelector('#model-preview')!, '/models/house.glb', runtime, {
  ariaLabel: 'Interactive house model',
  background: '#111722',
  showGrid: true,
  autoRotate: false,
});

await viewer.ready;
// On route change / component unmount:
viewer.dispose();
```

The host supplies its existing Three.js runtime so the package does not bundle a second Three.js copy. Consumers must have Three.js installed and pass the `THREE` namespace plus the loaders/controls they use.

Use `createThreeViewport(container, runtime, { autoRender: false })` when a product needs its own scene graph, picking, visibility/isolating, or render loop. The returned viewport exposes the scene, camera, renderer, orbit controls, `fit(object)`, `render()`, and `dispose()` so CAD-specific behavior remains in the host rather than being forced into a generic viewer.

The package reads GLB/GLTF/STL. Precision geometry, Boolean operations, and STEP authoring belong to `@inneranimalmedia/agentsam-occt`; viewer and engine remain separate so marketing pages can display a model without loading the OCCT WebAssembly kernel.

This workspace package remains private until public-site consumption and cross-browser WebGL QA are complete.
