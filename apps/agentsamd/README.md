# agentsamd

Local **machine/runtime daemon** for AgentSam (`runtime_adapter=agentsamd`, protocol `agentsam.runtime.v1`).

This is **not** `agentsam-go-worker` (hosted SERVICE). The binary reuses the go-worker runtime core under `apps/agentsam-go-worker/runtime`.

## Install (Mac)

```bash
agentsam setup runtime --profile my_computer --yes
# or
agentsam runtime install --yes
```

Binary lands in `~/.agentsam/bin/agentsamd`. On Darwin, a LaunchAgent `com.inneranimalmedia.agentsamd` is written.

## Run

```bash
agentsamd --listen 127.0.0.1:18765
agentsam runtime status
curl -s http://127.0.0.1:18765/health
curl -s http://127.0.0.1:18765/v1/runtime
```

Default listen: `127.0.0.1:18765` (override with `--listen` or `AGENTSAMD_LISTEN`).

## Enroll (next)

Studio/IAM mint via `agentsam terminal enroll`; daemon consume of enrollment tokens is the next cut after health/runtime MVP.
