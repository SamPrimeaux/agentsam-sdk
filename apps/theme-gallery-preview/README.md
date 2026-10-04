# AgentSam Theme Gallery (localhost)

Public gallery of **real** historical websites — not synthetic theme mocks.

## Run

```bash
cd apps/theme-gallery-preview
Canonical package sites live under packages/theme-<id>/site/.
The gallery is a preview/catalog surface; customer installs do not depend on a staging or sync step.
python3 app.py
```

Open http://127.0.0.1:8765/themes

Production (after `npm run site:sync && npm run site:publish` + Worker deploy):

https://agentsam.inneranimalmedia.com/themes

## Routes

| Path | What |
|------|------|
| `/themes` | Gallery — current theme + discover grid |
| `/themes/<slug>` | Detail — desktop/mobile frame + sticky action bar |
| `/themes/<slug>/demo/` | **Real** site mount (`themes/<slug>/site/`) |
| `/themes/<slug>/help` | Theme-specific owner's manual |
| `/help` | Theme Store docs |

## Contract

- Public catalog entries are browsable live mounts (`preview.kind = "live"`).
- `installable` stays false until an APP is normalized — **Use this design** opens a plan/receipt workflow, not a fake provisioner.
- Internal `_internal.normalization` stays private (not shown as Coming soon badges).

## Layout

```
theme-gallery-preview/
├── app.py
├── data/catalog.json          ← generated from theme.json files
├── gallery/static/            ← Theme Store shell
├── themes/                 # development preview mirrors of packaged sites
└── themes/
    └── <slug>/
        ├── theme.json
        ├── site/              ← real historical build
        └── help/
```
