# CoPro creative V1 — Agent 2 integration handoff

Status: integrated into MovieMode project creation, template browsing, clip inspector and editor preview. This is an internal prototype integration, not a production video-export release. Existing shell, CAD and CMS WIP remain outside this workstream.

## Delivered ownership

- `@inneranimalmedia/copro-templates/creative`: 18 editable project compositions, SVG frame samplers and project-clip sampling. Six scene ports from RenderComp, SwiftClip and Clippkit; twelve original compositions.
- `@inneranimalmedia/copro-templates/motion`: 36 IN/OUT/COMBO presets, eight overlays, four color treatments, deterministic typewriter and keyframe counter. Onda blur/grain and Remotion Bits timing/interpolation adapted without their React/Remotion runtimes. Curves are normalized analytical functions, not claims of pixel identity with upstream springs.
- `@inneranimalmedia/copro-render/transitions`: 32 original upstream GL Transitions shaders plus four original CoPro shaders. Full shader text, author headers and MIT/BSD notices retained. Typed uniforms; endpoint enforcement; context-loss/recovery and disposal; host-owned decoded inputs.
- `src/plugins/creative.js`: optional GSAP native manifest, canonical `installPlugin` installer, account/installation-scoped dispatcher with immediate disablement checks and explicit host-supplied module registration. Exported through existing SDK plugins entry point. No production account was auto-installed. No arbitrary catalog JS loading or new database tables.
- `packages/copro-templates/preview`: mobile-first standalone gallery, editable controls, scrubbing, live WebGL, project/preset and SVG downloads. 104 thumbnails and a catalog manifest. Shader thumbnails identify the shader; live inspector renders its actual effect.

## Integrate with existing authorities

Projects remain `copro.project.v1` with integer microseconds and 1,000,000 ticks/second. Generator clips use `metadata.creative = {schema:'copro.creative-clip.v1', scene, parameters}`. Existing `metadata.transitionOut = {type,durationUs}` is extended additively with optional `parameters`; no renderer or provider is stored in a project. Legacy `fade`, `crossfade`, `wipe`, `zoom`, `glitch` aliases normalize to stable shader IDs.

1. Use `createCreativeProject(id,{projectId,slotValues,canvas})` to instantiate. Keep the resulting project in existing project/storage/editor paths. Media IDs remain IDs; do not persist signed URLs in templates.
2. `renderCreativeProjectFrame(project,timeUs,{resolveAsset})` samples one active creative clip. It respects visibility, clip offsets, in-points and playback rate. Multiple simultaneous creative layers explicitly require the host compositor. A resolver must return a host-authorized image URL/frame snapshot; the procedural fallback is visibly marked as a preview.
3. For a transition, pass host-decoded `ImageBitmap`, video/canvas frame inputs into `createCoProTransitionRenderer(canvas).render({transition:clip.metadata.transitionOut,from,to,timeUs})`. `timeUs` is local transition time. Compute that interval in existing timeline code. Dispose GPU resources and decoded frames in their existing lifecycle.
4. Adapt sampled transforms from `sampleAnimation` into existing compositor clip transforms. Do not run autonomous GSAP clocks or create a second animation timeline. Fractional frame rates use rational numerator/denominator conversion.
5. Import the creative APIs lazily at the host boundary. MovieMode now dynamically loads the catalog, template renderer, thumbnail map and motion samplers; CoPro UI remains a consumer of typed props/actions rather than owning package imports.

## MovieMode integration update — 2026-10-30

The merged creative package is now connected to the existing MovieMode application rather than remaining a gallery-only deliverable:

- Template Studio consumes all 18 editable compositions with real SVG thumbnails, category filters, search, a detail preview and a `Use this composition` action. The existing project store/editor path owns the resulting `copro.project.v1` project.
- The selected composition opens in the existing editor with a rendered SVG preview. Title, subtitle, chapter label and accent color are editable in the clip inspector; updates flow through undoable editor commands and refresh the preview from the same playhead.
- The editor's Effects browser exposes Looks, Overlays, Motion and Graphics. The 36 motion presets are persisted on clips and sampled from timeline-local microseconds. The typewriter copy is editable in the Graphics tab; typewriter and keyframe-counter graphics use deterministic samplers and render as playhead-sampled preview overlays.
- The eight overlay presets and four treatments have real preview treatments. All 36 transitions are discoverable with their package thumbnails and persist through the existing `transitionOut` clip metadata path.
- All 104 catalog preview URLs were resolved in the built MovieMode thumbnail module with zero missing references.
- Compact editor workspaces now use a dark, scrollable bottom sheet with safe-area spacing, a visible drag affordance and thumbnail grids. The host surface has width-container breakpoints for the home page; Work-pane navigation remains authoritative and duplicate app navigation stays hidden.

**Explicit remaining boundary:** transition cards currently persist the selected transition but do not yet run the two-source WebGL shader compositor against decoded timeline frames. Looks, overlays, motion and graphic presets are editor-preview integrations; encoded-video export/compositor parity is not complete. The optional GSAP plugin remains optional and is not auto-installed. Safari/iOS device verification is still outstanding.

## Engine/source investigation and decisions

All requested repositories' package manifests and selected implementation sources were inspected; pinned revisions and source blobs are in package `provenance.json`. No upstream engine dependency tree is installed by this delivery.

| Resource | Actual implementation evidence | Integration opportunity / next step |
| --- | --- | --- |
| Mediabunny | `src/input.ts`, `output.ts`, `conversion.ts`; input/output/conversion and browser codec architecture | Best candidate for host media I/O/export adapter. Keep `copro-media` asset/source authority and `copro-render` render-plan selection. Convert timestamps at adapter boundary; close samples, bound queues, support cancellation. Evaluate exact codec config on actual devices. MPL-2.0 core; optional codec packages have their own notices. |
| WebAV | `packages/av-cliper/src/combinator.ts`, `clips/mp4-clip.ts`; offscreen sprites, encoder queue handling, MP4/OPFS decoding; microsecond metadata | Prototype one decoded-frame/composite export adapter. Compare with Mediabunny rather than installing two processing stacks. OPFS, mp4box, audio resampling and encoder lifecycle are substantive overlapping responsibilities. |
| OpenVideo | `src/lib/project.ts`, editor and export modal; Core plus `@openvideo/engine-pixi`, timeline package, Mediabunny and Pixi dependencies | Reference the separation of store/playback/compositor and export orchestration. Preserve CoPro model/timeline/editor. Do not replace them with another editor. Core example duration is 30,000,000; inspect upstream units per adapter. Its custom license is recorded; no source copied. |
| PixiJS | `autoDetectRenderer.ts`, exports; WebGL-first backend selection with WebGPU/canvas alternatives | Potential GPU scene compositing backend behind existing render capability. Avoid a second independent scene owner. Raw GL shaders need filter/input coordinate adapters if mounted in Pixi; the delivered standalone GL runner proves shader feasibility first. |
| Motion Canvas | `makeScene2D.ts`; generator scene factory with 2D editor plugin | Use as an optional offline production tool for explainers/diagrams, then import rendered assets or deliberately adapt scene data. Do not embed its project/editor runtime as CoPro's timeline. |
| Theatre.js | Core sequence implementation and separate core/studio package licenses | Optional authoring bridge for paths/cameras. Its own sequence/playback ownership overlaps ours; no runtime adopted. Review per-package licensing separately from the root license. |
| GSAP | 3.15.0 package/ESM source and real distribution runtime tested | Optional trusted host extension through existing plugins system. Core easing sampling verified with real GSAP. Individual modules require explicit installation selection and injected module objects. Commercial product decision stays a later release item. |

## Browser/platform limits

Chrome 155 on Sam's Mac: all 36 shaders compiled and drew five sampled frames with correct red/blue endpoint pixels, repeated midpoint hashes and context loss/restoration. All 18 compositions, 36 animations and eight overlays rasterized in the browser. This proves creative rendering, not media decoding/export.

iOS Safari has NOT been tested. Agent 2 must test actual H.264/AAC encoder/decoder configurations, device memory, video texture uploads/orientation, WebGL precision, SVG filter output, OffscreenCanvas/OPFS availability and interruption/recovery. Feature-detect capability support, not user-agent strings. Report unavailable export backends explicitly through the existing backend selector. Keep the baseline editor usable without optional plugins.

## Reproduce

```sh
node --test packages/copro-templates/test/*.test.mjs packages/copro-render/test/*.test.mjs test/integration/plugins-creative.test.mjs test/integration/plugins-registry-preferences.test.mjs
node packages/copro-templates/scripts/build-gallery.mjs
node packages/copro-templates/scripts/serve-gallery.mjs
# Open http://127.0.0.1:4317/packages/copro-templates/preview/
# Run the verification page at the same path + verify.html
node scripts/creative/verify-gsap.mjs /absolute/path/to/gsap-3.15.0.cjs
```

The explicit GSAP proof fails if the real provider module is missing; it does not silently skip. Source ports add zero third-party runtime dependencies. GSAP has no runtime dependency closure in its inspected package manifest and remains host supplied. Remotion is not a production dependency. Retain `THIRD_PARTY_NOTICES.md` and per-shader notices in all packaging. Remotion Bits' pinned manifest declares MIT but has no standalone LICENSE text; that provenance gap is recorded without blocking internal development.

Remaining host work: real-media decode/compositing/export; two-source transition shader playback; render/export parity for preview treatments, motion and graphics; persisted media resolution; full captions/audio binding; Safari/iOS proof; optional-plugin settings UI; and a production release decision. MovieMode UI integration is now present, but do not call video export production-ready.
