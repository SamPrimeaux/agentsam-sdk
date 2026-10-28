# `@inneranimalmedia/agentsam-3d-viewer`

A reusable rendering and native-CAD mesh-display capability for any AgentSam product or public site. It does not create geometry and does not initialize OCCT; verified native C++ OCCT B-rep solids remain authoritative in the CAD engine. Use it to display existing GLB, GLTF, or STL assets with responsive sizing, orbit controls, camera fitting, accessible loading/error status, and deterministic disposal.

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

## Shared engineering viewport (v0.2)

Use `createThreeViewport(container, { THREE }, { controls: false, autoRender: false, wrapper: false })`
when the host owns camera navigation, as DreamHouse orbit/walk and CAD Model do.
The returned camera, scene and WebGL renderer use the common GPU lifecycle,
resize observer, color space and cleanup. Do not create another WebGLRenderer
inside those hosts; custom camera controls and CAD object picking stay in the host.

Use `createOcctMeshGeometry(nativeMesh, { THREE })` (or the `/occt` subpath)
for a **display mesh produced by the verified C++ OCCT engine**. It checks
`units: mm`, `axes: z-up`, indices and finite vertex data, maps the result into
Three.js meter / Y-up coordinates and preserves the native data unchanged.
It never turns arbitrary triangle soup into an exact CAD solid.

Integration receipts:
- SamSketch: `apps/samsketch/src/main.ts`
- CAD model: `apps/cad-creator/frontend/src/components/Viewport3D.tsx`
- DreamHouse world: `apps/cad-creator/frontend/src/components/DreamHouseWorldViewport.tsx`
- Native geometry: `apps/cad-creator/frontend/src/lib/native-mesh-three.ts`

Robotics `RenderSystem` now uses this shared viewport lifecycle with Z-up
camera initialization; robot motion/physics and transform controls stay in
robotics. Next work is consolidating scene picking, section planes and BIM
inspection extensions. The viewer does **not** execute a C++ kernel in-browser.
