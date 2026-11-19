# @inneranimalmedia/copro-templates

**Editable creative starting points for MovieMode and its AgentSam co-producer, CoPro.**

A template is a composable, editable creative structure—not a flattened preview image, a remote model prompt, a video encoding job or a new editor.

## Current verified package scope

- `./creative`: 18 editable compositions and deterministic SVG frame sampling.
- `./motion`: 36 animation variants, overlays, treatments, typewriter and counter sampling.
- Structured canvas, slots, track skeletons, captions, transitions, audio cues, text styles and generation slots.
- Integer-microsecond project timing consistent with the existing CoPro project contract.
- `npm run build:gallery` and `npm run preview`: local development gallery; live transitions require sibling `copro-render` source. Not a production host or complete encoder.

## The full creative application we are aiming for

**Visuals:** authored image/video clips, generative stills with source provenance, procedural scene references, licensed media, vector/title overlays, masks, transitions, compositing and reusable looks.

**Voices and sound:** narration scripting, voice direction, speech generation, transcription, word alignment, captions, audio cleaning, editable mixing, synchronized effects and reviewable alternative deliveries.

**Spatial cinema:** IAMScene, camera paths, material/lighting choices, technical model-derived shots and interactive-to-cinematic handoff. The originating CAD/BIM or scene project remains authoritative.

**Editorial production:** storyboard beats, source clips, shots, in/out, transitions, speed, track layout, titles, sound, review feedback, project revisions, undo/redo, render presets and verified encoded outputs.

These are target workflows, **not automatic claims that all controls are implemented**. Provider contracts in `copro-provider-contracts` advertise what an installed adapter can do; CoPro project commands own local editing. A template can declare a requirement, but missing capability must remain unavailable and visible, not silently replaced.

## CoPro as co-producer

The CoPro assistant analyzes **the selected project state** and proposes specific reversible commands:

1. Inspect the current composition, assets, selected clip and creative brief.
2. Suggest a small set of editorial or production alternatives with previewable impact.
3. Resolve configured provider and permission/cost constraints before external generation.
4. Apply accepted edits through the same command engine, preserving undo and provenance.
5. Record generated media as separate source/derivative assets with rights and content provenance.
6. Export through the real render pipeline and verify output bytes, format and timeline parity.

A narration-generation proposal must not overwrite source dialogue or replace existing media without a deliberate edit. Do not clone a real person's voice without authorization.

## Template contract

Each template should carry stable identity/version, compatible aspect ratios, timebase, required assets, placeholders, editable properties, deterministic animation data, provider capability requirements, source/provenance, license, accessibility and an honest preview/runtime status.

No fixed storage backend, model vendor, host URL or customer identity belongs in this package. Keep `THIRD_PARTY_NOTICES.md` and `provenance.json` with distributions.

## Verification

`npm --prefix packages/copro-templates test`

Demonstrate original media import, editable template application, timing and preview parity, mobile and desktop editor interactions, persistence, and actual encoded output before marking an end-to-end cinematic workflow shipped.

See `../../docs/handoffs/COPRO_CREATIVE_V1_AGENT2.md` for existing integration evidence and limitations.
