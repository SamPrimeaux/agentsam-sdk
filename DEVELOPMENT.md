# Developing agentsam-sdk with Inner Animal Media

## Local verification

```bash
cd agentsam-sdk
npm ci
npm run verify
npm run preview:auth-portal   # optional; opens /auth/login at http://127.0.0.1:8791
```

`npm run verify` is the canonical pre-merge/pre-publish proof. It runs the SDK smoke tests, portable-context tests, identity tests, package invariants, and an npm pack dry-run.

## Run from any Git repo

After installing/linking the SDK:

```bash
agentsam context
agentsam context --json
```

This resolves the repository/revision directly from Git and reports whether `AGENTSAM_BRIDGE_KEY` machine auth is configured. It does not require per-user or per-workspace shell variables. See [`docs/PORTABLE_CONTEXT.md`](./docs/PORTABLE_CONTEXT.md).

## Link into a consumer repo

```bash
cd agentsam-sdk && npm link
cd /path/to/your-project && npm link @inneranimalmedia/agentsam-sdk
agentsam context --json
```

Then in any Worker or Node script:

```js
import {
  AgentSam,
  resolveGitContext,
  createBridgeClient,
} from '@inneranimalmedia/agentsam-sdk';
```

## Non-interactive init (CI / smoke)

```bash
npx agentsam init \
  --name my-agent \
  --lane fullstack \
  --run-target local \
  --yes
```

## Publish checklist

1. Root `package.json` name is **`@inneranimalmedia/agentsam-sdk`**.
2. `npm run verify` passes.
3. `package.json`, `package-lock.json`, and `packages/identity/package.json` versions match.
4. Root package does not depend on itself and has no install-time side effects.
5. `npm pack --dry-run --json` contains the expected consumer surfaces.
6. Bump/prep an alpha with `bash scripts/publish-identity-alpha.sh --dry-run` (or an explicit suffix).
7. Commit the version + lockfile bump.
8. Publish either locally with `bash scripts/publish-identity-alpha.sh --publish-only` or manually dispatch **Publish AgentSam SDK Alpha** from `main` (requires repository secret `NPM_TOKEN`).
9. Record the release in [`docs/RELEASES.md`](./docs/RELEASES.md).
10. Update consumers and replace any temporary local SDK-candidate shims.

### Publish 404 (`PUT … Not found`)

npm can return **404** when you are logged in as the wrong user for scope `@inneranimalmedia`.

- Registry maintainer for this package: `inneranimalmedia`
- Local publish preflight: `bash scripts/npm-publish-preflight.sh`
- Always pass `--access public` (also set in `publishConfig`).

Workspace packages under `packages/*` (for example `@inneranimalmedia/agentsam-shell-kit`) stay `private: true` until separately ready; they are not the root publish identity.

## Python tooling (`agentsam_sdk`)

Portable stdlib audits live under [`python/`](./python/) (import path `agentsam_sdk.*`).

```bash
cd python
python3 -m pip install -e ".[dev]"
python3 -m pytest
python3 -m agentsam_sdk.repository.inventory --json --root /path/to/repo
```

Consumer repos should keep only thin shims around portable SDK behavior instead of copying SDK implementations.

## Known gaps (roadmap)

- `agentsam status`, `agentsam logs` — not implemented yet
- Gorilla Shell Phase 1 — PTY WebSocket bridge to ExecOS
- Published server routes may evolve; portable Git context remains local/deterministic

See [docs/CLI_SHELL.md](./docs/CLI_SHELL.md) for terminal UX work.
