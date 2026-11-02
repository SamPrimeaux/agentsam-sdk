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


## MovieMode acceptance revision — November 1, 2026

Status: implemented locally; production acceptance is **not complete**.

The canonical Local Studio route remains `/admin/moviemode[/edit]`, hosted by
`MovieModeSurface` and the existing `MovieModeApp`. Editor navigation carries
the active `project` query parameter. The other repository's
`/dashboard/moviemode` surface is not changed by this revision.

This revision continues `feat/moviemode-resource-contract`, including the
existing uncommitted CoPro interface work. It does not create another editor.

Implemented:
- Blank sessions, explicit project identity, session reset, stale-import guards,
  scoped default media browsing and autosave identity checks.
- Actual-media project covers, source dimensions, sequence metadata, user-uploaded
  covers and frame selection. Explicit covers survive automatic preview refresh.
- In-workspace template browsing and one-command, undoable layer application.
  Composition text, accent and timing use the existing command engine.
- Live composition/animation sampling and shipped two-source GL transition
  previews, with hover, play/pause and preview-position controls.
- A shared transition/animation collection and selected-clip properties.
- Command+B splitting, source-speed-aware split/trim, engine-enforced track
  locks, synchronized sequence playback/audio, hide/mute and undo/redo.
- Ratio-aware monitor fitting, zoom and quality menus, fullscreen API plus
  full-viewport fallback, floating/docking and workspace layout controls.
- Complete Video / Basic / Remove BG / Mask / Retouch review surfaces and the
  existing scene, world, sculpt, lighting and presentation department controls.
- In-application project rename/delete dialogs; errors remain visible.

Focused tests cover command integrity, cross-project save/load isolation,
template composition/application, covers, storage, UI contracts and host wiring.

Release blockers and limits:
- The editor's project/source adapters are still browser-local. The platform
  MovieMode API in `inneranimalmedia/src/api/moviemode-api.js` has project
  GET/POST but lacks complete project update/delete. Account/workspace-level
  project and original-media CRUD is not delivered by local deletion.
- The quality selector records a monitor preference; it does not yet select
  decoded proxy media. No proxy-generation performance claim is made.
- GL previews run the actual shaders in the asset browser. Encoded output and
  timeline two-source compositing parity still need integration. Direction and
  easing metadata are stored but not yet consumed by the GL timeline renderer.
- Advanced segmentation, mask processing, retouch, tracking, generative styling
  and 3D tools remain labeled preview controls. They do not submit processing
  jobs or pretend a render completed.
- Real-media import/reload, portrait fitting, project A/B switching, fullscreen,
  resize/undock and transition playback still require complete browser acceptance
  against the final commit and the authenticated deployed host.
- The browser check reached template preview, current-project application, title
  editing and sequence playback. A native rename prompt from the earlier build
  then stalled browser control; native project prompts have since been replaced.
- Local Git fetch fails DNS resolution for github.com; the selected GitHub MCP
  connection also returns RATE_LIMITED. No merge or deployment is claimed.

Only clean, confirmed-merged branches/worktrees may be removed. This branch must
remain recoverable until those release blockers are resolved and deployed.

The full Local Studio build was attempted. It stopped while staging the ecommerce
host, before the MovieMode host bundle, because the concurrent financial analytics
work cannot resolve `@inneranimalmedia/financial-analytics` and its `/ui` entry.
That work is intentionally excluded from the MovieMode commit. The standalone
MovieMode production build, typecheck and focused host contracts pass; a successful
full host build is still a release gate.

The earlier commit attempt failed because ExecOS inherited a broken macOS
launch context. PM2 was relaunched from a healthy login session and ExecOS's
SSH-agent reference was refreshed. User lookup, DNS, SSH signing and Git remote
access subsequently passed through AgentSam Terminal Local. Signing remains enabled.
Merge, full host acceptance and deployment remain separate release gates.
Unrelated analytics changes remain outside this change.
