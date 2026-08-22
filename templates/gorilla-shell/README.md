# Gorilla Shell (Phase 0)

Game-feel terminal UI prototype — consolidated from [InnerAnimal/gorilla-mode](https://github.com/InnerAnimal/gorilla-mode) into **Agent Sam SDK**.

This is the **canonical** install-experience scaffold (pixel HUD, themed moods,
slash-command demos). Phase 1 connects real PTY via ExecOS.

`examples/gorilla-shell/` is a pointer only — use this `templates/` tree.

## Run locally

```bash
cd templates/gorilla-shell
npm install
npm run dev
```

## Placeholders

Demo scenario strings use template tokens (not live IAM infra):

- `{{PROJECT_NAME}}`, `{{LANE_KEY}}`, `{{AGENT}}` (also via `VITE_*` env)
- `{{WORKER_NAME}}`, `{{DASHBOARD_HOST}}`, `{{ZONE_HOST}}`
- `{{D1_DATABASE_NAME}}`, `{{D1_DATABASE_ID}}`
- `{{WORKSPACE_ID}}`, `{{CF_ACCOUNT_NAME}}`

## What you see

- Gorilla launch screen + sprite reactions
- Themes: NIGHT, DAY, LAVA, VOID
- Six demo scenarios (deploy, benchmark, D1, tail, samiam, wrangler)
- Live `/samiam` against local Worker API when `npm run dev` is up

Full architecture: [docs/CLI_SHELL.md](../../docs/CLI_SHELL.md)
