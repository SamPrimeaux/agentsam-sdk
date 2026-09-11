# Hooks and Operational I/O

## A hook is a boundary-triggered program

Examples include Git hooks, CI jobs, deploy hooks, webhooks, queue consumers,
scheduled tasks, post-migration checks, and runtime alerts. The triggering mechanism
changes; the engineering questions do not.

A reliable hook has explicit input, authority, output, and failure behavior.

## Hook contract

```text
name:
event:
scope:
input refs:
handler:
reads:
writes/side effects:
credential(s) + scopes:
timeout:
retry/backoff:
idempotency key:
output/receipt:
on failure:
owner:
```

### Input

Prefer immutable or content-addressed references where possible: Git SHA, Merkle root,
deployment ID, schema version, artifact digest, event ID. Do not make the handler infer
which candidate it should operate on from mutable ambient state.

### Authority

Give the hook only the credential scopes it needs. A test job should not hold a
production deploy token. A postdeploy health checker should not need database-admin
credentials just to call a public health path.

### Output

Emit bounded structured evidence: status, timing, affected resource IDs, hashes,
versions, and sanitized error categories. Never emit raw secrets, access tokens, full
request headers, or unbounded logs into a receipt.

### Failure

Choose deliberately:

- `warn`: record but do not block;
- `block`: candidate cannot advance;
- `rollback`: revert/disable when rollback is proven safe;
- `quarantine`: keep the candidate deployed but unavailable while investigation runs.

Do not default every hook to "retry forever." Retries need a bounded count/window and
idempotency semantics for side effects.

## Ingress versus egress hooks

**Ingress** receives something from outside: HTTP request, webhook, auth callback,
queue event. Validate identity/signature/schema before trusted business logic.

**Egress** sends something outward: API call, deploy, notification, database write.
Validate destination identity/allowlist, credential scope, request contract, timeout,
and retry/idempotency behavior.

This makes operational I/O inspectable as edges in the same graph as code imports.

## Deploy hook composition

A robust deploy wrapper behaves like:

```text
predeploy
  inspect/security/build/tests
  capture evidence

provider deploy
  capture deployment/version ID

postdeploy
  smoke critical routes/contracts
  inspect metrics if available

promote
  success receipt only if postdeploy is green

failure
  failure receipt
  rollback/disable/quarantine according to project policy
```

Do not hide this behind one opaque shell string when individual steps need different
failure semantics or receipts.
