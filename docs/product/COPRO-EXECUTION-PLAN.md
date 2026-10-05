# CoPro Execution Plan

Branch: feat/copro-cleanroom-v1
Worktree: /Users/samprimeaux/agentsam-sdk-copro

## Sprint 0 — contracts and visual proof

Land copro-project, copro-editor, copro-timeline, copro-media, copro-render, copro-templates, copro-provider-contracts, copro-proof, copro-ui, agentsam-copro-studio, ADR, PRD and donor audit.

Exit gate: package tests, release train, UI build and a visual app that directly drags/trims/splits/duplicates/deletes clips through the shared command engine.

## Sprint 1 — persistence and media

Status: IN PROGRESS

Completed in current branch:
- portable copro-storage package;
- browser local-storage autosave/reopen;
- real device file import for starting a project;
- canonical track visibility/mute/lock state;
- multi-track demo project with video, audio, captions, and overlay tracks.

Completed additionally:
- reusable in-editor Media shelf;
- add imported media to the existing timeline at the playhead;
- reuse session media multiple times;
- browser media duration probing;
- browser-decoded audio waveform envelopes when supported.

Remaining:
- IndexedDB/OPFS large-project storage;
- durable imported asset handles across reload;
- generated video thumbnails/posters;
- proxy generation for heavy footage;
- replace-clip flow;
- richer metadata probing.

## Sprint 2 — real editor completion

Status: IN PROGRESS

Completed in current branch:
- timeline zoom controls;
- touch pinch zoom;
- snapping to grid, playhead and clip edges;
- multi-track lanes;
- track mute/visibility/lock controls;
- speed and volume as canonical edit commands;
- text/caption editing through canonical clip text commands;
- audio/caption/overlay visual lanes.

Completed additionally:
- track reorder controls;
- real decoded audio waveform extraction for supported browser codecs;
- speed-aware clip duration semantics;
- selected clip playback speed/volume reflected in preview;
- create/edit text and captions as real timeline clips;
- live text/caption canvas overlays;
- keyboard shortcuts for undo/redo/delete/split/play-pause;
- add media into an existing edit.

Remaining:
- drag-based track reorder;
- volume envelopes/fades;
- canvas text drag/resize/rotate;
- transitions;
- real effects adapters;
- richer inspector;
- shortcut customization.

## Sprint 3 — preview/render

Remotion adapter, preview composition, render jobs, cancellation, progress, export settings, backend selection and artifact receipts.

## Sprint 4 — high-value MovieMode harvest

Streaming adapter, transcription, semantic media search, video generation, conversion and useful live-input concepts.

## Sprint 5 — hardening

Responsive phone/tablet/large desktop acceptance, offline/PWA, accessibility, large-project performance, autosave/recovery, provider failure behavior and full acceptance suite.
