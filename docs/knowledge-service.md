# Dedicated knowledge service

`agentsam dockerize --type knowledge_service` runs the portable SDK indexer as a persistent
local Docker service. It accepts small HTTP job requests, performs parsing/indexing/search
in a separate Node process, and persists jobs, parse caches, generations, and optional
embedding caches in a named Docker volume. It does not execute repository code.

This is the SDK engine from the portable knowledge package. CocoIndex is not installed or
required. A future CocoIndex engine adapter belongs behind the same job API; it should
preserve the SDK's scope, profile, generation, and context-pack contracts.

## Start from any repository

After installing a version of the SDK containing this preset:

```sh
agentsam dockerize --type knowledge_service --name agentsam-knowledge \
  --repository app=/absolute/path/to/app \
  --repository sdk=/absolute/path/to/another/repository \
  --port 8792 --no-register-tag
```

The build context contains only the SDK knowledge runtime and its locked TypeScript
dependency. Customer source trees, local indexes, and credentials are not copied into
the image. Repositories are mounted read-only. Linked Git worktrees additionally mount
their common Git metadata read-only so commit provenance remains available.

Defaults: `127.0.0.1:8792`, 768 MiB memory, one CPU, 128 processes, one running job,
32 pending/running jobs, 2,000 files per job, ten-minute job timeout, and embeddings
disabled. `--memory`, `--cpus`, `--port`, and `--volume` customize deployment. The generated
Compose file provides the same runtime settings. Images use Node 22.22.2 on Debian with
Git. Runtime source bytes are included in the recipe hash.

Container root initializes the data volume and drops to the invoking host user's uid/gid
before reading configuration or accepting requests (root invocations remain root).
The root filesystem is read-only; `/tmp` is capped; repositories/configuration are read-only;
the Docker socket is not mounted. Restart policy is `unless-stopped`. Log rotation is capped.

Configuration and a random token are generated under
`.agentsam/docker/knowledge/<container-name>/`; the token is mode 0600 and never printed.
Repository aliases and IDs persist across reruns. Existing `.agentsam/knowledge.json`
profiles seed new registrations; generated profiles otherwise start with SQLite and the
SDK's default Gemini profile. No repository is indexed at startup. Edit `repositories.json`
to restrict includes or tune chunking/model parameters, then restart. Reusing an alias for
a different host directory is refused.

```sh
agentsam dockerize --list
agentsam dockerize --stop agentsam-knowledge
docker start agentsam-knowledge
docker logs --tail 30 agentsam-knowledge
```

Stopping preserves the named volume. Updating code requires rebuilding and recreating the
container; it never silently replaces an existing container or deletes its data. Back up the
volume before removing it. This first release retains jobs and generations; automatic
retention and volume size limits are not implemented.

## Backend API and Worker client

`GET /healthz` is an unauthenticated liveness check. All `/v1/*` routes require a bearer
token. The token grants access to every registered repository: this is a trusted backend
API, not an end-user authorization boundary. The Worker must authorize the user and select
an allowed repository/scope before sending a request. Do not forward arbitrary client
repository identifiers or paths.

```js
import { createKnowledgeServiceClient } from '@inneranimalmedia/agentsam-sdk/knowledge-service-client';

const knowledge = createKnowledgeServiceClient({
  baseUrl: env.KNOWLEDGE_SERVICE_URL,
  token: env.KNOWLEDGE_SERVICE_TOKEN,
});

// Called after host authorization; the scope is selected by the host.
const job = await knowledge.submit({
  repository: 'sdk', operation: 'index',
  scope: 'merkle-pilot', include: ['src/lib/merkle'],
}, eventId); // Stable Idempotency-Key for retries of this same event/body.
// Persist job.id and poll on a later queue/workflow step, not a long HTTP request.
const status = await knowledge.job(job.id);
```

The client is fetch-only and has no Node imports. It times out HTTP calls after 15 seconds
and refuses redirects. Job acceptance returns HTTP 202; a repeated idempotency key returns
the original job; a different payload with that key returns 409. Retry transient transport
errors/429/5xx using the same key. Job status is `queued`, `running`, `completed`, or `failed`.
After interruption, persisted running jobs resume up to three total attempts, reusing
completed SDK cache work. Failed jobs require an explicit new submission.

`POST /v1/jobs` supports `operation: plan|index|search` and registered `repository` aliases.
Optional `scope`, `include`, and `exclude` narrow the configured scope; paths cannot escape
the registered include set. Search takes `query`, `top_k`, `token_budget`, optional
`generation_id`, and `semantic`. Results are the SDK receipt or context pack. A search with
a custom scope must use the same scope name as the index job.

Plan embedding costs without credentials using `operation: 'plan', embed: true`. Paid
index/search calls require explicit `AGENTSAM_ALLOW_EMBEDDINGS=true` and `GEMINI_API_KEY`
in the service runtime environment. The CLI preset does not inject either. Use a secured
Compose environment/secret integration when enabling them; never put keys in repository
config. Request embedding budgets default to 100 inputs/200,000 characters, capped by
the service at 1,000/2,000,000. This release uses the SQLite volume and the existing Gemini
adapter; Postgres and additional provider adapters are separate integration work.

## Connection to the existing AgentSam application

The application already delegates structural `/parse` work to `IAM_CODEBASE_INDEXER`, a
separate Worker. This service is a **whole indexing job** endpoint and is not compatible
with that existing `/parse` binding. Do not repoint the binding to it.

Production Workers cannot reach a Mac's localhost. Local development can submit jobs
directly. Production use needs a reachable private service endpoint and an explicit
queue/Workflow integration using the client above; authorize the host's users, submit jobs,
persist IDs, and poll asynchronously. This setup alone does not reduce production Worker
load. No production binding, queue consumer, Cloudflare Container limit, or deployment is
changed. A Mac service is available only while the Mac and Docker are running.

Moving CPU-heavy parsing, repository scans, and vector ranking to this service can reduce
Worker CPU pressure once jobs are routed here. It cannot eliminate Gemini 503/504 capacity
failures; those still need bounded retries, durable jobs, and provider-side observability.
