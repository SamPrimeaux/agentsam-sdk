# AgentSam CoPro Studio

Composition app for the CoPro package family.

This is a GUI product, not a terminal experience. The initial visual proof supports direct mobile and desktop manipulation of clips through the shared command engine. Infrastructure/provider selection remains beneath the creator surface.


## Media Production workspace (local-first increment)

The existing editor now has **independent source browsing and selected-object
inspector panels**, drag/keyboard-resizable dividers, a vertical timeline resize
handle, per-track height controls, pane collapse, swap, floating/re-dock and
layout reset. Layout responds to the width of its **own editor container** and
persists independently of the CoPro creative project. CoPro's original command
engine, schema and undo/redo remain authoritative.

The local application uses `BrowserLocalStorageProjectStore` for serialized
project edits and `BrowserIndexedDbMediaStore` for the original media blobs.
Projects and media survive a browser reload **within the same origin and
browser profile**; browser storage must not be represented as cloud backup.
Imported WebM duration is probed from actual metadata/seekable end, not
guessed. The editor reports storage/import failures rather than claiming a
successful import.

### Run locally

```bash
npm --prefix packages/copro-ui run build
npm --prefix apps/agentsam-copro-studio run dev
```

### Verified / not yet delivered

The local browser acceptance flow covers project creation, video import,
timeline trim, original-media persistence, reopen/reload and responsive
panel/track resizing. Browser `IndexedDB` bytes are **not embedded** in
`.copro.json` exports. Multi-file portable project packaging, native/OPFS
storage, provider-connected remote media, complete audio/video compositing,
real encoded MP4 render export, all creative tools and packaged Local Studio
hosting remain implementation work; do not badge them as shipped.
