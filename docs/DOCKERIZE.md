# agentsam dockerize

Generate + build + run a fresh, ephemeral local Docker container for any prototype — no
account, no metered hosting, works fully offline once images are cached.

## Why this exists

Cloud sandbox execution (e.g. a metered container-hosting lane) is the right tool for
genuinely untrusted code. It is the wrong default for "I just want to try something
locally." This command routes that case through Docker on infra you already own — your
Mac or your own VM — instead.

## Usage

```
agentsam dockerize --type <static|vite_react|node_service|wrangler_dev> [options]
agentsam dockerize --list
agentsam dockerize --stop <name>
```

| Option | Default | Notes |
|---|---|---|
| `--type` | `node_service` | App shape — see below |
| `--name` | current directory name | Image/container name |
| `--port` | depends on `--type` | Host port |
| `--cwd` | `.` | Target directory |
| `--write-only` | off | Generate files, skip build/run |
| `--build-only` | off | Generate + build, skip run |
| `--no-cache` | off | `docker build --no-cache` |
| `--overwrite` | off | Replace the shared `.dockerignore` at project root |
| `--timeout <secs>` | none | Auto-stop the container after N seconds — CLI process stays alive until then |
| `--list` | — | Show every agentsam-managed container (running or stopped), across all projects |
| `--stop <name>` | — | Stop a running container by name |

## App types

- `static` — nginx serving a prebuilt `dist`/export
- `vite_react` — multi-stage: `npm run build`, then nginx serves the output
- `node_service` — generic Node service (Express/Fastify/etc.), `npm start`
- `wrangler_dev` — Cloudflare Worker via `wrangler dev --local`, fully offline; no live
  D1/R2/KV/Vectorize calls unless the Worker code itself makes them

All four fall back to `npm install` when no `package-lock.json` is present (quick
prototypes usually don't have one yet).

## Content-hash versioning

Every build is content-addressed: the generated `Dockerfile` + `docker-compose.yml` are
hashed (sha256, first 10 hex chars), and that hash is the image's identity —
`<slug>:<hash>`, plus a mutable `<slug>:latest` pointer for convenience. Files land under
`.agentsam/docker/<hash>/` in the target project instead of overwriting a single
`Dockerfile` at the root on every run — identical config always produces the identical
hash, and different versions coexist side by side.

`.dockerignore` stays a single shared file at the project root (rarely varies build to
build) — pass `--overwrite` to replace it.

A lightweight JSON manifest at `.agentsam/docker/index.json` maps every hash to its
metadata (type, port, image tags, file paths, created time) — the whole "what's been
built here" state in one flat, human-readable file. No database, nothing to keep in sync.

## No aimless containers

Every container gets Docker labels (`agentsam.managed=true`, `agentsam.hash`,
`agentsam.type`, `agentsam.slug`) — `docker ps` itself is the source of truth for what's
running, filterable directly:

```
docker ps -a --filter label=agentsam.managed=true
```

`agentsam dockerize --list` wraps that filter. `docker run` still defaults to `--rm` +
`--memory=512m --cpus=1` (ephemeral, capped), but **nothing auto-stops unless you pass
`--timeout`** — the container runs until you stop it. Every successful run prints the
exact stop command regardless, so it's never ambiguous who's responsible for cleanup.

## Cross-repo hashtag ledger

Every successful build registers itself as a `#hashtag` in this SDK's own cross-repo
ledger (`bin/tag` / `tags/registry.json`) — the same system used for tracking commit
SHAs, branch names, and patch files across all your repos. Find it later with:

```
bin/tag find "#docker-my-app"
```

This is best-effort: on a machine without `bin/tag`/`jq` available, registration is
silently skipped and dockerize still completes normally.

## As a library

Every generator is a plain function, importable directly — including from AgentSam's own
runtime, so it can dockerize things it builds without shelling out to its own CLI:

```js
import { dockerize, generateDockerFileSet, buildDockerDeployPlan } from '@inneranimalmedia/agentsam-sdk/dockerize';

// Just generate files, no execution:
const files = generateDockerFileSet('node_service', { appSlug: 'my-app', port: 3000 });

// Full write -> build -> run, auto-stop after 5 minutes:
const result = await dockerize('/path/to/project', 'node_service', {
  appSlug: 'my-app',
  port: 3000,
  timeoutSeconds: 300,
  onData: (chunk) => process.stdout.write(chunk),
  onAutoStop: () => console.log('timed out, stopped'),
});
```

## Verified

Round-tripped end-to-end multiple times through this SDK's own `agentsam dockerize` CLI:
- write → build → run → `curl` returned a live response → `docker stop` self-destroyed
  the container (`--rm` confirmed working) → image removed
- `--timeout 8` run: container auto-stopped after 8s, confirmed gone via `docker ps -a`
- `--list` correctly reflected running vs. stopped state at each step
- `--stop <name>` manually stopped a running container, confirmed via `--list`
- Tag ledger registration confirmed findable via `bin/tag find`
- Manifest JSON confirmed correctly structured and readable via `readManifest()`

`node --test test/dockerize.test.mjs` covers the pure generator/hash/manifest logic (no
Docker daemon required, CI-safe).
