# PrimeTech portable editor program
**Status:** Architecture and execution instructions; no implementation is claimed by these documents.  
**Baseline:** 2026-11-20, GitHub `main`, screenshot/reference inventory supplied in the project brief.  
**Priority:** Lane 1 = CAD Creator. Lane 2 = SamSketch. Both must reach rigorous precision editing; lane order is not a permanent feature restriction.

## North-star outcome
Any future InnerAnimalMedia editor can install the same mature menus, toolbars, inspector fields, docking, project/asset browsers, viewport controls, keyboard accessibility, theme projection, contextual AgentSam, and workbench behavior **without copying their UI implementation**. Each editor still owns its actual document format, coordinate system, precision engine, edit semantics, permission checks, persistence, and export. Precision is an editor-wide quality standard, not the exclusive domain of CAD Creator.

A feature is complete only when a user can perform the actual operation, undo/redo a model mutation, save, reopen, and verify that the source document remains valid. Visual parity and passing unit tests alone are not release acceptance.

## Canonical ownership (do not build another global shell)

| Layer | Existing authority / planned home | Owns | Must not own |
| --- | --- | --- | --- |
| InnerAnimalMedia platform | Existing Local Studio / identity / theme / navigation hosts | Account, installed capabilities, routing, tenant scope, theme authority | Geometry or an independent editor document |
| Portable contracts | `packages/agentsam-contracts/src/` | Typed commands, context, selection, capability checks, inspector descriptors, operation/receipt interfaces | React UI or modeling implementation |
| Shared workbench | `packages/agentsam-workbench/src/design/` and proposed `src/editor/` | Adaptive layout, menu renderers, toolbars, docking, inspector host and field primitives, keyboard/focus, assistant placement | Domain persistence, an asset database, generic fake geometry |
| Domain adapter | Existing CAD and SamSketch design adapters; additional adapters per editor | Maps shared semantic operations into real editor operations, checks capabilities and revisions | Visual duplicate of the shared shell |
| Specialist engine | CAD Creator, SamSketch, SamScene/IAMScene, CoPro and future editors | True geometry, constraints, scene state, materials, simulation, timelines, native source, save/export | Identity or global conversation storage |
| Shared media/asset authority | Existing provider-neutral media services / authorized catalogs | Ownership, bytes, licensing, version, previews | A second editor-specific asset database |
| AgentSam experience | `packages/agentsam-workbench/src/agent/` + host conversation/runtime | Portable composer, mini assistant and contextual conversation display | Independent chat identities and transcripts for each editor |

### Key design rules
1. **Lane 1 CAD Creator is the first proving ground.** Use real native wall editing, source-linked review states, project metadata, 2D/3D/Split, and large object trees. No silent writes to imported meshes.
2. **Lane 2 SamSketch is the second proving ground.** Preserve real source-mesh instance editing, vector/point editing, text, materials, presentation, and specialist typeface authoring. Do not reduce it to a lightweight icon app.
3. **Precision belongs in all interfaces.** Every eligible editor needs explicit units and coordinate spaces, exact numeric input, snapping and constraints appropriate to its domain, non-destructive source relationships, repeatable history and validated exports. Domain adapters determine what is actually supported.
4. **No artificial tool ceiling.** A tool family can be consumed by many editors when their adapters genuinely implement it. Architectural modeling, vector curves, camera creation, 3D primitives, and advanced geometry are not permanently assigned to one product.
5. **Reuse by installation and composition.** There is one generic Create-menu renderer, not a copied menu in each app; installed capability manifests supply actual entries and handlers.
6. **Three plus menus remain semantically distinct:** editor Create, AgentSam composer Attach/Tools, and Side Stage Open tools. Reuse common popover primitives and accessibility, not a combined catalog.
7. **No second editable document.** The existing `DesignWorkspaceAdapter` and domain backend retain the authority for revisions, identity, and receipts.
8. **No nested double editor shell.** Host and iframe must agree which one renders each toolbar, explorer, inspector and assistant. One visible owner per control.
9. **No color hardcoding in leaf components.** Platform themes supply semantic tokens, including safe standalone defaults at the provider boundary.
10. **No decorative TODO buttons.** Future capabilities belong in backlog/docs or an explicit disabled, explained capability discovery experience, never in a working-looking command path.

## Verified anchors from the repository
- `docs/architecture/DESIGN_WORKSPACE_BOUNDARY.md` states the existing portable boundary and preserves specialist authority.
- `packages/agentsam-contracts/src/design-workspace.ts` defines `DesignWorkspaceAdapter`, `DesignWorkspaceSnapshot` and revision-aware operations.
- `packages/agentsam-contracts/src/design-workspace-bridge.ts` provides an existing checked host/guest bridge.
- `packages/agentsam-workbench/src/design/DesignWorkspaceFrame.tsx` supplies explorer/stage/inspector/assistant layout with responsive pane switching.
- `packages/agentsam-workbench/src/agent/Composer.tsx` is the shared input primitive; `AgentConversationSurface.tsx` is a portable thread/composer arrangement.
- `apps/cad-creator/frontend/src/components/quick-add/QuickAddMenu.tsx` and `catalog.ts` provide current CAD creation/catalog UI.
- `apps/cad-creator/frontend/src/lib/design-workspace-adapter.ts` and `apps/samsketch/src/design-adapter.ts` provide existing domain-facing adapters.
- `apps/samsketch/src/main.ts` still assembles substantial engine/editor UI, while `native-scene-editor.ts` implements a separate native scene editing path.
- Local Studio CAD and SamSketch routes currently integrate their editors and assistants differently. Unification must preserve their host/guest security boundaries.
- PR #711 was **open** on 2026-11-20; its `quick-add.css` patch added literal color fallbacks. Treat token repair as unmerged TODO.

These are file-level findings, **not proof that deployed click paths, precision operations, or persistence currently pass**.

## Source of truth for execution
- [Portable editor contracts](PORTABLE_EDITOR_CONTRACTS.md): precise component/file ownership, API shapes and reusability rules.
- [Implementation waves](IMPLEMENTATION_WAVES.md): ordered work instructions, dependencies, merge gates and immediate first PR.
- [Capability and acceptance matrix](CAPABILITY_AND_ACCEPTANCE_MATRIX.md): exact TODO list with destination and live proof criteria.

## Status labels for the program
**EXISTS** = repository file/control identified; runtime behavior still needs validation.  
**EXTRACT** = current implementation exists in a specialist and is a candidate for shared presentation.  
**ADAPT** = shared contract must be connected to a real specialist engine.  
**TODO** = not implemented or not verified and must not be presented as done.  
**SOURCE-GATED** = a real operation requires native document scope, account authorization and revision checks.  
**FUTURE** = candidate work not included in the current wave.

## Release principle
`Inspect existing source → Bind one real operation → Mount inside hosted app → Human click-through → Undo/redo and save/reload → Permission/source-negative test → Package/export check → Installed build check → Merge`.

**Do not merge on test-green alone.** Record the actual file paths, screenshots/video, failing cases, revision receipts and acceptance owner for every wave.
