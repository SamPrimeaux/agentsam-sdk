# @inneranimalmedia/agentsam-loading-scene

Runtime visualization for AgentSam-powered apps. Real runtime events become
one persistent, near-black "computational hyperspace" the user travels
through while the agent works — never a spinner, never a fake progress bar.

## Architecture

```
real runtime events
  → adapter            (provider/tool names die here — renderer never sees them)
  → OperationStore     (operation graph: operationId / parent / scope; pulse coalescing)
  → deriveScene        (blended VisualIntent vector + throttled user-facing label)
  → TransitionEngine   (states set TARGETS; everything interpolates; no hard cuts)
  → HyperspaceRenderer (ONE world, ONE canvas, ONE requestAnimationFrame)
```

Semantic states (16): `idle boot reading thinking tool_execution
parallel_execution context_loading indexing verification compaction
asset_generation build deployment waiting_external success error`.

Internally these blend into a **visual intent vector**
(`forwardMotion, branching, layerLift, structure, generation, convergence,
verification, fracture, signalActivity, luminance`) so "three parallel tools
+ hero image generating" is a blend, not a scene switch.

## Hard rules encoded here

- **Conservation of geometry** — the world is created once and mutated
  forever. Tests assert array identity across rapid state sequences.
- **Label ≠ state** — labels are user copy ("Generating hero artwork"),
  throttled ~500ms against flicker; tool names/IDs never surface.
- **Coalescing** — 19 rapid file reads = one "Understanding your project"
  with bounded activeCount, never 19 loaders.
- **No fabricated progress** — `progress` is null unless genuinely measured.
- **waiting_external** — the world slows to near-still; no fake activity.
- **Error = localized fracture** on one path; the world stays calm. Real
  error reporting is the app's job.
- **Success = settle-and-reveal** — geometry decelerates, luminance drops,
  real content fades in through it, then the renderer suspends.

## Usage

```tsx
import {
  LoadingSceneController,
  computationalHyperspace,
  adaptAgentSamEvent,
} from "@inneranimalmedia/agentsam-loading-scene";
import {
  LoadingScene,
  LoadingSceneStatus,
} from "@inneranimalmedia/agentsam-loading-scene/react";

const controller = new LoadingSceneController(computationalHyperspace);

// wherever your runtime emits events:
runtime.on(e => controller.handle(adaptAgentSamEvent(e)));
// or imperatively:
controller.start({ operationId: "deploy-1", semantic: "deployment", label: "Publishing" });
controller.complete("deploy-1");

<LoadingScene controller={controller} preset={computationalHyperspace}>
  <Editor /> {/* revealed through the settling geometry on success */}
</LoadingScene>
<LoadingSceneStatus controller={controller} preset={computationalHyperspace} />
```

App-specific event mappings (ecommerce, Completeful, provider webhooks) live
in **your app's adapter**, not in this package. The bundled
`adaptAgentSamEvent` covers the generic AgentSam event vocabulary and falls
back safely on unknown types.

## Presets

`computational-hyperspace` is the first preset of a generic framework:
`{ palette, semanticIntents, geometry, transition, reducedMotionProfile }`.
Future presets (Architectural Blueprint, …) reuse all the machinery.

## Performance / a11y

Canvas 2D, single RAF, DPR capped at 1.75, pauses when the tab is hidden,
deterministic `dispose()`, ResizeObserver-driven sizing, `prefers-reduced-motion`
honored (`"auto"` by default), canvas is `aria-hidden` — real state lives in
the DOM via `LoadingSceneStatus` (`role="status"`, `aria-live="polite"`).
SSR-safe: nothing touches the DOM until mount. Zero runtime dependencies;
React is an optional peer.

## Dev

```
npm run build -w @inneranimalmedia/agentsam-loading-scene
npm run test -w @inneranimalmedia/agentsam-loading-scene
npm run dev -w hyperspace-demo
```

Demo: full simulated site-creation run on load, Replay button top-right.
Append `?debugRuntimeVisuals=1` for the devtools panel (semantic buttons,
auto-cycle, speed) — dev-only, never production UI.
