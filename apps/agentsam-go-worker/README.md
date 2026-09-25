# agentsam-go-worker

Native AgentSam Go runtime packaged for Cloudflare as a Worker edge adapter + Linux Container.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Service health + build identity |
| GET | `/v1/runtime` | Go runtime inventory |
| GET | `/v1/capabilities` | Capability list |
| POST | `/v1/hash` | Deterministic SHA-256 |
| POST | `/v1/inspect` | Deterministic file findings (colors, URLs, token patterns) |

## Deploy

```bash
agentsam go --cloudflare agentsam-go-worker
```

Idempotent: second run updates/verifies the existing product instead of scaffolding a sibling.
