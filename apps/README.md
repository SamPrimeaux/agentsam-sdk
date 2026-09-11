# AgentSam apps

`apps/` is the development/authoring source of truth for runnable AgentSam product surfaces and reusable reference applications.

Current lanes:

- `local-studio/` — full AgentSam local product shell, imported from `SamPrimeaux/AgentSam-Grok-Workmode` before normalization. This is the UI/UX donor for `agentsam start-local`; it is not published verbatim in the root npm package.
- `cad-creator/` — self-contained CAD/BIM npm workspace (`frontend/`, `backend/`, `shared/cad/`) imported from `agentsam-design-studio.zip`; it remains independent from the SDK root workspace graph.
- `frontend/` — public-site/CMS authoring lane. `public/site/` contains the current landing-page seed and will be normalized around shared header/footer plus D1-driven page records and R2-published HTML/assets.
- `_incoming/` — optional drop zone for additional ZIP donors. Run `python3 scripts/ingest-app-zips.py` to preview an import, then add `--apply` to ingest it.

Build/publish direction:

```text
apps/*                  development SSOT
  -> dist/gallery/*     runtime previews
  -> templates/generated/* scaffold payloads
  -> dist/local-studio/* local product runtime
```

The root npm package should publish built/exported payloads, not entire app authoring trees.
