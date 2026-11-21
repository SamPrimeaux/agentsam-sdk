# PrimeTech / IAMScene v2 — execution/readiness contract

Basis: owner-supplied 2026-11-20 Spline extraction (220 control/reference rows, 33 Create object entries plus Templates) and inspected PrimeTech/CAD Creator/IAMScene source, 2026-11-21.

This is **not** a claim that Spline internals were implemented or that the captured labels exhaust Spline. Screenshot-confirmed labels, interaction evidence, schema storage, editor commands, renderer/simulator bindings, and production host outcomes require independent verification.

## The four separate version authorities

- Root SDK release: `@inneranimalmedia/agentsam-sdk` version; unrelated to scene document format.
- IAMScene npm package release: independent; it can support multiple file versions.
- `.iamscene` v1: **stable current runtime/document** `formatVersion=1.0.0` / `packages/iamscene/schema/iamscene.v1.schema.json`.
- `.iamscene` v2: **experimental authoring data** `formatVersion=2.0.0` / `packages/iamscene/schema/iamscene.v2.schema.json`. Parsing/validation/migration and editing are implemented; **v2 rendering, events, simulation and host inspectors are not yet claimed implemented**.

Never re-label v1 data as v2 without a real migration. CLI `iamscene migrate-v2 <old> --out <new>` writes a separate file, preserving the source. The public v2 R2 schema URLs are reserved IDs until deployment/readback confirms their content.

## Existing engine and data ownership

| Concern | Source owner / boundary | Observed today |
| --- | --- | --- |
| Scene authoring + v1 runtime | `packages/iamscene` | v1 nodes, camera, environment, animation; glTF/GLB import/export; v2 document/editor is a separate experimental API |
| Native CAD, feature histories, BIM | `apps/cad-creator/schemas/v2`, `@inneranimalmedia/agentsam-occt` | Real CAD-specific contracts/engine; scene assets reference CAD sources, no duplicated BRep kernel |
| CAD drawing/stock/template Create UI | `apps/cad-creator/frontend/src/components/EngineeringWorkbench.tsx`, `quick-add/*` | Existing real CAD-specific tool handlers and theme-scoped gallery; **not** a functioning 33-type scene-object Create menu |
| Studio template resource catalog | Existing `studio_templates` domain | Objects/scenes are reusable resources; do not replace the DB registry with compiled example packs |
| IAMScene-independent capability/operation contracts | `@inneranimalmedia/agentsam-contracts` | `scene-format.v1` handles import/export/reference/round-trip; `scene-document.v2` declares authoring vs runtime operations |
| Root SDK discovery | `protocol/capabilities/manifest.json` + generated inventories | v2 APIs are `api_only: true`; declarations are not executable AgentSam tools until a host handler binds and authorizes them |

## Spline extraction → 3D authoring domain

These are different registries, not 220 node kinds:

| Source evidence | Count | V2 persistence owner | Runtime/UI verification |
| --- | ---: | --- | --- |
| Create menu: 2D shapes | 5 | `objects.kind`, `resources.geometry` | 33-kind vocabulary; no generic v2 viewport adapter yet |
| Create menu: Text/vector/UI | 5 | Object text, vector geometry and referenced assets | No complete font, extrusion, curve-point or input editor wiring yet |
| Create menu: Particle/hair/force | 3 | Object emitter/force references, simulation records | Physics/emitter/hair execution not implemented by this v2 data contract |
| Create menu: 3D shapes/stock | 15 | Parameterized geometry and/or `.iamgeometry`/GLB/CAD asset | Engine support must be verified per type, not inferred from enum |
| Create menu: Group/camera/lights | 5 | Objects, cameras, lights, scene references | Camera viewport, play camera and personal viewport remain separate concepts |
| Templates browser | Separate entry | Existing DB catalog, reusable objects/scenes | An asset being listed is not proof it can be instantiated |
| UI/control inventory | 220 rows | Multiple editor components, inspectors and runtime operations | **Not** 220 implemented or passing controls |

Object serialization includes 33 captured Create types and three legacy/import kinds (`mesh`, `pulse`, `light`). These are allowed data types; `describeSceneV2ObjectSupport()` reports create, inspect, render and serialize separately. The default without an installed adapter is unavailable.

### Scene systems

- Frames and layout: responsive/custom/preset, dimensions, auto zoom — `systems.frames`, `scenes.frameRef`.
- Camera: scene play camera `scenes.playCameraRef`, independently identified `systems.cameras`; working personal viewport in `views.personalCamera`. Neither is automatically an editable camera object in the hierarchy.
- Lighting: `systems.lights`, environment light refs; spot, point, directional, area records; editor settings and lighting outputs remain distinct.
- Environment: independent `systems.environments`, `skies`, `fogs`, `shadows`, `effects` and `pipelines`, linked by stable ID. No giant opaque scene-settings blob.
- Physics/particles/hair: `systems.simulations`, object `emitter` and its force refs. **Simulation and hair handlers absent from v2 SDK**.
- Procedural/model geometry: `resources.geometry` with independent instance `objects.geometryRef`. CAD feature history continues in CAD project / OCCT; geometry assets can be referenced and swapped without changing object identity.
- Materials/textures: reusable `resources.materials`, `assets`, and `materialTextures` with referenced IDs, not isolated renderer-only state.
- States/timeline/interactions: `behaviors.states`, `animations`, `events` and typed actions. **Event execution absent from v2 SDK**.
- Variables/integrations: `behaviors.variables` and `dataSources`; no credentials or executable code stored in scene files. Authorized API/webhook invocations must be host-owned.
- Selected-object inspectors: contextual fields require v2 property setters and actual specialist panel renderers. Serialization alone does not count as a usable inspector.

## Acceptance gates for each captured control

For every `PT-001 ... PT-220` evidence row, record:
1. **Source evidence:** menu/tooltip/selection/control state and screenshot, not inferred implementation.
2. **Document data:** schema property, scope (scene/object/resource/viewport/behavior), stable ID, edit/undo/save/reload, missing-reference handling.
3. **Executable handler:** installed engine or host owns the real command; valid input, side effects, permission, disabled state and error receipt verified.
4. **Editor UI:** relevant visible button/slider/inspector is connected to that handler, with selection-aware fields, keyboard/cancel/undo behavior.
5. **Real outcome:** inspect the actual viewport/simulation/export result, test persistence and reimport, and report lost/unsupported properties.

Do not promote a control to `verified` from a schema entry, a visual screenshot, a fixture, or a stub function.

## Concrete acceptance scenarios

- **Editable 3D text:** place Text → choose font/weight/alignment/spacing → extrude/bevel → edit source text → save/reopen and verify geometry and independent material IDs; currently **not fully wired**.
- **Particle scene:** create Emitter and Force separately → link force ID → change gravity/noise/randomness → play/pause/record simulation → undo/edit/save/reopen; currently **schema only, runtime unavailable**.
- **Primitive scene:** create sphere/cube/torus from the actual object menu → edit dimensions/bevel/extrusion → confirm geometry and instance independently change → verify undo/redo; v2 authoring supports a defined primitive subset, **no generic host v2 viewport renderer yet**.
- **Scenes vs templates:** create two separate scenes, preserve per-scene environment/camera; instantiate a reusable DB template without copying a static library into the app; **v2 multi-scene authoring exists**, host/template round trip not verified.
- **Interactive actions:** state → event → typed action → variable data binding → confirm runtime and no duplicate events after reload; **v2 stores definitions, does not execute them**.
- **Mobile/desktop:** iPhone 13 Pro 390×844 and desktop 2560×1440; inspector, viewport, keyboard and touch routes need actual host testing before accepted.

## Verification commands

```sh
npm --prefix packages/agentsam-contracts test
npm --prefix packages/iamscene test
npm run verify:scene-formats
npm run verify:registry
iamscene init draft.iamscene.json --format-version 2
iamscene validate draft.iamscene.json
iamscene inspect draft.iamscene.json
iamscene migrate-v2 old.iamscene.json --out new.iamscene.json
```

No v2 runtime, simulation or UI host is shipped just because these operations pass. Record each enabled capability with concrete handler binding and evidence.
