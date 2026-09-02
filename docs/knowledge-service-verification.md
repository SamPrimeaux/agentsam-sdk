# Knowledge service verification — 2026-09-02

Implemented in `feat/knowledge-docker-service`, stacked on the portable knowledge SDK
branch. Runtime commit: `2452e8116b68f19eaf78eb66442973c58aec41a5`.

## Running deployment

Host: Sam's Mac via AgentSam Terminal Local. Setup used the SDK's actual `dockerize`
command from the isolated worktree, invoked as `node src/cli.js dockerize`:

```sh
node src/cli.js dockerize --type knowledge_service --name agentsam-knowledge \
  --repository sdk=/Users/samprimeaux/agentsam-sdk \
  --repository app=/Users/samprimeaux/inneranimalmedia \
  --port 8792 --no-register-tag
```

- Checkout: `/Users/samprimeaux/agent-worktrees/knowledge-service/agentsam-sdk`
- Container/image: `agentsam-knowledge` / `agentsam-knowledge:7c108871c3`
- API: `http://127.0.0.1:8792`; authenticated routes; `/healthz` reports liveness
- Data: named Docker volume `agentsam-knowledge-data`
- Configuration: `.agentsam/docker/knowledge/agentsam-knowledge/` in the checkout
- Token: `service.token` in that directory, mode 0600; value not recorded
- Generated Compose: `.agentsam/docker/7c108871c3/docker-compose.yml`
- Limits verified with Docker: 805,306,368 bytes RAM, 1,000,000,000 nanoCPUs (one CPU),
  `unless-stopped`, read-only root filesystem, read-only source/config mounts
- Server process uid verified as 501 (host user), with Docker init as root
- One observed idle sample: 29.65 MiB RAM, 0.04% CPU; this is not a load benchmark

`docker compose ... config --quiet` passed. The original source checkouts remained clean.
No production Worker binding or queue routing was changed. No embedding credentials were
injected and no embedding API calls were made.

## Persisted, real-repository pilots

| Repository/scope | Files | Chunks | Symbols | Syntactic edges | Repeat parsing |
|---|---:|---:|---:|---:|---|
| SDK `src/lib/merkle` | 6 | 35 | 73 | 204 | 0 files; unchanged generation |
| App `backend/workflows/contracts` | 3 | 9 | 22 | 31 | 0 files; unchanged generation |

Both use scope name `docker-pilot`, separated by repository ID. These are small selected
scopes, not a full-repository indexing run.

SDK generation: `da9d306f-5724-440f-82a7-cd3a3ca47c4a`, source commit
`485f8cafb3b28bd5bbf442011ed59118744d9ca1`. Searching `fileHasher` returned three hits,
including `src/lib/merkle/hash.js`.

App generation: `2fa72153-07c8-4cad-bf4f-1dedb900016a`, source commit
`df381ee53d9c598b8f9080b19a1278667ad8bb9c`. Searching `execution` returned five hits,
including `backend/workflows/contracts/execution-strategy.js`.

Verified persisted jobs:

- SDK: `6df06cf5-f718-4b7c-bc0a-7a46dc96808f`
- App: `bb748402-de6c-470a-85e6-c73fe7fc30f6`

The SDK index survived container removal/recreation with the same named volume. Both
completed jobs and their generation IDs were retrieved after a subsequent `docker restart`.
The local integration tests also simulate interruption of a running job and verify recovery
with an incremented attempt count and unchanged cached generation.

## Validation

- SDK suite: 57 tests passed; identity suite: 23 passed; smoke passed.
- Package and bootstrap verification passed.
- Installed-tarball proof: two unrelated repositories initialized, indexed, searched,
  recorded evolution, and generated this Docker preset using the installed SDK. Runtime
  lockfile/assets and the fetch-only service-client export were present.
- Service checks: unauthenticated request 401, unknown repository 404, escaping scope 400,
  paid embedding disabled 403, idempotent submission reuse, conflicting key 409,
  no-change cache reuse, narrow-scope retrieval enforcement, and restart persistence.
- A real integration check exposed search incorrectly counting the whole live repository
  against the indexing file limit. Fixed and covered by a regression test: search operates
  on its saved generation, even when the live repository is larger than the job limit.
- An initial app probe used a nonexistent directory and produced an empty pilot generation.
  The path was corrected to `backend/workflows/contracts`; the active generation is the
  three-file result above. Historical proof jobs remain in the local volume.

No claim of production Worker CPU savings is made: a reachable private endpoint and host
queue/Workflow routing still need to connect production jobs to this service. CocoIndex,
Postgres service storage, automatic watching, and scheduled indexing are not enabled.
