# PrimeTech component, capability and acceptance matrix
**Baseline:** 2026-11-20. **Meaning of status:** `EXISTS` identifies source/UI; `EXTRACT` means move portable UI; `ADAPT` means bind a real operation; `TODO` means not demonstrated/needs implementation; `SOURCE-GATED` denotes real authorization required; `FUTURE` is unscheduled. **No status other than a recorded live acceptance proves production readiness.**

## A. Shared foundation — required for all future interfaces

| ID | Capability | Status | Canonical build location / authority | Acceptance |
| --- | --- | --- | --- | --- |
| F01 | Adaptive editor frame and pane slots | EXISTS/ADAPT | `agentsam-workbench/src/design/DesignWorkspaceFrame.tsx` | No double shell; pane state persists |
| F02 | Editor composition/export | TODO | `agentsam-workbench/src/editor/EditorWorkspace.tsx` + package exports | Imported in CAD and SamSketch |
| F03 | Semantic command IDs and descriptors | TODO | `agentsam-contracts/src/editor-commands.ts` | One ID resolves across toolbar/menu/palette |
| F04 | Installed/authorized command capability | TODO | `agentsam-contracts/src/editor-capabilities.ts` + domain adapters | No hidden permission bypass |
| F05 | Command context and selection kind | TODO | `agentsam-contracts/src/editor-command-context.ts` | Correct mode/selection/source change |
| F06 | Create popover rows, shortcuts and focus | EXTRACT/TODO | `agentsam-workbench/src/editor/EditorMenuPrimitives.tsx` | Pointer/keyboard/touch all work |
| F07 | Create menu renderer | EXTRACT/TODO | `agentsam-workbench/src/editor/EditorCreateMenu.tsx` | Same component in two lanes |
| F08 | Contextual toolbar / tool families | TODO | `agentsam-workbench/src/editor/EditorToolbar.tsx` | Mode changes toolstrip correctly |
| F09 | Tool placement/cancel state | TODO | `agentsam-contracts/src/editor-session.ts` + domain engine | Escape creates no ghost objects |
| F10 | Command palette | TODO | `agentsam-workbench/src/editor/EditorCommandPalette.tsx` | Same command IDs, no duplicate logic |
| F11 | Keyboard shortcuts and help | TODO | Shared menu/tool controller and domain shortcut binding | No conflict or false trigger |
| F12 | Inspector schema and host | TODO | `agentsam-contracts/src/editor-inspector.ts`, `workbench/src/editor/EditorInspectorHost.tsx` | Type-specific context on selection |
| F13 | Reusable property fields | TODO | `workbench/src/editor/EditorInspectorFields.tsx` and field primitives | Precise editing; validation/reset |
| F14 | Object tree/search/virtualization | TODO | `workbench/src/editor/EditorObjectTree.tsx` | 1,881 items usable and frameable |
| F15 | Asset library browsing | TODO | `workbench/src/editor/EditorAssetBrowser.tsx` | Real asset reference and insertion |
| F16 | Template modal, categories, search | TODO | `workbench/src/editor/EditorTemplateBrowser.tsx` | Open/instantiate valid object/scene |
| F17 | Viewport chrome and gizmo | TODO | `workbench/src/editor/EditorViewportControls.tsx` | Projection/presets per active pane |
| F18 | Shared timeline dock UI | TODO | `workbench/src/editor/EditorTimelineDock.tsx` | Mounted only when real runtime exists |
| F19 | Status/revision/units display | TODO | `workbench/src/editor/EditorStatusBar.tsx` | Accurate dirty/saved/source feedback |
| F20 | Theme projection | EXISTS/ADAPT | Platform theme provider + Workbench CSS | All colorways; no leaf color fallbacks |
| F21 | Host/guest revision-aware bridge | EXISTS/ADAPT | `agentsam-contracts/src/design-workspace-bridge.ts` | Origin + resource + revision validated |
| F22 | Composer primitive and thread | EXISTS | `agentsam-workbench/src/agent/Composer.tsx` + `AgentConversationSurface.tsx` | One input implementation |
| F23 | Contextual assistant selection adapter | TODO | `workbench/src/agent/ContextualComposer.tsx` + host adapters | No extra global chat identity |
| F24 | Independent npm install/build | TODO | Workbench `package.json` exports and isolated fixture | No repo source alias required |

## B. Precision — a cross-editor obligation, not an app category

| ID | Precision capability | Status | Proposed owner | Acceptance |
| --- | --- | --- | --- | --- |
| P01 | Unit systems and exact input precision | TODO/ADAPT | `agentsam-contracts/src/editor-precision.ts` + engine | Stored value equals intended model value |
| P02 | 2D/3D/world/local coordinate frames | TODO/ADAPT | Precision contract + each renderer/model | Explicit basis and transforms |
| P03 | Snap types and tolerance reporting | TODO/ADAPT | Domain geometric engine, shared controls | Repeatable geometry landing points |
| P04 | Constraints/relations | TODO/VERIFY | CAD/vector domain solvers | Solve or display truthful unsupported state |
| P05 | Transform XYZ/link/reset | EXISTS/ADAPT | Domain transforms + shared `AxisTriplet` | No loss of precision on reload |
| P06 | Vector nodes and curves | EXISTS UI / VERIFY behavior | SamSketch vector engine + common interaction | Drag node, exact edit, undo/save/reload |
| P07 | Native CAD entities/parametric features | EXISTS portions / VERIFY | CAD native model engine | Native wall/feature retains editable parameters |
| P08 | Source-to-derived geometry relationship | TODO | Domain model provenance | Edit source and regenerate derivative |
| P09 | Non-destructive conversions | TODO | Domain text/path/solid adapters | Preserve original or explicit destructive consent |
| P10 | Model mutation undo/redo | EXISTS portions / ADAPT | Domain history engines | Reversible real model mutation |
| P11 | Revision conflict and stale-write rejection | EXISTS contracts / VERIFY | Domain backends and bridge | No stale silent overwrite |
| P12 | Real quantity/measurement result | EXISTS UI / VERIFY | CAD measure/BOM engine | Quantities agree with geometry and units |
| P13 | Export source fidelity | TODO/VERIFY | CAD/scene/typeface export engines | Round-trip and independent validator |
| P14 | Precision tool accessibility on mobile | TODO | Shared field/mode presentation | Exact entry still usable at 390×844 |

## C. Lane 1 — CAD Creator, first production proof

| ID | Scope | Status | Starting file / destination | Human acceptance |
| --- | --- | --- | --- | --- |
| C01 | Compact Create + menu | EXISTS/EXTRACT | `apps/cad-creator/frontend/src/components/quick-add/QuickAddMenu.tsx` → shared `EditorCreateMenu` | Real action, hover/keyboard, complete labels |
| C02 | Built-in and hosted catalog | EXISTS/ADAPT | `quick-add/catalog.ts`; existing `/api/work/cad/catalog` | Correct account resource and insertion |
| C03 | Native Wall authoring | EXISTS UI / VERIFY | `CadCreatorApp.tsx` + CAD modeling domain | Create/edit precise native wall + save/reopen |
| C04 | Door/window/opening/roof/etc | TODO/VERIFY per operation | CAD feature handlers/geometry domain | Only enabled if native persisted operation exists |
| C05 | Preview/Edit/Source modes | EXISTS/ADAPT | CAD app mode controller + shared toolbar | Correct selectable tool states |
| C06 | 2D/3D/Split panes | EXISTS/ADAPT | CAD viewport + shared per-pane control chrome | Both panes remain interactive |
| C07 | Source-linked DreamHouse item review | EXISTS/SOURCE-GATED | CAD source/project adapter | Source cannot be falsely edited |
| C08 | Authorized native source handoff | SOURCE-GATED/TODO | CAD host/guest revision adapter | Correct project opened or unavailable explained |
| C09 | CAD object inspector schema | EXISTS UI / ADAPT | CAD inspector → shared host and CAD schema | Native vs imported fields differ |
| C10 | Project/document/BOM fields | EXISTS UI / VERIFY | CAD project data/measurement authority | Unit-accurate and real data |
| C11 | Scene tree virtualization | TODO | Shared `EditorObjectTree` + CAD source adapter | 1,881 nodes, filter, reveal, frame |
| C12 | Orientation/zoom/projection/camera | EXISTS portions / ADAPT | CAD viewport controls → common chrome | No camera-object/nav confusion |
| C13 | Lighting/site/material controls | EXISTS UI / VERIFY | CAD renderer/scene adapter | Real environment parameter changes |
| C14 | Asset browser collision in Split | TODO | CAD overlay placement + dock system | No interaction covered by menu |
| C15 | Native geometry export/round trip | TODO/VERIFY | CAD engine/export services | Reopen retains true native semantic values |
| C16 | PR #711 token repair | TODO (PR open baseline) | `quick-add/quick-add.css` + host theme provider | No leaf literal fallback colors |

## D. Lane 2 — SamSketch, second consumer with equal precision ambition

| ID | Scope | Status | Starting file / destination | Human acceptance |
| --- | --- | --- | --- | --- |
| S01 | Real tool palette replacing command cards | TODO | `apps/samsketch/src/main.ts` → shared toolbar/Create menu | Tools no longer listed as icon assets |
| S02 | Object and source part hierarchy | EXISTS/ADAPT | `main.ts`, `native-scene-editor.ts` → object tree host | Correct selection and part ID |
| S03 | Vector drawing / point editing | EXISTS UI / VERIFY+ADAPT | SamSketch vector functions + shared session contract | Nodes/curves edit exactly and persist |
| S04 | 2D primitives and positioning | EXISTS UI / VERIFY | SamSketch geometry engine adapter | Create/place/transform/save/reopen |
| S05 | Source-backed 3D instances | EXISTS/ADAPT | `design-adapter.ts` + scene renderer | Instance changes do not mutate source |
| S06 | Material/PBR and surface presets | EXISTS UI / VERIFY | SamSketch material/scene handlers | Roughness/metalness persist |
| S07 | Scene profiles and atmosphere | EXISTS UI / VERIFY | `samspeaks-controls.ts` + scene renderer | Visual changes survive reload |
| S08 | Text insertion / inspector | TODO/VERIFY | SamSketch text editor + shared Text schema | Font, content, metrics are editable |
| S09 | Typeface specialist studio | EXISTS UI / VERIFY | Existing typeface code | Glyph/metric edits + validated TTF |
| S10 | Font picker from approved library | TODO | Shared `EditorAssetBrowser`/FontPicker + font provider | Licensed font applied and persisted |
| S11 | Gallery metadata and covers | EXISTS gallery / ADAPT | `apps/samsketch/src/gallery` and scene API | Meaningful cards, not blind Untitled list |
| S12 | Mini AgentSam / side assistant styling | TODO | `SamSketchAssistantPane.tsx` → shared composer/presentation | One chat primitive, theme-correct |
| S13 | Native IAMScene edit path | EXISTS/ADAPT | `native-scene-editor.ts` | Real saved node edit; no duplicate document |
| S14 | Precision measurements/constraints | TODO/VERIFY | SamSketch modeling domain | Explicit coordinate/units/constraint semantics |

## E. Advanced tool families — registered only with real execution

| ID | Tool / panel | Status | Candidate build authority | Execution requirement |
| --- | --- | --- | --- | --- |
| A01 | Rectangle / Ellipse / Polygon / Star | TODO/VERIFY by adapter | Vector/geometry engine + shared creation UI | Create actual editable primitives |
| A02 | Pen / Path / Vector point mode | EXISTS UI / VERIFY | Vector engine + shared mode controller | Anchor/control edits and cancel |
| A03 | Text and glyph conversion | TODO/VERIFY | Text engine + Typeface | Source-safe conversion, reload |
| A04 | Input / UI component | FUTURE | UI authoring feature adapter | Real UI semantics, not visual box |
| A05 | Shape blend / Decal | FUTURE | Geometry/material adapter | Source/parameters + undo |
| A06 | Primitives: Plane/Box/Sphere/Cylinder/Cone | TODO/VERIFY by adapter | Actual 3D geometry factory | Persisted geometry and source |
| A07 | Torus/Helix/Lathe/complex solids | FUTURE/VERIFY | Solid/mesh modeling engine | Exact parametric construction |
| A08 | Extrude / Revolve / Sweep / Loft | TODO/VERIFY | CAD/vector solid feature adapter | Recoverable source and parameters |
| A09 | Boolean / Array / Fillet / Chamfer | TODO/VERIFY | CAD/mesh feature adapter | Non-destructive or explicit conversion |
| A10 | Group / Hierarchy | EXISTS portions / ADAPT | Domain scene graph + shared UI | Stable IDs and undo |
| A11 | Camera object creation/inspection | TODO/VERIFY | IAMScene/CAD scene adapter | Authored camera persisted |
| A12 | Point/Directional/Spot lights | TODO/VERIFY | Scene renderer | True light object in document |
| A13 | View projection and orientation gizmo | TODO shared UI | Viewport controller per engine | Perspective/orthographic and frame |
| A14 | Grid/snap/view preset/zoom popover | TODO shared UI | Viewport control + domain snap engine | Explicit values/behaviors |
| A15 | Environment/HDRI/sky/sun | EXISTS portions / VERIFY | Scene/environment domain adapter | Real live renderer change |
| A16 | Fog, color pipeline, ambient shadow | TODO/VERIFY | Scene render settings authority | Real persisted effects |
| A17 | Simulation/physics/particles/hair | FUTURE | Simulation runtime and data model | Executable/documented simulation |
| A18 | Material and color asset stacks | TODO/VERIFY | Rendering engine + asset references | Layer edit/source reuse |
| A19 | Frame/device size presets | TODO | Shared `EditorViewportControls` + frame adapter | Real canvas/frame sizing |
| A20 | Timeline tracks/keyframes | EXISTS contract portions / VERIFY | IAMScene/CoPro timeline authority | Scrub/play/save/reload |
| A21 | Events/states/action picker | FUTURE/VERIFY | Runtime + `editor-interactions.ts` | Trigger executes real action |
| A22 | Variables, typed values, bindings | FUTURE/VERIFY | Runtime data registry and permission service | Set value → bound property changes |
| A23 | APIs/webhooks/voice/AI data | FUTURE | Secure integration/runtime host | Consent, secrets, rate limits and execution |
| A24 | Texture, image, video, audio libraries | EXISTS media service / ADAPT | Shared media authority + browser | Rights and account scope verified |
| A25 | Template object vs scene browser | EXISTS catalog / TODO shared UI | Existing catalogs + shared modal | Correct source instantiation |
| A26 | Font stock and derivative versions | TODO | Theme Store R2 inventory, license, font service | Verified rights and export |
| A27 | Assistant/context/tool capability | EXISTS partial / ADAPT | Workbench agent components + host | Selection scoped, permission enforced |
| A28 | Published installer-ready editor kit | TODO | Workbench package export/release | External install integration passes |

## F. Required interaction matrices

### Generic authoring cycle
```text
Open authorized document
→ choose mode and open Create menu
→ navigate/select command by keyboard, pointer or touch
→ arm/create/place and cancel one attempt
→ place/commit and select actual object
→ inspect exact coordinates/material/source
→ change a real value; capture receipt
→ undo, redo
→ save and hard reload
→ assert object ID + properties + provenance + revision
```

### CAD source-negative cycle
```text
Open source-linked imported item
→ confirm read-only/source-linked authority
→ try menu, shortcut, inspector and assistant mutation
→ reject unauthorized changes
→ verify original source untouched
→ hand off to authorized native project if available
→ execute there with a matching revision
→ reject stale revision attempt
```

### Universal UI regression
- [ ] Opened popover never becomes a permanent oversized project list.
- [ ] Tool labels have accessible complete text even if visual width truncates.
- [ ] Hover is not confused with active, placement or successful commit.
- [ ] Keyboard and touch users can reach every essential action.
- [ ] Menu search, separators, shortcut labels, disabled reason and focus restoration are consistent across all consumers.
- [ ] Explorer/inspector/assistant can collapse and dock without blocking active canvas.
- [ ] Switching selected object changes the inspector correctly, not just the heading.
- [ ] Same field component does not impose false units/precision on different engine types.
- [ ] UI theme aliases follow host theme across iframe boundary; material colors remain document data.
- [ ] 390×844, 1920×1080 and 2560×1440 screen acceptance.
- [ ] Tested on actual packaged/deployed app, not just source snapshot or component preview.

## G. How to admit a new editor in the future
1. Reuse `DesignWorkspaceAdapter`; declare document identity/revision and authenticated resource scope.
2. Implement an engine adapter for commands, selection, inspector data/changes, persistence, history and viewport operations.
3. Register only real supported commands and capability predicates. Resolve source gates in the domain authority.
4. Mount the existing Workbench editor composition, menu, tree, asset, inspector and viewport primitives; do not copy them.
5. Provide an authorized project/asset/font catalog adapter without creating a duplicate database.
6. Use shared AgentSam composer with contextual selection and theme tokens; preserve global vs mini assistant roles.
7. Demonstrate the full generic cycle plus the new domain's precision/negative tests.
8. Record new field types or interaction primitives in Workbench **only when they are genuinely generic**; retain domain tools in the specialist engine.

**No app-specific partition is a feature restriction.** CAD Creator is merely the first delivery lane, SamSketch the second, and every eligible engine can offer high-end precision modeling/vector/scene behavior through actual capabilities.
