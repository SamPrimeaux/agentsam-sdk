# CoPro Studio
## Product Requirements Document

Status: Experimental
Portfolio: AgentSam

## Product vision

CoPro is a creator-facing visual production environment for turning media and creative intent into editable timelines, reusable templates, previews, rendered outputs, and finished exports. It should feel like polished mobile-first creative software, not a developer tool.

## Mobile experience

Mobile is first-class. A phone user must be able to import a clip, drag it, trim it, split it, undo, add another clip, preview, and export without opening a terminal.

Required composition:

top bar with title, undo, redo, export
preview canvas
transport and current time
horizontal timeline and playhead
selected clip with trim handles
contextual editing tools
persistent creator tool tray

## Editing requirements

V1 includes select, drag/move, left/right trim, split at playhead, duplicate, delete, multi-track timeline, seeking, zoom, undo/redo, text overlays, volume, speed, transitions, captions, and basic effects.

## Media requirements

Users work with a Media library, not provider consoles. Sources may be device/local, uploads, object storage, streaming providers, drives, or generated assets.

## Render/export requirements

Users choose understandable output settings. The runtime decides how to satisfy the RenderPlan. No normal export path may instruct a creator to boot a terminal or manually choose an execution lane.

## Definition of v1

Stable project serialization/migrations, deterministic command engine, real mobile timeline editing, responsive desktop editor, media library/local adapter, streaming adapter, Remotion adapter, render jobs/cancellation, structured templates, offline persistence, basic text/audio/captions/effects, and full create/import/edit/preview/save/reopen/render/export proof.
