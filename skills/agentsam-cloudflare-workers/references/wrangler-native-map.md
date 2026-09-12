# Wrangler native map

Treat Wrangler commands as typed operations rather than arbitrary shell text.

## Safe model-visible reads

AgentSam's initial native executor intentionally exposes only:

- `whoami --json`
- `deployments list --json`
- `versions list --json`
- `types --check`
- `queues list`

These are argv-built and cwd/config scoped. The allowlist is intentionally smaller than Wrangler's full command surface.

## Known operational families

- Identity/config: `whoami`, `auth list`, `auth activate`, `login`.
- Development: `dev`, `types`, local persistence, remote bindings.
- Observability: `tail`, deployments, versions, logs/traces/metrics.
- Delivery: `deploy`, version deployment, rollback, triggers.
- Data: D1, R2, KV, Queues, Hyperdrive, Vectorize.
- Compute/AI: Containers, Browser, Workers AI, Workflows and related products.

Remote mutation, rollback, secret handling, token retrieval, data writes, and long-running streams require a dedicated policy/approval path. Do not broaden the safe executor by passing arbitrary trailing argv.

Wrangler global controls such as `--config`, `--cwd`, `--env`, and `--profile` are useful scoping mechanics. Keep them explicit; do not silently switch accounts or environments.
