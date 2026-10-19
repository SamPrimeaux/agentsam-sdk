# AgentSamEvidence (`sam.evidence.*`)

Systematic capture of agent work: stills, recordings, traces and receipts stored under one numbered,
named layout, so a capture can feed QA, a changelog, a case study or an editor, and so names never drift.

```
sam.evidence.begin    declare flows, steps, states, viewports and checks before capturing
sam.evidence.capture  capture an asset against a declared state (optionally across the viewport matrix)
sam.evidence.seal     verify coverage and codecs, derive web copies, compute facts, write the manifest last
sam.evidence.deliver  serve a sealed run read-only on loopback (port 0 by default)
sam.evidence.compare  pair the same state across two sealed runs and crop what changed
sam.evidence.ingest   plan (default) or apply importing an existing folder into the canonical layout
```

## Use from a terminal (any agent)

```
agentsam sam evidence doctor
agentsam sam evidence begin   --input begin.json
agentsam sam evidence capture --input -  < capture.json
agentsam sam evidence seal    --input seal.json
agentsam sam evidence audit <dir> --allow <dir>
```

Input and output are JSON. The store is `<project>/.agentsam/evidence` (git-ignored). `doctor` reports exactly
which adapters are wired. The read-only stdio bridge deliberately cannot reach these operations.

## Names cannot drift

- One viewport vocabulary (`viewports.js`): `mobile-390x844`, `tablet-768x1024`, `desktop-1440x900`, and four more.
  Viewport is a folder, so file names are identical across sizes.
- Files are `Flow-Step-State[variant]-Name.ext`, zero-padded and CamelCase, checked on every write.
- A subject cannot contain a date or a version. Those live in the run id and the series.
- `seal` flags any file in a run that the pack did not write (`noncanonical_files:<n>`).
- `ingest` maps legacy folders ("iphone", "390", "1440-detail") onto the vocabulary; originals are never touched.

## Layout

```
<subject>--<YYYYMMDD>--<run7>/
  README.md  review.html  facts.json  evidence.manifest.json (written last)
  01-Brief/<Name>.<ext>                         02-Recon/<date>/<Name>.<ext>
  03-Flow/flow.map.json
  04-Build/<date>/<FF-Flow>/<viewport>/<FF-SS-NN[variant]-Name>.<ext>   (+ .evidence.json sidecars)
  05-Review/<date>/...  web copies      05-Review/Final/  approved set      05-Review/compare/<earlier-run>/
  06-Handoff/  covers/  markers.*.srt  screenplay.md/.json  project.copro.json  assets.json
```

Keys are slug paths under `<project-slug>/`; ids belong in manifest fields only.

## Adapters (all optional, all injected)

`sources` capture drivers (`playwright`, `blender-camera`) · `media` (ffprobe) · `derive` (sharp: WebP/AVIF ladder,
covers; ffmpeg: web MP4 and posters) · `images` (sharp, for compare) · `facts` (git) · `exporters` (copro).
Without `media`, a video run is `degraded` with `media_unverified`. Without `derive`, originals ship as they are.

## Status

Computed from the tree: `verified`, `degraded` (missing, unreported, unverified or drifted) or `failed`.
A capture failure returns `{ ok: false, error }` and never throws into the agent's task.

## Not included

The viewer-side "open evidence package" action lives in the editor app, not here. `deliver` serves the package
and the generated `review.html`. Hosted (container) Blender execution plugs into the same `exec` shape.
