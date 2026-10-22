# SamSketch

SamSketch is the reusable source-backed model and scene curation app. It owns the editor canvas, model inventory, scene objects, transforms, materials, semantic icon catalog, story timeline, GLB/JSON/PNG export, and on-demand OpenCascade boolean generation.

## Shell boundary

Local Studio owns the application shell, navigation, Chat/Work mode, and AgentSam conversation. This app intentionally does not ship the Showcase prototype's duplicate navigation, bespoke assistant drawer, mini-agent, or global shell. In embedded mode, the build action sends a typed scene-context request to the host conversation; the user reviews and submits it there.

## Model inventory

The packaged inventory contains 20 authored compositions and 47 source STL parts. Source STL bytes are stored as deterministic gzip-compressed assets and decompressed losslessly before parsing. The source-assets manifest records each source and delivery SHA-256, byte size, and provenance. Authored WebP previews are copied with their original relative paths.

Source identity and source geometry remain read-only. Added models are editable scene instances with stable SKU-shaped display identifiers; edits do not overwrite source assets.

## Commands

- npm run check: validate packaged assets and typecheck the editor.
- npm test: run asset and host-boundary tests.
- npm run build: build the standalone app. Local Studio's included-app build passes its base path and stages the result from dist.

The optional CAD boolean engine is loaded only when explicitly requested. Scene drafts currently persist in the app's browser storage; exports are real downloaded files.
