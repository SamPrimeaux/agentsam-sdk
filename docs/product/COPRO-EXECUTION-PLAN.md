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

Remaining:
- IndexedDB/OPFS large-project storage;
- media drawer that adds/replaces assets inside an existing project;
- metadata probing;
- real thumbnails/proxies;
- durable imported asset handles across reload.

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

Remaining:
- track drag reorder UI;
- real decoded audio waveform extraction;
- speed-aware media playback/render semantics;
- volume envelopes/fades;
- canvas text transforms;
- transitions;
- real effects adapters;
- keyboard shortcuts;
- selection/inspector polish.

## Sprint 3 — preview/render

Remotion adapter, preview composition, render jobs, cancellation, progress, export settings, backend selection and artifact receipts.

## Sprint 4 — high-value MovieMode harvest

Streaming adapter, transcription, semantic media search, video generation, conversion and useful live-input concepts.

## Sprint 5 — hardening

Responsive phone/tablet/large desktop acceptance, offline/PWA, accessibility, large-project performance, autosave/recovery, provider failure behavior and full acceptance suite.
