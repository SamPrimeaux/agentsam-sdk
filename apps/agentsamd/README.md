# agentsamd

Local **machine/runtime daemon** for AgentSam (`runtime_adapter=agentsamd`, protocol `agentsam.runtime.v1`).

This is **not** `agentsam-go-worker` (hosted SERVICE). The binary reuses the go-worker runtime core under `apps/agentsam-go-worker/runtime`.

## Install (Mac)

```bash
agentsam setup runtime --profile my_computer --yes
# or
agentsam runtime install
```

Binary lands in `~/.agentsam/bin/agentsamd`. On Darwin, a LaunchAgent `com.inneranimalmedia.agentsamd` is enrolled.

## Enroll

```bash
agentsam terminal enroll --instance <id> --endpoint https://…   # mint token (API key)
agentsamd enroll --token <enrollment_token>
```

New connections default to `runtime_adapter=agentsamd` on the IAM control plane.

## Run

```bash
agentsamd                 # :8788
agentsamd version
curl -s localhost:8788/health
```
