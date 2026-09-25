# agentsam-go-worker

AgentSam's native Go runtime. The product has one canonical contract and three execution modes: a local native process, Cloudflare development through the Worker adapter, and production as a Cloudflare Worker routing native requests to a Linux Container.

The TypeScript/protocol layer remains contract authority. Go implements those contracts; it does not define a parallel AgentSam API.

## Current API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | / | Edge adapter identity (Cloudflare mode) |
| GET | /edge/health | Edge adapter health (Cloudflare mode) |
| GET | /health | Native service health and embedded build identity |
| GET | /v1/runtime | Go version, OS/architecture, CPUs, capabilities |
| GET | /v1/capabilities | Capability inventory |
| POST | /v1/hash | Deterministic SHA-256 |
| POST | /v1/inspect | Deterministic file inspection |

Malformed/native request failures use the canonical AgentSam ErrorEnvelope shape. They do not introduce a Go-only error language.

## A. Local native Go runtime

From the repository root:

    cd apps/agentsam-go-worker/runtime
    go test ./...
    go vet ./...
    go run ./cmd/server

The native default is PORT=8080 and target=local. PORT and AGENTSAM_TARGET may be overridden explicitly.

Probe it:

    curl http://127.0.0.1:8080/health
    curl http://127.0.0.1:8080/v1/runtime
    curl http://127.0.0.1:8080/v1/capabilities
    curl -H 'content-type: application/json' \
      -d '{"input":"agentsam","algorithm":"sha256"}' \
      http://127.0.0.1:8080/v1/hash

SIGINT and SIGTERM perform bounded graceful HTTP shutdown.

The canonical AgentSam build additionally embeds the source commit/build time, hashes the binary, boots that exact binary, probes the API, validates an ErrorEnvelope failure, and requires clean shutdown before producing a build receipt.

## B. Cloudflare development

Install the worker-local dependencies once:

    cd apps/agentsam-go-worker
    npm ci
    npm run dev

The Worker is an edge adapter. GO_RUNTIME is the Cloudflare Container binding and AgentSamGoRuntime is the container class. Native API paths are forwarded to the Go process on port 8080.

Cloudflare local development may differ from production container scheduling/cold-start behavior, so production acceptance always includes external probes after deployment.

## C. Production deploy

The canonical production path is:

    agentsam go --cloudflare agentsam-go-worker

A normal run does all of the following and fails closed if required evidence is missing:

1. discovers the existing product/runtime
2. runs go test ./...
3. runs go vet ./...
4. builds and hashes the native binary
5. boots/probes/shuts down that binary
6. builds a linux/amd64 nonroot container
7. boots/probes/shuts down that container
8. runs wrangler deploy
9. resolves the authoritative Cloudflare deployment ID and Worker version ID
10. externally probes the Worker edge and native container routes
11. requires the deployed native health response to report the source commit being shipped
12. writes build/deployment receipts
13. upserts agentsam_products and asset_relationships only after healthy live proof

A normal deploy never silently turns into skip-deploy.

### Dry run

    agentsam go --cloudflare agentsam-go-worker --dry-run

Dry run still tests/builds/probes the native binary and local container, then runs Wrangler's real deploy --dry-run validation. It does not perform a live Cloudflare deployment and does not mutate the remote product registry.

### Explicit local-only build/receipt

    agentsam go --cloudflare agentsam-go-worker --skip-deploy

This is intentionally local-only. It tests/builds/probes the native binary and records skipped_deploy=true. It is not deployment proof.

### Verify/status

    agentsam go verify
    agentsam go status --json

For the live service, use the deployment URL in latest.deployment-receipt.json and probe /edge/health, /health, /v1/runtime, /v1/capabilities, /v1/hash, and /v1/inspect.

## Receipts

Local generated receipts live under apps/agentsam-go-worker/.agentsam/go and are intentionally not tracked by Git.

A production deployment receipt records:

- deployed URL
- healthy/degraded state
- source commit
- native binary digest
- local verification image digest
- Cloudflare deployment ID
- Worker version ID
- probe time/results
- dry-run/skip flags

The build and production deployment receipts must describe the same source generation when declaring a release shipped.

## Rollback and redeploy

Inspect Cloudflare history:

    cd apps/agentsam-go-worker
    npx wrangler deployments list --name agentsam-go-worker --json
    npx wrangler versions list --name agentsam-go-worker --json

Rollback to a known Worker version:

    npx wrangler rollback VERSION_ID --name agentsam-go-worker -c wrangler.jsonc

After a rollback, re-run live probes and record why the rollback was performed. To redeploy a known good source generation, check out that source revision and run the canonical AgentSam production command again so receipts and the product registry are reconciled to what is actually live.

## Architecture and graduation

See docs/architecture/AGENTSAM_GO_RUNTIME.md.

Near-term native responsibilities graduate in this order: workspace filesystem implementation, native file watching, SHA/Merkle branch updates, runtime health/capabilities, cancellable jobs, then PTY coordination where the architecture fits. Browser contracts stay TypeScript-owned, and TypeScript/Go implementations must share conformance fixtures.
