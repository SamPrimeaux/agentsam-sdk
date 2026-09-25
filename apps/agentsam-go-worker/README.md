# @inneranimalmedia/agentsam-go-worker

AgentSam's hosted/native Go service runtime packaged as a Cloudflare Worker edge adapter plus a Linux Container.

This is a SERVICE artifact, not the normal AgentSam user installation and not the customer machine daemon. Normal users install AgentSam and consume the official hosted service where appropriate; the local machine runtime is agentsamd. This package exists for the IAM release pipeline, contributors, and advanced self-hosters.

The TypeScript/protocol layer remains contract authority. Go implements those contracts; it does not define a parallel AgentSam API.

## Ownership modes

### Normal AgentSam user

Normal onboarding:

    npm install -g @inneranimalmedia/agentsam-sdk
    agentsam

A normal user should not need to run a Cloudflare deployment command, possess IAM Cloudflare credentials, write IAM D1, or have an agentsam-sdk source checkout.

### Advanced self-host

The deployable service is independently packaged as:

    @inneranimalmedia/agentsam-go-worker

AgentSam resolves that installed artifact and deploys it only to the explicitly authenticated user's Cloudflare account.

Self-host registry authority is local AgentSam state. It never attempts to mutate inneranimalmedia-business.

Dry-run:

    agentsam go --cloudflare agentsam-go-worker \
      --dry-run \
      --account <cloudflare-account-id>

Live self-host:

    agentsam go --cloudflare agentsam-go-worker \
      --account <cloudflare-account-id> \
      --yes

Without --yes, a live non-interactive deploy fails closed. In an interactive terminal AgentSam displays the resolved account and asks for confirmation.

### IAM official release

The IAM production registry path is a separate maintainer-only authority:

    AGENTSAM_IAM_OFFICIAL_RELEASE=1 \
      agentsam go --cloudflare agentsam-go-worker \
      --official-release \
      --account <iam-cloudflare-account-id> \
      --yes

Only this guarded path may project a healthy official deployment into inneranimalmedia-business / agentsam_products / asset_relationships.

## Distribution isolation

The root SDK npm tarball does not need to carry this service's entire source tree. Distribution resolution is:

1. explicit AGENTSAM_GO_WORKER_ROOT for controlled development,
2. current repository apps/agentsam-go-worker for maintainer/contributor mode,
3. installed @inneranimalmedia/agentsam-go-worker for distribution/self-host mode,
4. SDK development tree when present,
5. narrow legacy candidates.

In installed-package mode, build/deployment receipts and binaries are written under the caller's .agentsam state. The package under node_modules remains source-only.

Source identity is mode-aware:

- maintainer checkout: git:<sha>
- published artifact: npm:@inneranimalmedia/agentsam-go-worker@<version>
- fallback only when neither is available: deterministic source-tree digest

The live health endpoint must report the same source identity AgentSam intended to deploy.

## Cloudflare account authority

AgentSam asks Wrangler directly:

    wrangler whoami --json

The deploy path:

1. requires authentication,
2. reads the accounts Wrangler can actually access,
3. fails closed if no account is available,
4. fails closed if multiple accounts are available and none is selected,
5. binds the selected account with CLOUDFLARE_ACCOUNT_ID,
6. records the selected account ID/name and auth type in the deployment receipt.

No IAM production token or account credential is embedded in this npm package.

## Current API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | / | Edge adapter identity/source |
| GET | /edge/health | Edge adapter health/source |
| GET | /health | Native service health + build source identity |
| GET | /v1/runtime | Go runtime inventory |
| GET | /v1/capabilities | Capability inventory |
| POST | /v1/hash | Deterministic SHA-256 |
| POST | /v1/inspect | Deterministic file inspection |

Malformed/native request failures use the canonical AgentSam ErrorEnvelope shape.

## Local native development

From the SDK checkout:

    cd apps/agentsam-go-worker/runtime
    go test ./...
    go vet ./...
    go run ./cmd/server

The native default is PORT=8080 and target local. SIGINT and SIGTERM perform bounded graceful HTTP shutdown.

AgentSam's canonical build additionally:

- hashes the source tree,
- builds and SHA-256 hashes a native binary,
- embeds source identity/build time in the native binary,
- boots the exact binary,
- probes health/runtime/capabilities/hash/inspect/ErrorEnvelope behavior,
- requires clean shutdown,
- writes a build receipt.

## Cloudflare development

    cd apps/agentsam-go-worker
    npm ci
    npm run dev

The Worker owns edge routing. GO_RUNTIME is the Cloudflare Container binding. Deployment vars carry source identity/build time from AgentSam into the Worker, and the Worker forwards those values into the native container environment.

## Deployment proof

A deploy is not accepted merely because Wrangler returned success.

The proof chain is:

    source identity
        ↓
    go test + go vet
        ↓
    native binary + digest
        ↓
    native boot/probe/shutdown
        ↓
    linux/amd64 nonroot container
        ↓
    container boot/probe/shutdown
        ↓
    explicit Cloudflare account
        ↓
    Wrangler deploy
        ↓
    Cloudflare deployment + Worker version IDs
        ↓
    external edge/native probes
        ↓
    deployment receipt
        ↓
    local registry
        ↓
    IAM registry only when official-release guard is active

The container verification requires linux/amd64, nonroot:nonroot, canonical ErrorEnvelope behavior, deterministic hash/inspect behavior, exact source identity, and clean shutdown/cleanup.

## Dry-run semantics

--dry-run is not --skip-deploy.

Dry-run still performs:

- Go test/vet/build/native probe,
- local Linux container build/probe,
- Wrangler identity/account resolution,
- Wrangler's real deploy --dry-run.

It performs no live Cloudflare deployment and no IAM D1 mutation. Its receipt records dry_run=true, dry_run_validated=true, and skipped_deploy=false.

--skip-deploy is explicitly local-only and records skipped_deploy=true; it is not deployment evidence.

## Receipts and state

Maintainer checkout state lives under:

    apps/agentsam-go-worker/.agentsam/

Installed/self-host state lives under the caller project:

    <caller>/.agentsam/

A production receipt records at minimum:

- source identity and optional Git commit,
- source package/version,
- native binary digest,
- verification image digest,
- explicit Cloudflare account identity,
- Cloudflare deployment ID,
- Worker version ID,
- deployed URL,
- external probe results and timestamp,
- self-host vs IAM official registry mode.

## Verify and rollback

    agentsam go verify
    agentsam go status --json

Inspect Cloudflare history:

    npx wrangler deployments list --name agentsam-go-worker --json
    npx wrangler versions list --name agentsam-go-worker --json

Rollback:

    npx wrangler rollback VERSION_ID \
      --name agentsam-go-worker \
      -c wrangler.jsonc

After rollback, repeat external probes and reconcile the deployment receipt.

## Runtime graduation

This service is the deployed Go seed. The reusable native core should graduate in this order:

1. workspace filesystem behind the shared workspace contract,
2. native file watcher,
3. SHA/Merkle branch updates,
4. runtime health/capabilities,
5. cancellable durable jobs,
6. PTY coordination where the architecture fits.

agentsamd should reuse that core for customer/user machines. It should not become a copy of the Cloudflare deployment wrapper, and products should request capabilities from one shared machine runtime rather than each shipping another daemon.

See docs/architecture/AGENTSAM_GO_RUNTIME.md and docs/architecture/AGENTSAM_DISTRIBUTION_OWNERSHIP.md.
