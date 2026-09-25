# AgentSam Go Runtime

## Purpose

Go is AgentSam's native deterministic machinery layer. It is reused by two different ownership surfaces:

- agentsam-go-worker — an independently deployed hosted/self-host service.
- agentsamd — the user-machine runtime that products can share.

Those are not the same product. They should reuse protocol-compatible native core code without sharing deployment authority.

The TypeScript/protocol layer remains canonical contract authority.

## Current hosted-service topology

    AgentSam / SAM
          |
          v
    canonical runtime protocol
          |
          v
    Cloudflare Worker
          |
          v
      Go Container

The Worker owns edge routing and deploy-time identity. The container owns native Go execution.

Normal AgentSam users consume the official hosted service where appropriate. They do not need to deploy this Worker just to use AgentSam.

## User-machine topology

    Local Studio ──┐
    CAD Creator ───┼──► agentsamd
    Ecommerce ─────┘       |
                           ├─ filesystem
                           ├─ watcher
                           ├─ Merkle
                           ├─ jobs
                           ├─ PTY/process
                           └─ activity

Products declare runtime capabilities. They do not each clone a complete daemon.

## Contract authority

TypeScript/protocol remains canonical. Go implements shared contracts.

Consequences:

- no Go-only public ErrorEnvelope,
- no Go-only activity vocabulary,
- no Go-only planning semantics,
- no browser contract moves into Go,
- shared behavior is judged by conformance fixtures.

Rust/Tauri remains responsible for desktop-shell concerns such as folder selection, keychain, application lifecycle, updater, deep links, and launching/supervising agentsamd.

## Current Go service capabilities

The deployed service currently owns:

- health/build identity,
- runtime inventory,
- capability inventory,
- deterministic SHA-256,
- deterministic static inspection,
- canonical AgentSam ErrorEnvelope-compatible request failures.

The Worker exposes edge health separately so operators can distinguish edge availability from native-container health.

## Source and build identity

Source identity must remain truthful across development and distribution.

Maintainer checkout:

    git:<commit-sha>

Published service artifact:

    npm:@inneranimalmedia/agentsam-go-worker@<version>

Fallback only when neither authority is available:

    tree:<deterministic-source-digest>

The build receipt also records the deterministic source-tree digest.

The local/native build proof requires:

- go test ./...,
- go vet ./...,
- native binary build,
- SHA-256 binary digest,
- native process boot,
- source identity match,
- health/runtime/capabilities/hash/inspect probes,
- canonical malformed-request ErrorEnvelope,
- graceful shutdown.

The Linux verification container receives the same intended source identity and must be linux/amd64 and nonroot.

The live deployment is not accepted merely because Wrangler returned success. External edge and native health must report the intended source identity.

## Distribution boundary

The Go service is packaged independently:

    @inneranimalmedia/agentsam-go-worker

The SDK does not assume its own npm tarball contains apps/agentsam-go-worker.

Installed-package discovery resolves the service package through Node package resolution. User state belongs under the caller's .agentsam directory; the package under node_modules remains source-only.

## Cloudflare account authority

Before any self-host or official live deployment AgentSam asks Wrangler for identity:

    wrangler whoami --json

The deploy path fails closed when authentication is missing, when no account is available, or when multiple accounts exist without an explicit selection.

The chosen account is observable and bound into the Wrangler process with CLOUDFLARE_ACCOUNT_ID.

No distributed package contains an InnerAnimalMedia production credential.

## Self-host lifecycle

Self-host is an advanced opt-in path:

    agentsam go --cloudflare agentsam-go-worker \
      --account <user-cloudflare-account-id> \
      --yes

The sequence is:

    installed or development service source
       |
       v
    source identity
       |
       v
    Go tests + vet
       |
       v
    native binary + digest
       |
       v
    native boot/probes/shutdown
       |
       v
    linux/amd64 nonroot container
       |
       v
    container boot/probes/shutdown
       |
       v
    explicit USER Cloudflare account
       |
       v
    Wrangler deploy
       |
       v
    Cloudflare deployment/version identity
       |
       v
    external edge + native probes
       |
       v
    deployment receipt
       |
       v
    local AgentSam registry

Self-host never mutates inneranimalmedia-business.

## InnerAnimalMedia official-release lifecycle

InnerAnimalMedia product registration is a separate authority:

    AGENTSAM_INNERANIMALMEDIA_OFFICIAL_RELEASE=1 \
      agentsam go --cloudflare agentsam-go-worker \
      --official-release \
      --account <iam-account-id> \
      --yes

Requirements:

- maintainer/development source,
- explicit InnerAnimalMedia release guard,
- explicit InnerAnimalMedia Cloudflare account,
- healthy live probes,
- deployment/version identity,
- only then remote agentsam_products and asset_relationships projection.

The InnerAnimalMedia D1 adapter lives in official-registry.js specifically so generic self-host deployment does not import InnerAnimalMedia registration as a default side effect.

## Dry run

Dry run is:

    agentsam go --cloudflare agentsam-go-worker \
      --dry-run \
      --account <cloudflare-account-id>

It still performs Go build/probes, Linux container build/probes, Wrangler identity/account resolution, and Wrangler deploy --dry-run.

It does not create a live deployment and does not mutate InnerAnimalMedia D1.

Skip-deploy is a different explicit local-only mode and cannot be used as deployment proof.

## Errors and recovery

Go preserves native evidence when present, but public failures classify through AgentSam's canonical ErrorEnvelope.

Recovery remains centralized in AgentSam. ErrorEnvelope feeds planRecovery / agentsam.recovery.v1 semantics used by other runtimes. Go does not own an independent retry brain.

Unsafe writes with unknown side effects must reconcile before retry. Provider/model fallback follows shared semantic-compatibility rules.

## Activity

Native operations feed agentsam.activity.v1; Go does not create a separate event vocabulary.

Near-term events include runtime.started, filesystem.read, filesystem.write, watcher.resync, merkle.updated, job.started, job.completed, and runtime.degraded. Studio Activity / Computational Hyperspace and the CLI in-flight TUI consume the same stream.

## Graduation toward agentsamd

The reusable native core should progressively own:

    runtime/
      workspace/
      filesystem/
      watch/
      hash/
      merkle/
      jobs/
      runtimeinfo/
      health/

Executables/adapters reuse that core:

    cmd/server
    cmd/agentsamd

The same core can support Cloudflare Container, local daemon, and remote daemon execution. Deployment/auth/ownership adapters remain target-specific.

## Conformance

Where TypeScript and Go implement the same protocol, use the same fixtures.

First conformance targets:

- runtime response shape,
- SHA-256 result,
- ErrorEnvelope classification for invalid input,
- path containment,
- version conflict semantics.

Then:

- file-watch events,
- Merkle roots/deltas,
- workspace filesystem behavior,
- cancellable job behavior.

A language-specific reinterpretation of a canonical contract is a failure.

## Next native capabilities

After the deployed service seed remains boring and repeatable, graduate capabilities in this order:

1. workspace filesystem behind workspace-fs.v1,
2. native filesystem watcher,
3. SHA/Merkle branch updates,
4. runtime capability/health state,
5. cancellable durable jobs,
6. PTY coordination where it belongs.

A* remains TypeScript-canonical until real workload measurements justify a native planner.

See AGENTSAM_DISTRIBUTION_OWNERSHIP.md for package, credential, registry, and telemetry ownership boundaries.
