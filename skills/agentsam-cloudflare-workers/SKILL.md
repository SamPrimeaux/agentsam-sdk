---
name: agentsam-cloudflare-workers
description: >
  Treat Cloudflare Workers, Wrangler, Durable Objects, D1, R2, Queues, Hyperdrive,
  Browser, Containers, observability, versions, and deployment mechanics as a native
  AgentSam execution dialect. Use when inspecting, debugging, profiling, operating,
  or shipping Cloudflare-backed applications. Prefer typed Wrangler operations,
  machine-readable output, explicit risk classes, real error/trace identifiers, and
  Worker-runtime semantics over generic shell guessing.
metadata:
  short-description: "Cloudflare Workers/Wrangler native operations, observability, errors, and CPU discipline"
  aliases:
    - cloudflare
    - workers
    - wrangler
    - cf-native
user-invocable: true
---

# AgentSam Cloudflare Workers

Cloudflare is a first-class execution environment, not just a deploy target. Use its
runtime rules and Wrangler command contracts as native vocabulary.

## Operating laws

- Prefer structured Wrangler output such as `whoami --json`, deployments/versions JSON, and JSON tail events where supported.
- Never ask a model to read or print `wrangler auth token`, API tokens, secrets, cookies, or credential files. Identity status is useful evidence; credential bytes are not.
- Classify every operation before execution: read, local-runtime, filesystem-write, remote-write, secret-bearing, or long-running stream.
- Keep `cwd`, account authority, connection identity, and execution leases runtime-owned. Do not accept them from model arguments when they are security-relevant.
- Preserve real provider/runtime errors: process exit code, HTTP status, machine error type/code, request/Ray IDs, retry metadata, and bounded redacted stderr/body.
- Do not infer CPU time from `performance.now()` or `Date.now()` around pure computation in a deployed Worker. Production timers advance around I/O; use local workerd/DevTools CPU profiles and production CPU metrics.
- For expensive CPU investigations, collect a bounded profile summary and selected source evidence first, then hand that packet to the chosen reasoning model. Do not dump the repository or raw multi-megabyte profile into model context.
- Prefer Web Crypto/native runtime primitives for CPU-intensive cryptography instead of pure-JavaScript reimplementations where the Worker contract allows it.
- Remember that open TCP sockets have runtime and Durable Object lifecycle/cost implications; close them deliberately and prefer platform-native database connectivity such as Hyperdrive where appropriate.

## Native workflow

```text
identify worker/config
  -> verify Cloudflare identity without exposing token
  -> inspect deployments/versions/config/types
  -> reproduce locally with wrangler dev/workerd
  -> collect JSON logs / CPU profile / production metrics
  -> normalize errors and trace IDs
  -> select only implicated source evidence
  -> deterministic summary
  -> optional high-reasoning model audit
  -> verify locally
  -> deploy only through the normal progression guard
```

Read the references for command risk classes, error envelopes, and CPU/observability mechanics.
