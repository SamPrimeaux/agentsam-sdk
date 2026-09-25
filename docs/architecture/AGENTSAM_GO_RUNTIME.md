# AgentSam Go Runtime

## Purpose

AgentSam's Go runtime is the native machine-execution layer for Systematic Autonomous Machinery. It is not a second AgentSam product model and it is not a replacement for the TypeScript/protocol authority.

The current production topology is:

    AgentSam / SAM
          |
          v
    canonical runtime protocol
          |
      +---+------------------+
      |                      |
      v                      v
    local native Go      Cloudflare Worker
    process                  |
                             v
                        Go Container

The Worker owns edge routing. The container owns native Go execution.

## Contract authority

TypeScript/protocol remains canonical contract authority. Go implements those contracts.

Consequences:

- no Go-only public ErrorEnvelope
- no Go-only activity vocabulary
- no Go-only planning semantics
- no browser contract moves into Go
- cross-language behavior is judged by shared fixtures, not approximate similarity

Rust/Tauri remains responsible for desktop bootstrap/native-shell concerns: folder selection, keychain, application lifecycle, deep links, updating, notifications, and launching/supervising the local daemon.

## Current capabilities

The deployed native runtime currently owns:

- health/build identity
- runtime inventory
- capability inventory
- deterministic SHA-256
- deterministic static inspection
- canonical AgentSam ErrorEnvelope-compatible request failures

The production Worker exposes edge health separately so an operator can distinguish Worker-edge availability from native-container health.

## Source and build identity

The canonical AgentSam build embeds the source commit and build timestamp into the Go binary with linker flags.

The build proof requires:

- go test ./...
- go vet ./...
- native binary build
- SHA-256 binary digest
- native process boot
- health/runtime/capabilities/hash/inspect probes
- canonical malformed-request ErrorEnvelope
- graceful process shutdown

The Docker build consumes the same generated source identity. The verification image must be linux/amd64 and nonroot.

The live deployment is not accepted merely because Wrangler returned success. External health must report the intended source commit.

## Cloudflare production lifecycle

The canonical command is:

    agentsam go --cloudflare agentsam-go-worker

The sequence is:

    clean source
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
    agentsam_products + asset_relationships

Dry run uses Wrangler deploy --dry-run and does not update the live product registry. Skip-deploy is explicit and cannot be considered production evidence.

## Errors and recovery

Go preserves native evidence when a native failure exists, but public failures classify through AgentSam's canonical ErrorEnvelope. The Go runtime must not add competing public schemas such as GoErrorV1.

Recovery remains centralized in AgentSam. ErrorEnvelope feeds the same planRecovery / agentsam.recovery.v1 semantics consumed by other runtimes. Go does not own an independent retry brain.

Unsafe writes with unknown side effects must reconcile before retry. Provider/model fallback must follow the same semantic-compatibility rules as the rest of AgentSam.

## Activity

Native operations feed agentsam.activity.v1; Go does not create a separate event vocabulary.

Near-term events include runtime.started, filesystem.read, filesystem.write, watcher.resync, merkle.updated, job.started, job.completed, and runtime.degraded. Studio Activity / Computational Hyperspace and the CLI in-flight TUI consume the same stream.

## Graduation toward agentsamd

The current server is deliberately reusable rather than Cloudflare-only. The runtime core should progressively own:

    runtime/
      workspace/
      filesystem/
      watch/
      hash/
      merkle/
      jobs/
      runtimeinfo/
      health/

Executables/adapters then reuse that core:

    cmd/server
    cmd/agentsamd

The same core is intended for Cloudflare Container, local daemon, and remote daemon execution. Do not fork implementations per target.

## Conformance

Where TypeScript and Go implement the same protocol, the same fixtures must validate both.

First conformance targets:

- runtime response shape
- SHA-256 result
- ErrorEnvelope classification for invalid input
- path containment
- version conflict semantics

Then, as native features land:

- file-watch events
- Merkle roots/deltas
- workspace filesystem behavior
- cancellable job behavior

A language-specific reinterpretation of a canonical contract is a failure.

## Next native capabilities

After the deployed seed remains boring and repeatable, graduate capabilities in this order:

1. workspace filesystem behind workspace-fs.v1
2. native filesystem watcher
3. SHA/Merkle branch updates
4. runtime capability/health state
5. cancellable durable jobs
6. PTY coordination where it belongs

A* remains TypeScript-canonical until real workload measurements justify a native planner.
