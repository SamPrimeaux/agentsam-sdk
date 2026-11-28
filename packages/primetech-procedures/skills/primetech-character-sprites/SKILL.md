---
name: PrimeTech · Character and sprite production
description: Create consistent character and pet identities, 2D sprite sheets, 3D companion assets, rigging and animation deliverables.
---

## Trigger conditions
Use for a character, mascot, pet companion, sprite sheet, character states, rigged model or animation package.

## Inputs
Clarify role, personality, visual identity, proportions, references, style, required states, frame dimensions, transparency, timing, and whether the result is 2D, 3D or both.

## Prerequisites
Choose the correct path. A 2D sprite request does not require a 3D model; a 3D companion request does not automatically require CAD. Establish a canonical character reference first.

## Workflow
1. Define identity: silhouette, palette, face, distinctive features, materials and non-negotiable traits.
2. Create a turnaround or pose reference where consistency requires it.
3. For 2D, generate or illustrate individual states and frames with transparent backgrounds and consistent scale.
4. For 3D, use active Meshy tools: text-to-3D, image-to-3D or multi-image-to-3D; retain task IDs and inspect status.
5. Use Meshy rigging and animation only when the model and requested output support them. Render or export with MovieMode where appropriate.
6. Order 2D frames and run primetech.sprite-atlas.build for atlas, metadata and controllable preview.
7. Track stages and approvals with primetech.production-board.manage; compare final render or atlas to the canonical reference.

## Artifact contract
Deliver identity/reference sheet, approved source images, individual frames, sprite atlas, frame metadata, preview and requested 3D model, rig, animation or render exports. Record hashes and provider task identifiers.

## Quality gates
Check continuity, silhouette, proportions, palette, transparent edges, frame bounds, order, cadence, model integrity and export format. A static pose sheet is not a completed animation.

## Persistence
Keep source images and original model outputs immutable. Store derivatives in the project asset pipeline. Do not assume a provider task has completed until status and files are verified.

## Iteration
Refine one dimension at a time: face, pose, material, state, timing or camera. Keep the canonical identity reference attached to each regeneration.

## Handoff
List delivered states, frame count, dimensions, FPS, loop behavior, 3D formats and preview path. Separate completed outputs from tasks still running.

## Failure handling
If a task fails or a model is unsuitable for rigging, retain task receipt and source references. Retry from the last approved stage.
