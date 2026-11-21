# Portable editor contracts and reusable component locations
**Status:** Proposed additions to existing packages, not a declaration that these files already exist.  
**Primary rule:** Promote repeatable **interaction presentation and contracts**; leave geometry, persistence, security, simulation, and document-specific commands with their actual owners.

## 1. Existing files: retain and evolve

| Existing location | Direction | Why |
| --- | --- | --- |
| `packages/agentsam-contracts/src/design-workspace.ts` | EXTEND compatibly | Existing document scope, selection, capabilities, save/execute receipts and revisions; no parallel document protocol |
| `packages/agentsam-contracts/src/design-workspace-bridge.ts` | REUSE / AUDIT | Checked host/guest communication; add capability/projection messaging only with explicit schema/versioning |
| `packages/agentsam-workbench/src/design/DesignWorkspaceFrame.tsx` | EXTEND | Existing adaptive explorer/stage/inspector/assistant slots, persistent widths and mobile panes |
| `packages/agentsam-workbench/src/design/design-workspace.css` | REFACTOR | Resolve semantic theme aliases from host; current hardcoded colors are a migration target |
| `packages/agentsam-workbench/src/agent/Composer.tsx` | KEEP | One text-entry primitive with send/stop and slots |
| `packages/agentsam-workbench/src/agent/AgentConversationSurface.tsx` | KEEP | Persistent thread/composer arrangement |
| `packages/agentsam-workbench/src/agent/ContextualComposer.tsx` | REFACTOR | Selection type and input are CMS-focused; generalize context using adapters, not a separate CAD composer |
| `packages/agentsam-workbench/src/agent/capability-catalog.ts` | REUSE PATTERN | Read-only projection of installed/authorized tools, not an editor command runtime |
| `apps/cad-creator/frontend/src/components/quick-add/QuickAddMenu.tsx` | EXTRACT PRESENTATION | Keep current object/catalog authority, graduate menu rows, focus, hover, keys and popover behavior |
| `apps/cad-creator/frontend/src/components/quick-add/catalog.ts` | RETAIN ADAPTER | Existing built-in catalog + `/api/work/cad/catalog` source; do not duplicate database |
| `apps/cad-creator/frontend/src/lib/design-workspace-adapter.ts` | EXTEND | Enforce native vs source-linked edit semantics and real receipt behavior |
| `apps/samsketch/src/design-adapter.ts` | EXTEND | Real revision/selection/modify/undo/redo/save bridge |
| `apps/samsketch/src/native-scene-editor.ts` | RETAIN ENGINE | Preserve IAMScene source and real node edit path |
| `apps/local-studio/frontend/src/routes/(apps)/admin/cad.tsx` | HOST ADAPT | Keep CAD approval and source-revision bridge |
| `apps/local-studio/frontend/src/routes/(apps)/admin/samsketch.tsx` | HOST ADAPT | Keep scene/context bridge, eliminate duplicate assistant input |
| `apps/local-studio/frontend/src/components/workbench/SamSketchAssistantPane.tsx` | TOKEN/COMPOSER REPAIR | Replace literal white/purple treatment; one shared composer presentation |

## 2. New contract files (TODO)
Place new framework-neutral definitions under `packages/agentsam-contracts/src/`, export them via the existing package conventions.

| Proposed file | Contract responsibility | Consumer |
| --- | --- | --- |
| `editor-commands.ts` | Semantic command ID, namespace, tool group, title, icon reference, shortcut, context predicates, payload validation, undo class | All editor adapters and menus |
| `editor-command-context.ts` | Document/resource identity, editor mode, active tool, selection, pane, viewport, user scope, installed capabilities, source authority | Registry resolution and execution |
| `editor-capabilities.ts` | Supported/unavailable/source-gated/not-installed with reason and true permission predicate | All UI entry points |
| `editor-inspector.ts` | Typed section/field descriptors, visibility, units, validation, read-only, reset, commit policy, binding and property errors | Shared inspector + specialist schemas |
| `editor-viewport.ts` | Viewport ID, 2D/3D/Split view state, projection/orientation, camera identity, plane, snapping, zoom and framing operations | CAD, scene and vector views |
| `editor-assets.ts` | Asset reference, provenance, type, license/ownership, preview, versions and permitted insertion route | Shared browser and catalog adapters |
| `editor-interactions.ts` | States/events/variables/data binding descriptors only when a real scene runtime exists | Future interaction-capable engines |
| `editor-precision.ts` | Unit/coordinate-space descriptors, tolerance/constraint metadata, exact-input result, source/derived model relationship | Every precision-capable editor |
| `editor-session.ts` | Mode transition, placement transaction, cancel, history/refocus and persistence expectations | Runtime adapters and UI |

### Command descriptor (design target, not compiled code)
```ts
type Availability =
  | { state: "ready" }
  | { state: "source-gated" | "read-only" | "not-installed" | "unavailable"; reason: string };

interface EditorCommandDescriptor<Input = unknown> {
  id: string;                 // e.g. cad.wall.create; stable and namespaced
  label: string;
  group: string;
  icon: string;               // semantic icon key, not arbitrary JSX in contract
  shortcut?: string;
  surface: "create" | "toolbar" | "context" | "palette" | "inspector" | "view";
  supportedModes?: string[];
  supportedSelectionKinds?: string[];
  availability(context: EditorCommandContext): Availability;
  validateInput(input: unknown): Input; // or equivalent schema-key strategy
  undoClass: "document" | "viewport" | "none";
  invoke: string;             // symbolic adapter operation ID, not a React callback
}
```

**TODO:** Decide whether serializable manifests carry a schema ID rather than a function for `availability`/`validateInput`. A manifest crossing iframe/network boundaries **must be serializable** and must be revalidated by its domain authority. Do not treat visibility as permission.

### Explicit edit authority (TODO)
```ts
type EditAuthority =
  | { kind: "native-editable"; resourceId: string; revision: string }
  | { kind: "instance-editable"; instanceId: string; sourceId: string; revision: string }
  | { kind: "source-linked-review"; sourceRef: string; handoffAvailable: boolean }
  | { kind: "read-only-revision"; revision: string; reason: string };
```
- Native editable objects can perform only supported native modeling operations.
- Instance editable objects may change their authorized instance/overrides without mutating source asset bytes.
- Source-linked review objects expose inspect, frame, visibility, review note, and only genuinely supported overrides. They never claim native BIM editing.
- Read-only revisions reject mutations even if keyboard shortcuts or toolbars bypass disabled UI.
- Handoff verifies account, project, document identity, origin, revision and authorization at the receiver. Stale writes reject with a useful conflict path.

## 3. New Workbench editor presentation (TODO)
Proposed new public subpath: `@inneranimalmedia/agentsam-workbench/editor`. Confirm package `exports`, build inputs, CSS loading, type output and independent-install smoke tests before publishing. Do not create a second global shell npm package.

```text
packages/agentsam-workbench/src/editor/
  index.ts                       TODO exports
  EditorWorkspace.tsx             TODO compose existing DesignWorkspaceFrame
  EditorDocumentBar.tsx           TODO title, revision, save state, mode, actions
  EditorToolbar.tsx               TODO normal vs contextual toolstrip
  EditorMenuPrimitives.tsx        TODO rows, groups, shortcuts, search, focus, popover
  EditorCreateMenu.tsx            TODO semantic + Create menu
  EditorCommandPalette.tsx       TODO search same command registry
  EditorToolState.ts              TODO FSM presentation/controller, no geometry
  EditorResourceExplorer.tsx      TODO objects/assets/libraries navigation
  EditorObjectTree.tsx            TODO virtualized, selection-linked scene hierarchy
  EditorAssetBrowser.tsx          TODO catalog, thumbnails, filters, insert
  EditorTemplateBrowser.tsx       TODO object/scene template modal, category rail
  EditorInspectorHost.tsx         TODO selection-scoped section composition
  EditorInspectorFields.tsx       TODO field family renderer
  EditorNumericField.tsx          TODO precise scalar, unit display, validation
  EditorAxisTriplet.tsx           TODO XYZ transform field with linkage
  EditorMaterialFields.tsx        TODO shared editable field chrome, not material engine
  EditorViewportControls.tsx      TODO zoom/pan/frame/projection/axes/presets
  EditorStatusBar.tsx             TODO mode, snap, unit, source/readonly feedback
  EditorTimelineDock.tsx          TODO headless controls, only real runtime tracks
  EditorContextAgent.tsx          TODO AgentSam surface placement/adapters
  editor-workspace.css            TODO semantic-token-only styling
```

File names are a proposed API surface; audit existing equivalent primitives and reuse them rather than cloning them under new names. Generic keyboard/menu utilities may belong under `src/shell/` if already present.

## 4. Shared Create menu
**Single visual implementation, multiple capability manifests.** Menu entries come from installed and authorized domain adapters, not from copying a 33-item static example into each product.

### Standard presentation
- A compact scrollable categorized popover anchored to its trigger.
- Optional search, separators, left icon, full accessible name and right-aligned shortcut.
- Hover, pressed, focus, keyboard arrows, Enter, Escape, typeahead, touch scroll, disabled reason.
- Menu placement and clipping respect split view and nested scroll containers.
- Templates opens a separate catalog modal; objects/scenes are distinct domains and assets carry real source metadata.
- Command invocation either activates a placement tool or executes an immediate action. The contract declares which; menu close is not an implicit create.
- Successful placement returns a real created object ID; state moves to selected and the inspector binds to the real document.

### Target command vocabulary (not implementation claims)
**Common vector and text:** Rectangle, Ellipse, Triangle, Pentagon, Polygon, Star, Line, Pen, Path, Shape Blend, Text, Group, Duplicate, Import.  
**Architectural:** Wall, Door, Window, Floor/Slab, Roof, Column, Beam, Stair, Opening, Space/Room, Axis, Dimension, Annotation, Terrain, Landscape, Parametric Part, Architectural Asset.  
**3D objects and modeling:** Plane, Box, Sphere, Cylinder, Cone, Torus, Helix, Lathe, Extrude, Revolve, Sweep, Loft, Boolean, Array, Fillet, Chamfer, Edit Mesh.  
**Scene:** Camera, Point Light, Directional Light, Spot Light, Environment, Fog, Material, Animation, Events, Variables.  
**Specialist:** Typeface workspace, video timeline, BIM quantities, robotic/cinematic tools where installed.

**TODO:** Audit and tag every command `EXISTS / ADAPT / SOURCE-GATED / TODO / FUTURE` by exact owning file and working operation before enabling it. Commands are **not** categorized by app identity alone; they are enabled by adapter capability.

## 5. Context modes, precision and history
Shared UI state targets:
```text
idle → create-menu-open → tool-armed → placing/drawing → commit-requested
  → domain-receipt → selection-updated → inspector-bound → saved → reloaded
             ↘ Escape/cancel → rollback unfinished placement → idle
```
- Edit vs Preview vs Source, 2D/3D/Split, Select, Vector/Point Edit, Placement, Pan, Measure and inspector contexts are separate axes of state.
- Escape cancels placement or node operation without adding a partial object; Escape in a menu closes the menu without mutating the document.
- Document undo/redo is backed by domain mutation history and real revision receipts. Viewport navigation uses explicit separate history semantics.
- Numeric inputs must support exact values, units, min/max/step from the engine, validation errors, keyboard increment and drag/scrub where appropriate. No hardcoded numerical limits inferred from mockups.
- Snapping, constraint solving, node editing, extrusion and parametric operations are real modeling features; shared UI does not implement their kernel.
- Every domain declares coordinate frames, units, conversion, tolerances, origin, handedness and serialization precision. Avoid screen-pixel rounding of authored geometry.
- Non-destructive relationships: path → extrusion remains editable at source path and parameters; 2D wall → native BIM element remains associated; font text → converted vector shape preserves editable source or an explicit irreversible warning/duplicate flow.
- Save/reopen compares canonical document revision and geometry/material values, not just on-screen text fields.
- Long operations have cancellable/observable status without falsifying a success receipt or blocking rendering.

## 6. Inspector architecture
Single `EditorInspectorHost` rendering specialist-owned schemas:
- **No selection:** project/scene overview or minimized inspector, respecting user preference.
- **2D path/shape:** Transform, exact Size, Fill/Stroke, geometry points, corners, optional extrusion/bevel, material, visibility, modifier/interaction when supported.
- **Text:** Content, exact typography metrics, family/style/weight, alignment, case, material, optional 3D geometry; intentional conversion to vector and link to Typeface Studio.
- **Native CAD wall/assembly:** Level, baseline, height, thickness, assemblies/materials, hosted openings, snapping, constraints, quantities and native source link.
- **Imported/source scene part:** Stable ID, provenance, visibility and allowed instance/material overrides, review note, frame and authorized source handoff. No false geometry fields.
- **3D instance/group:** Transform, hierarchy, visibility, material stack, source overrides, duplication/part operations.
- **Camera object:** Transform, projection type, FOV, near/far, preview/pin/use-camera, states/events if implemented.
- **Scene environment:** Background, sky, physical/HDRI, fog, sun/directional/ambient lights, exposure, shadows, material pipeline, effects, terrain and environment presets; true operational controls only.
- **Video or timeline object:** Actual tracks, clip values, keyframes, timing and media source, supplied by CoPro/domain schema.

Shared fields: `NumericField`, `AxisTriplet`, `EnumSelect`, `ToggleField`, `SliderField`, `ColorField`, `AssetReferenceField`, `HierarchyPicker`, `ReadOnlySourceField`, `PropertyBindingField`. Each field has explicit commit, validation, readonly and reset semantics.

## 7. Viewport and scene controls
Separate four distinct meanings:
1. **Viewport navigation:** zoom presets, pan, orbit, axis gizmo, perspective/orthographic, framing, view presets, grid/snap, units, multi-pane focus.
2. **Working/personal camera:** user's current view and transient navigation; not a saved scene-camera entity by default.
3. **Authored camera object:** serialized transform, projection, FOV, clipping, preview, active/play camera.
4. **Scene settings:** world lighting, sky/HDRI, physical sun, fog, environment, effects, simulation and color pipeline, each backed by the scene renderer.

**TODO:** A reusable viewport chrome component must work in each independent split pane and cannot cover the other pane's modeling surface. Camera controls must be meaningful and comprehensive; moving existing tiny toggles into a large generic card is not sufficient.

## 8. Projects, object trees, asset catalog and templates
- Object tree virtualizes large source-backed hierarchies (test 1,881 items), supports search, filter, reveal selection, path breadcrumbs, source/lock badges, multi-selection and keyboard tree navigation.
- Assets browser is separate from tools and scene nodes. Group by asset type, account/source, use, license and collection; search, preview, reference, instantiate/drag insert, revoke, missing asset states.
- Template browser: object/scene tabs; category rail; search; preview; authorized open/instantiate; loading/error/no-results states. Templates do not secretly create a new blank project when the chosen document is unavailable.
- Gallery navigation: meaningful project titles and covers, domain tags, recent/draft/starred, owner/source info; do not create a gigantic list of undifferentiated Untitled scenes.
- Preserve existing shared media authority, not a new R2/D1 catalog. Inspect font and asset licenses before stock distribution.

## 9. Composer and assistant ownership
- `AgentComposer` remains the single primitive; chat/work/compact/contextual/embedded are **presentation configurations**.
- Context payload is a typed projection of selected object, source authority, revision, canvas mode and supportable actions. No proprietary CAD instance object sent as an unchecked arbitrary prompt.
- Small contextual miniAgentSam and global Side Assistant are different surfaces, **not separate conversation databases**. Do not duplicate a global assistant inside an editor iframe.
- Composer `+` and editor `+` share menu presentation, not their command/data catalogs.
- Plugin catalog loads independently from built-in/native Side Stage controls. A registry outage never hides native tools.
- One host-authorized operation path for proposed changes; CAD mutation proposals still require existing approvals.

## 10. Theme, responsive, packaging and security
- Theme authority stays at host settings/CMS theme state. Editor consumes resolved semantic aliases such as `--studio-panel`, `--studio-surface`, `--studio-text`, `--studio-muted`, `--studio-border`, `--studio-accent`, `--studio-hover`, `--studio-focus` and density/radius/spacing.
- Standalone fallback is established by the theme provider, not per CSS declaration. Actual material color values are unrelated to UI accent tokens.
- **TODO:** Replace hardcoded Workbench `--dw-*` default literals, SamSketch mini assistant styles, and PR #711 quick-add fallbacks with provider-owned tokens. Check CSS `#hex`, `rgb` and `hsl` exceptions by policy.
- Mobile: 390×844 CSS viewport is a required acceptance target. Tools remain reachable via drawers and selection-aware tabs, not a permanently overlaid inspector. No double scrollbars, dock overlap, or tiny pointer-only hit targets.
- Package: subpath exports, type declarations, side effect CSS, accessibility, themes, isolated runtime install. Consumers must never import `../../../packages/*/src` as a release dependency.
- Security: authenticated account/project scope, consistent bridge origin/channel/version, revision validation, capability gating server-side, no cross-tenant font/asset exposure. Display-only source item is not editable native geometry.
