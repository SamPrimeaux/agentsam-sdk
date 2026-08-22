# Developing agentsam-sdk with Inner Animal Media

## Local smoke test

```bash
cd agentsam-sdk
npm test
npm run preview:auth-portal   # opens /auth/login at http://127.0.0.1:8791
```

## Link into a scaffolded project

```bash
cd agentsam-sdk && npm link
cd /path/to/your-project && npm link @inneranimalmedia/agentsam-sdk
npm run dev
```

## Link into inneranimalmedia (monorepo-style)

From the platform repo:

```bash
cd inneranimalmedia
npm link ../agentsam-sdk
```

Then in any Worker or script:

```js
import { AgentSam } from '@inneranimalmedia/agentsam-sdk';
```

## Non-interactive init (CI / smoke)

```bash
npx agentsam init \
  --name my-agent \
  --lane fullstack \
  --provider cloudflare \
  --agent orchestrator \
  --yes
```

## Publish checklist

1. Root `package.json` name is **`@inneranimalmedia/agentsam-sdk`** (never a workspace kit)
2. `npm test` passes
3. Bump version in root `package.json`
4. Confirm `files` includes consumer surfaces (`src`, `bin`, `python`, `protocol`, …)
5. `bash scripts/npm-publish-preflight.sh` — must print `npm whoami: inneranimalmedia`
6. `npm publish --tag alpha --access public` (or `--tag latest` for stable)
7. Tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
8. Record pairing in [`docs/RELEASES.md`](./docs/RELEASES.md): `iam@<40-sha> ↔ @inneranimalmedia/agentsam-sdk@X.Y.Z`

### Publish 404 (`PUT … Not found`)

npm returns **404** (not 403) when you are logged in as the **wrong user** for scope `@inneranimalmedia`.

- Registry maintainer for this package: **`inneranimalmedia`** (see `npm view @inneranimalmedia/agentsam-sdk maintainers`)
- Fix: `npm whoami` must be `inneranimalmedia`
  ```bash
  npm logout
  npm login   # npm user inneranimalmedia (org owner), not personal GitHub-linked account
  bash scripts/npm-publish-preflight.sh
  npm publish --tag alpha --access public
  ```
- If you use a team org on npmjs.com, invite your daily npm user as **Developer** on the org with publish rights.
- Always pass `--access public` (already in `package.json` `publishConfig`; flag is harmless).

Workspace packages under `packages/*` (e.g. `@inneranimalmedia/agentsam-shell-kit`) stay
`private: true` until separately ready — they are **not** the root publish identity.

## Python tooling (`agentsam_sdk`)

Portable stdlib audits live under [`python/`](./python/) (import path `agentsam_sdk.*`).

```bash
cd python
python3 -m pip install -e ".[dev]"
python3 -m pytest
python3 -m agentsam_sdk.repository.inventory --json --root /path/to/repo
```

Inner Animal Media keeps a thin shim at `scripts/repo-size-inventory.py` that adds
`AGENTSAM_SDK_ROOT/python` (or a sibling/`~/agentsam-sdk` checkout) to `sys.path`.

## Known gaps (roadmap)

- `agentsam status`, `agentsam logs` — not implemented yet
- `agentsam identity init` — scaffolds `app/frontend` + `backend` + D1 migrations
- Gorilla Shell Phase 1 — PTY WebSocket bridge to ExecOS
- CMS lane in README — CLI has 5 lanes (Full Stack, CMS, Data, CRM, Creative)
- Published API route may differ; stub mode works without `AGENTSAM_SDK_TOKEN`

See [docs/CLI_SHELL.md](./docs/CLI_SHELL.md) for the game-feel terminal UX path.
