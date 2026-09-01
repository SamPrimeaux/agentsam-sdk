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
| `--overwrite` | off | Replace existing Dockerfile/.dockerignore/docker-compose.yml |

## App types

- `static` — nginx serving a prebuilt `dist`/export
- `vite_react` — multi-stage: `npm run build`, then nginx serves the output
- `node_service` — generic Node service (Express/Fastify/etc.), `npm start`
- `wrangler_dev` — Cloudflare Worker via `wrangler dev --local`, fully offline; no live
  D1/R2/KV/Vectorize calls unless the Worker code itself makes them

All four fall back to `npm install` when no `package-lock.json` is present (quick
prototypes usually don't have one yet).

## Ephemeral by default

`docker run` always uses `--rm --memory=512m --cpus=1`. Stop the container and it's
gone — no idle billing, no orphaned containers to clean up later.

## As a library

Every generator is a plain function, importable directly — including from AgentSam's own
runtime, so it can dockerize things it builds without shelling out to its own CLI:

```js
import { dockerize, generateDockerFileSet, buildDockerDeployPlan } from '@inneranimalmedia/agentsam-sdk/dockerize';

// Just generate files, no execution:
const files = generateDockerFileSet('node_service', { appSlug: 'my-app', port: 3000 });

// Full write -> build -> run:
const result = await dockerize('/path/to/project', 'node_service', {
  appSlug: 'my-app',
  port: 3000,
  onData: (chunk) => process.stdout.write(chunk),
});
```

## Verified

Round-tripped end-to-end against a scratch Node service (no lockfile) through this SDK's
own `agentsam dockerize` CLI: write → build → run → `curl` returned a live response →
`docker stop` self-destroyed the container (`--rm` confirmed working) → image removed.
`node --test test/dockerize.test.mjs` covers the pure generator logic (no Docker daemon
required, CI-safe).
