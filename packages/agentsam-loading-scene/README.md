# @inneranimalmedia/agentsam-loading-scene

Provider-agnostic runtime visualization for AgentSam.

The package turns normalized runtime events into one persistent controller/world/canvas and six reusable full-frame Computational Hyperspace studies. Runtime semantics choose the study automatically and the renderer cross-fades between studies without rebuilding the canvas, controller, world, or RAF.

## Six fullscreen studies

| Study | Runtime use |
| --- | --- |
| Interdimensional Runway | idle / boot |
| Signal Through the Void | reading / thinking / external waiting |
| Infinite Layer Stack | context loading / asset generation |
| Quantum Navigation Field | tool execution / parallel execution |
| Warped Merkle Space | indexing / verification / compaction |
| Event Horizon Compute Field | build / deployment / success / error |

Each study is an infinite Canvas 2D loop and scales to the consumer container, so the same component works in a browser side panel, full-screen work surface, modal, or embedded editor.

## Architecture

```text
runtime events
  -> provider-agnostic adapter
  -> LoadingSceneController
  -> SceneState + semantic intent
  -> semantic study selection
  -> seamless cross-fade
  -> one persistent canvas / one RAF
```

## React

```tsx
import { LoadingSceneController, computationalHyperspace } from "@inneranimalmedia/agentsam-loading-scene";
import { LoadingScene, LoadingSceneStatus } from "@inneranimalmedia/agentsam-loading-scene/react";

const controller = new LoadingSceneController(computationalHyperspace);

<LoadingScene
  controller={controller}
  preset={computationalHyperspace}
  study="auto"
  reducedMotion="auto"
>
  <YourRealResult />
</LoadingScene>

<LoadingSceneStatus controller={controller} preset={computationalHyperspace} />
```

`study="auto"` is the production mode. Consumers emit truthful runtime activity; the package chooses and transitions among the six studies.

For galleries, fixtures, and targeted previews, pin one study with `study="runway"`, `signal`, `layers`, `quantum`, `merkle`, or `horizon`.

## Performance contract

- one persistent canvas
- one requestAnimationFrame loop
- conserved persistent World
- seamless cross-fades
- DPR cap
- document visibility pause/resume
- deterministic disposal
- reduced-motion support
- no image/video assets
- no WebGL or shaders
- no fabricated progress

## Preview

```bash
npm run build -w @inneranimalmedia/agentsam-loading-scene
npm run dev -w hyperspace-demo
```

Open `http://127.0.0.1:5181`.

The demo loops through all six runtime families automatically and exposes manual full-screen study controls. Use `?debugRuntimeVisuals=1` for runtime devtools or `?study=runway` (or any other study id) to force one scene.

## Gates

```bash
npm run typecheck -w @inneranimalmedia/agentsam-loading-scene
npm run test -w @inneranimalmedia/agentsam-loading-scene
npm run build -w @inneranimalmedia/agentsam-loading-scene
npm run build -w hyperspace-demo
npm pack --dry-run -w @inneranimalmedia/agentsam-loading-scene
```
