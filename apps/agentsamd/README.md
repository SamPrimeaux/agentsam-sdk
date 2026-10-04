# agentsamd

Local **machine/runtime daemon** for AgentSam (`runtime_adapter=agentsamd`, protocol `agentsam.runtime.v1`).

This is **not** `agentsam-go-worker` (hosted SERVICE). The binary reuses the go-worker runtime core under `apps/agentsam-go-worker/runtime`.

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
| Linux | spawn + pid file (no systemd unit in this cut) |

## Run

```bash
agentsamd --listen 127.0.0.1:18765
agentsam runtime status
curl -s http://127.0.0.1:18765/health
curl -s http://127.0.0.1:18765/v1/runtime
```

Default listen: `127.0.0.1:18765` (override with `--listen` or `AGENTSAMD_LISTEN`).

## Auth (Studio + CLI)

Product OAuth client: **`IAM_CLIENT_ID=iam_agentsam_sdk_web`** (same as Local Studio Production Worker). See `docs/plans/LOCAL-STUDIO-GRADUATION-2026-09-26.md`.

## Cloudflare + MCP

`agentsam.package.json` declares offerable CF OAuth packs (including pack `all` for the full ~315 Local Studio scopes) and MCP portal connections (`mcp-portals.read` / `mcp-portals.write` via the `agentsam` pack).

```bash
agentsam mcp list --bundles
agentsam cloudflare permissions authorize --packs agentsam
# explicit full catalog (user opt-in):
agentsam cloudflare permissions authorize --packs all
```

## Enroll (next)

Studio/IAM mint via `agentsam terminal enroll`; daemon consume of enrollment tokens is the next cut after health/runtime MVP.

<!-- agentsam:trademark-notice -->
> Independent project. Not affiliated with, endorsed by, or sponsored by Cloudflare, Inc. or by any other company whose products are named here. Cloudflare is a registered trademark of Cloudflare, Inc. Other names are trademarks of their respective owners. See [TRADEMARKS](https://github.com/SamPrimeaux/agentsam-sdk/blob/main/TRADEMARKS.md).
