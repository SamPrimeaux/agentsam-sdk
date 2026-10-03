# @inneranimalmedia/agentsam-loading-scene

Provider-agnostic runtime visualization for AgentSam.

The package turns normalized runtime events into one persistent controller/world/canvas and nine reusable full-frame Computational Hyperspace studies. Runtime semantics choose the study automatically and the renderer cross-fades between studies without rebuilding the canvas, controller, world, or RAF.

## Nine fullscreen studies

| Study | Runtime use |
| --- | --- |
| Interdimensional Runway | idle / boot |
| Signal Through the Void | reading / thinking / external waiting |
| Infinite Layer Stack | context loading / asset generation |
| Quantum Navigation Field | tool execution / parallel execution |
| Warped Merkle Space | indexing / verification / compaction |
| Event Horizon Compute Field | build / deployment / manufacturing compile / receipt persistence / success / error |\n| Vector Trace Lattice | raster-to-vector tracing / path convergence |\n| Spectral Gamut Warper | color-profile normalization / alpha-color preparation |\n| Thread Density Matrix | embroidery pre-digitization handoff |

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

`study="auto"` is the production mode. Consumers emit truthful runtime activity; the package chooses and transitions among the nine studies.

For galleries, fixtures, and targeted previews, pin one study with `study="runway"`, `signal`, `layers`, `quantum`, `merkle`, `horizon`, `vector`, `gamut`, or `thread`.



## Canonical AgentSam activity

The package directly accepts the SDK runtime contract `agentsam.activity.v1`
through `adaptAgentSamActivity()`. `progress.current / progress.total` is
projected as deterministic metric points and can drive both the progress
indicator and scene narration.

```ts
const sceneEvent = adaptAgentSamActivity(activityEvent);
controller.handle(sceneEvent);
```

The adapter maps observe/context/plan/execute/verify/compact/waiting/complete
phases and tool/artifact/file/approval/verification events to the same semantic
scene vocabulary. This lets CLI, web, desktop, lead chat and co-worker surfaces
consume one run activity stream instead of inventing product-specific progress.


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

The demo can expose all nine runtime families and manual full-screen study controls. Use `?debugRuntimeVisuals=1` for runtime devtools or `?study=runway` (or any other study id) to force one scene.

## Gates

```bash
npm run typecheck -w @inneranimalmedia/agentsam-loading-scene
npm run test -w @inneranimalmedia/agentsam-loading-scene
npm run build -w @inneranimalmedia/agentsam-loading-scene
npm run build -w hyperspace-demo
npm pack --dry-run -w @inneranimalmedia/agentsam-loading-scene
```
