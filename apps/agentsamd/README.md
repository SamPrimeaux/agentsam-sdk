# agentsamd

AgentSam's canonical local **machine/runtime daemon** (`runtime_adapter=agentsamd`, protocol `agentsam.runtime.v1`).

`agentsamd` is an architectural role: the native machine capability host used by local/installed AgentSam products. The current implementation direction is Go/native, reusing the runtime core under `apps/agentsam-go-worker/runtime`. Go is an implementation choice, not permanent protocol law.

This is **not** `agentsam-go-worker` (hosted service), ExecOS, the terminal UI, or Tauri.

## Ownership

```text
Local Studio / AgentSam CLI / packaged apps
                  │
                  ▼
               agentsamd
                  │
      ┌───────────┼───────────┐
      ▼           ▼           ▼
     PTY        process    filesystem
      │
 zsh/bash/
 PowerShell
```

Long-term remote access is:

```text
hosted caller
   → ExecOS
   → enrolled agentsamd
   → PTY / process / filesystem / ports
```

ExecOS owns remote enrollment/resolution/routing; `agentsamd` owns the machine capabilities. Current ExecOS/Node machinery still overlaps with PTY/process behavior in production, so consolidation must follow parity tests rather than documentation alone. See `docs/plans/AGENTSAMD-RUNTIME-UNIFICATION.md`.

## PTY is a capability

PTY is not a product or daemon. It is the operating-system primitive behind interactive shells.

Target capability vocabulary includes:

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

On macOS/Linux the PTY backend is POSIX. On Windows the equivalent is ConPTY, with shell discovery such as `pwsh.exe`, `powershell.exe`, then `cmd.exe`.

## Install

```bash
agentsam setup runtime --profile my_computer --yes
# or
agentsam runtime install --yes
```

Binary: `~/.agentsam/bin/agentsamd` (`.exe` on Windows).

| Platform | Persistence |
|---|---|
| macOS | LaunchAgent `com.inneranimalmedia.agentsamd` |
| Windows | Scheduled Task `InnerAnimalMedia\agentsamd` (user logon) |
| Linux | spawn + pid file in this cut; system service packaging can graduate separately |

A local `agentsamd` runs on the user's machine. It does **not** inherently require Docker, Cloudflare, or a Cloudflare Container.

## Run

```bash
agentsamd --listen 127.0.0.1:18765
agentsam runtime status
curl -s http://127.0.0.1:18765/health
curl -s http://127.0.0.1:18765/v1/runtime
```

Default listen: `127.0.0.1:18765` (override with `--listen` or `AGENTSAMD_LISTEN`).

## Product boundary

A User123 install must be useful without InnerAnimalMedia infrastructure:

```text
installed Local Studio / CLI
  → agentsamd
  → local machine capabilities
```

Hosted products may use ExecOS to reach an enrolled runtime. That remote path is additive; it is not a requirement for the local product.

## Auth (Studio + CLI)

Product OAuth client: **`IAM_CLIENT_ID=iam_agentsam_sdk_web`** for the current InnerAnimalMedia-hosted product deployment. This is deployment configuration, not a requirement that a local runtime depend on InnerAnimalMedia to execute local capabilities.

See `docs/plans/LOCAL-STUDIO-GRADUATION-2026-09-26.md` and `docs/architecture/AGENTSAM_RUNTIME_PROTOCOL.md`.

## Cloudflare + MCP

`agentsam.package.json` declares offerable CF OAuth packs and MCP portal connections for deployments that use them. Those integrations are optional capabilities around the local runtime; they are not prerequisites for starting the native daemon.

```bash
agentsam mcp list --bundles
agentsam cloudflare permissions authorize --packs agentsam
# explicit full catalog (user opt-in):
agentsam cloudflare permissions authorize --packs all
```

## Enrollment

Enrollment connects a runtime to a remote routing/control plane. It is unnecessary for purely local use.

The current enrollment flow uses AgentSam terminal/runtime setup machinery. Future changes should preserve the split:

```text
local machine capability authority = agentsamd
remote connection/routing authority = ExecOS or another compatible host
```

<!-- agentsam:trademark-notice -->
> Independent project. Not affiliated with, endorsed by, or sponsored by Cloudflare, Inc. or by any other company whose products are named here. Cloudflare is a registered trademark of Cloudflare, Inc. Other names are trademarks of their respective owners. See [TRADEMARKS](https://github.com/SamPrimeaux/agentsam-sdk/blob/main/TRADEMARKS.md).
