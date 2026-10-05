# AgentSam Runtime Protocol

> Standing law: **`agentsam.runtime.v1` is the portable machine-capability contract. `agentsamd` is the canonical local machine-runtime role. ExecOS is the remote enrollment/resolution/routing plane. PTY is a capability, not a product or control plane.**

## Architectural ownership

These terms are deliberately different:

| Term | Authority / role |
|---|---|
| **PTY / ConPTY** | Operating-system primitive used to host an interactive shell. A capability, not a daemon. |
| **agentsamd** | Canonical native machine-runtime daemon. Owns local machine capabilities such as PTY, exec/process, filesystem, ports, jobs, Git/local tools, and runtime health. |
| **ExecOS** | Remote execution connection plane. Owns enrollment, runtime discovery, connection resolution, remote routing, reconnect/session transport, and structural runtime/session state needed for those responsibilities. |
| **xterm / terminal UI** | Presentation/client. It does not own the machine runtime. |
| **Tauri host** | Desktop/native host and lifecycle bridge. It may launch/supervise `agentsamd`; it is not the PTY/runtime authority. |
| **AgentSam CLI / packaged apps** | Runtime consumers. They target capabilities, not a specific PTY library. |
| **agentsam-go-worker** | Optional hosted Go service. It is not `agentsamd` and is not the ExecOS control plane. |

Language is an implementation choice, not the architecture:

```text
agentsamd = architectural role
Go       = current implementation direction
Rust     = candidate implementation/module language where evidence justifies it
```

Do not encode “agentsamd = Go forever” or “agentsamd = Rust” as protocol law.

## Local and remote topology

### Local / installed

```text
Local Studio / AgentSam CLI / packaged AgentSam app
                         │
                         ▼
                     agentsamd
                         │
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
      PTY              process          filesystem
       │                 │                 │
   zsh/bash/          jobs/exec       files/watch
   PowerShell
```

A normal local install must not require InnerAnimalMedia, ExecOS, Cloudflare, Docker, D1, or a hosted Worker merely to use supported local capabilities.

### Hosted / remote

```text
Browser / hosted AgentSam product
               │
               ▼
             ExecOS
   enroll / resolve / route / reconnect
               │
               ▼
            agentsamd
       on the enrolled machine
               │
               ▼
     PTY / process / fs / ports
```

ExecOS is useful because a browser/cloud caller cannot safely assume direct access to a user's loopback runtime. ExecOS resolves the correct enrolled runtime and connects the caller to it.

## Current implementation vs target architecture

Do not document the target as if all code already implements it.

### Current implementation

- `agentsamd` is a native runtime daemon and already represents the intended portable machine-runtime role.
- Local Studio desktop has direct/native runtime paths and can use local `agentsamd`.
- ExecOS currently contains a Node machine daemon that still hosts PTY/process functionality for existing InnerAnimalMedia connections.
- Historical/live registry rows may use `runtime_adapter=execos_legacy`.
- ExecOS's Worker now has D1-backed structural runtime/session state and can resolve/mint browser PTY sessions for its managed connections.
- Some Tauri/native bridges still implement machine functionality directly while the runtime surface is being consolidated.

### Target architecture

- `agentsamd` owns portable local machine capabilities.
- ExecOS owns remote enrollment, runtime/connection resolution, routing, reconnect/session transport, and hosted coordination.
- Desktop, CLI, hosted products, and other consumers use one capability-oriented `agentsam.runtime.v1` contract.
- ExecOS may route to `agentsamd`, Cloudflare Sandbox, an explicit hosted substrate, or another compatible runtime implementation.
- Existing ExecOS machine-daemon behavior is consolidated only after parity is proven; it is not deleted by vocabulary alone.

See `docs/plans/AGENTSAMD-RUNTIME-UNIFICATION.md` for the audit-first consolidation lane.

## Registry axes: never conflate them

Physical D1 tables remain `terminal_*` for this generation. Domain nouns are `RuntimeInstance`, `RuntimeConnection`, `RuntimeAdapter`, and `RuntimeCapabilities`.

```text
INSTANCE   what computer/execution environment is this?
ADAPTER    what speaks agentsam.runtime.v1 there?
TRANSPORT  how do we reach that adapter?
AUTH       how is this connection authenticated?
```

Examples:

| | User Mac | VM | CF Sandbox |
|---|---|---|---|
| provider | local | provider-specific | cloudflare |
| substrate | host | vm | sandbox |
| lifecycle | persistent | persistent/ephemeral | ephemeral |
| protocol | `agentsam.runtime.v1` | same | same |
| runtime_adapter | target: `agentsamd`; current may be `execos_legacy` | `agentsamd` / current ExecOS compatibility | `cloudflare_sandbox` |
| transport | direct HTTPS / tunnel / local IPC | tunnel / VPC / direct HTTPS | service binding |
| auth_mode | connection token / local trust boundary | connection token / platform bridge | service binding |

**Forbidden:** using `transport=execos` or `transport=container`. Those are adapter/substrate concepts smuggled into transport.

## Runtime Registry (D1 spine)

```text
ACCOUNT
│
├── agentsam_api_credentials
├── cloud_provider_connections        optional provisioning authority
│
└── terminal_instances               WHAT EXISTS
       ├── provider / substrate / lifecycle
       ├── platform / arch / capabilities_json
       ▼
    terminal_connections             HOW AGENTSAM REACHES IT
       ├── protocol = agentsam.runtime.v1
       ├── runtime_adapter = agentsamd | execos_legacy | cloudflare_sandbox | …
       ├── transport = direct_https | cloudflare_tunnel | vpc_service | …
       ├── auth_mode
       ├── terminal_connection_credentials
       ├── terminal_enrollment_tokens
       ├── terminal_sessions          interactive PTY/session structure
       ├── terminal_jobs              noninteractive runtime jobs
       └── terminal_port_forwards
```

Do not create parallel `runtime_instances` / `runtime_connections` physical tables this generation.

Authority ladder:

```text
account credential
  → enrollment token
  → connection credential
  → short-lived session attach capability
```

## Canonical capability vocabulary

Reuse these concepts instead of inventing competing `terminal`, `shell`, `console`, `machine-shell`, and `remote-terminal` authorities.

```text
runtime.health
runtime.capabilities

exec.run

pty.open
pty.attach
pty.input
pty.resize
pty.detach
pty.close

process.run
process.status
process.cancel

filesystem.read
filesystem.write
filesystem.watch

ports.list
git.*
```

The exact wire names may graduate from existing protocol names such as `pty.create`; document aliases during migration rather than silently breaking compatible clients.

## PTY portability

PTY means the capability, not one library:

```text
macOS / Linux
  agentsamd
    → POSIX PTY
    → zsh / bash / sh

Windows
  agentsamd.exe
    → ConPTY
    → pwsh.exe
    → powershell.exe
    → cmd.exe fallback
```

Windows is a first-class target. The product-facing contract stays `pty.*`; platform-specific PTY backends stay behind the daemon.

## Distribution and cost law

A local `agentsamd` is a native binary on the user's machine. It does **not** inherently require Docker, a Cloudflare Container, or hosted compute.

```text
1. Local device available
   → agentsamd on user's hardware
   → default / no hosted machine compute

2. Hosted caller needs that device
   → ExecOS routes to enrolled agentsamd
   → coordination/routing cost only

3. No device or isolated hosted Linux requested
   → explicit Container / Sandbox / VM substrate
   → metered hosted compute

4. Small edge request logic
   → Worker / Wasm
   → do not allocate a long-running container unnecessarily
```

## ExecOS support status

ExecOS is supported production machinery. Do not infer deprecation from `runtime_adapter=execos_legacy`; that value is compatibility vocabulary created while normalizing old transport/adapter modeling.

ExecOS currently does more machine-side work than the target ownership model. That overlap is technical debt to measure and consolidate, not justification to break working production paths.

## Migration priorities

1. Freeze this vocabulary and keep `packages/runtime-protocol` compatible.
2. Inventory what `agentsamd`, the ExecOS Node daemon, and Tauri each implement today.
3. Define capability parity tests before moving authority.
4. Keep `terminal_*` registry/session state and the instance + adapter + transport + auth model.
5. Normalize historical `transport=execos` rows into adapter + actual transport fields.
6. Prefer `agentsamd` for stock independent/local installs.
7. Keep ExecOS as the hosted remote resolution/routing plane and existing managed compatibility path.
8. Move overlapping machine capabilities only after tests prove equivalent or better behavior.
9. Evaluate Go/Rust/Node with measurements: startup, idle memory/CPU, latency, reconnect, cleanup, crash recovery, binary/dependency footprint, and platform support.
10. Any retirement of an existing implementation requires caller inventory, parity, migration, rollback, and explicit approval.

## Rejected

- A new third machine-runtime daemon.
- Treating PTY as a product or routing system.
- Treating Tauri as the runtime authority.
- Requiring ExecOS/InnerAnimalMedia for ordinary local AgentSam usage.
- Requiring Docker/Cloudflare Container merely because the current `agentsamd` implementation is Go.
- Rewriting Go/Node in Rust because a scaffold compiled.
- Deleting working ExecOS paths before `agentsamd` parity is proven.
- Parallel `runtime_*` physical tables beside `terminal_*` this generation.

## Success criteria

- User123 can install an AgentSam product and use supported local runtime capabilities without InnerAnimalMedia infrastructure.
- Desktop/local consumers reach `agentsamd` directly where appropriate.
- Hosted/browser consumers can reach an enrolled runtime through ExecOS without hardcoded user/machine assumptions.
- PTY is tested as a capability across macOS/Linux and Windows ConPTY.
- Runtime selection is capability-driven rather than tied to Go/Rust/Node.
- Existing ExecOS connections remain functional during consolidation.
- No product silently falls back to a fake terminal while labeling it as a real PTY.
