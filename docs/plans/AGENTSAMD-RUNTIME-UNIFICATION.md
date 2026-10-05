# agentsamd Runtime Unification Plan

**Status:** planned / audit-first  
**Scope:** `agentsamd`, ExecOS machine daemon, Tauri/native machine bridges, `agentsam.runtime.v1`  
**Non-goal:** this plan is not authorization to rewrite a daemon or replace a working runtime because another language compiled.

## Decision

`agentsamd` is the canonical local machine-runtime role.

PTY is one capability hosted by that runtime. ExecOS is the remote enrollment/resolution/routing plane. Tauri is a desktop/native host and supervisor. Language choices remain implementation details.

Target topology:

```text
LOCAL / INSTALLED

Local Studio / CLI / packaged apps
               │
               ▼
            agentsamd
               │
     ┌─────────┼─────────┐
     ▼         ▼         ▼
    PTY      process   filesystem
```

```text
HOSTED / REMOTE

Browser / hosted caller
          │
          ▼
        ExecOS
  enroll / resolve / route
          │
          ▼
       agentsamd
   on enrolled machine
          │
          ▼
 PTY / process / filesystem / ports
```

## Why this plan exists

Current code has overlap:

- `agentsamd` is already the intended portable/native machine daemon.
- ExecOS still has a Node machine daemon that owns real PTY/process behavior for current managed connections.
- Tauri/native bridges implement some direct machine functions.
- Local Studio has historically had both real-runtime and virtual/scratch terminal paths.

Do not flatten those into “terminal stuff.” Consolidation starts by proving what each implementation actually does.

## Phase 0 — inventory before changing authority

Answer these with code/tests, not assumptions:

1. What capabilities does `agentsamd` implement today?
2. What does the ExecOS machine-side daemon implement today?
3. What does Tauri implement directly?
4. Which contracts overlap?
5. Which implementation is authoritative for each capability today?
6. Which paths are compatibility/legacy versus intended long-term ownership?
7. Which callers depend on each path?
8. What breaks if one implementation disappears?

Produce a capability matrix with at least:

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

## Phase 1 — contract normalization

Keep `agentsam.runtime.v1` as the shared authority.

Do not introduce another daemon or another terminal protocol. Normalize aliases and current method names behind capability-oriented contracts.

Required conceptual split:

```text
PTY          operating-system capability
agentsamd    machine capability host
ExecOS       remote runtime routing/connection plane
xterm        presentation/client
Tauri        native desktop host/supervisor
```

## Phase 2 — shared acceptance tests

Before moving a capability from one implementation to another, run the same acceptance suite against both.

### PTY acceptance

Test at minimum:

- interactive zsh/bash on Unix;
- PowerShell/ConPTY on Windows;
- cwd selection and rejection;
- environment handling;
- resize;
- detach/reattach;
- multiple simultaneous sessions;
- shell exit;
- client disconnect;
- daemon restart;
- process cleanup;
- no orphaned children;
- runtime/session ownership;
- wrong-account/wrong-connection rejection;
- connection-token rotation;
- 100 concurrent idle PTYs;
- resource accounting.

### Runtime measurements

Compare implementations using actual measurements:

- startup time;
- idle RSS / memory;
- idle CPU;
- command latency;
- PTY input/output latency;
- reconnect latency;
- crash recovery;
- child cleanup;
- binary/package size;
- dependency footprint;
- macOS/Linux/Windows support;
- operational failure modes.

## Phase 3 — language evaluation

Current direction is Go/native for `agentsamd`. That is not permanent architecture law.

Rust is a valid canary or module language for:

- shared runtime state machines;
- capability validation;
- auth/crypto;
- receipt parsing;
- deterministic routing/policy;
- PTY/runtime experiments;
- native modules.

Rapid Rust success is not defined as “the project compiled.” A Rust candidate must beat or materially improve the current implementation on measured correctness, reliability, operability, portability, or performance before it replaces anything.

A useful experiment is a parallel runtime canary:

```text
current agentsamd / current host runtime
               vs
Rust runtime canary on another port
```

Run the same PTY/runtime suite against both.

## Phase 4 — consolidate ownership

Only after parity:

- local/installed products prefer direct `agentsamd`;
- Tauri launches/supervises `agentsamd` but does not become the runtime;
- ExecOS routes hosted/remote callers to enrolled `agentsamd`;
- current ExecOS Node host capabilities can be retired or narrowed only after caller migration and rollback proof;
- explicit hosted substrates such as Sandbox/Container/VM remain separate runtime adapters.

## Windows

Windows is first-class.

```text
Local Studio
    │
    ▼
agentsamd.exe
    │
    ▼
ConPTY
    │
    ├── pwsh.exe
    ├── powershell.exe
    └── cmd.exe fallback
```

The public capability remains `pty.*`; clients should not need separate Windows-terminal business logic.

## Cost / deployment law

Go or Rust does not imply Docker or Cloudflare Containers.

A local daemon runs as a native binary on User123's hardware. Hosted Linux process substrates are explicit opt-in infrastructure:

```text
local device
  → native agentsamd
  → default

remote access to that device
  → ExecOS coordination/routing
  → agentsamd on user's machine

no enrolled device / isolated hosted compute requested
  → Container / Sandbox / VM
  → metered hosted compute

small edge request logic
  → Worker / Wasm
```

## Guardrails

This lane must not:

- invent `agentsam-runtime-daemon-v2`;
- add another PTY daemon;
- rewrite Go in Rust without evidence;
- force local AgentSam through ExecOS;
- force ExecOS into desktop/npm installs;
- make a Cloudflare Container the default local runtime;
- move product state into the runtime;
- treat a passing build/dry-run as production validation.

## Completion criteria

This plan is complete only when:

1. the capability matrix is grounded in current code;
2. shared runtime/PTy acceptance tests exist;
3. current consumers are inventoried;
4. local/desktop runtime ownership is unambiguous;
5. hosted ExecOS routing is capability-oriented;
6. Windows ConPTY behavior is proven;
7. any implementation retirement has parity + rollback evidence;
8. docs distinguish current implementation from target architecture.
