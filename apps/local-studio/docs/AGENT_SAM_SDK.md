# AgentSam SDK in this repo

Dependency: `@inneranimalmedia/agentsam-sdk` from `github:SamPrimeaux/agentsam-sdk#main` (v2.0.0 CLI).

## Commands that matter here

| Command | Use |
|---|---|
| `npx agentsam` | CLI entry |
| `npm run dockerize:write` | Generate `.agentsam/docker/<hash>/` for wrangler_dev — no Docker run |
| `npm run dockerize` | Generate + build + run local container |
| `npm run cf:deploy` | Source `.env.cloudflare` then deploy vault Worker |

`src/commands/dockerize.js` is the CLI for `agentsam dockerize`. App type `wrangler_dev` matches this product (Vite UI + vault Worker). Files land under `.agentsam/docker/<hash>/`, not the repo root.

## Env

- `.env.cloudflare.example` — committed template
- `.env.cloudflare` — local, gitignored via `.env.*`
- `scripts/with-cloudflare-env.sh` — loads the file then execs wrangler / agentsam
