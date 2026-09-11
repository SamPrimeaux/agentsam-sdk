# Checkpoint Chain

## Gate 0 — intent/design

Before code, name the behavior, authority owner, boundary contracts, state owner, and
credentialed destinations. For sensitive paths, name abuse/failure cases too.

Evidence: short design/plan, relevant schema/type, destination card.

## Gate 1 — local edit loop

Goal: feedback in seconds.

Prefer changed/affected scope:

- syntax/lint;
- TypeScript/type checking for affected packages;
- narrow unit tests;
- AST/index contradiction checks when boundaries changed;
- secret scan for newly touched material.

Do not run a 20-minute suite on every save.

## Gate 2 — commit/push

Goal: stop obvious bad states before remote review.

Typical blocking checks:

- formatting/lint/type sanity;
- fast affected tests;
- secret scanning;
- generated-contract consistency if committed artifacts are expected.

A pre-commit/push hook is local convenience and early protection. CI remains the
shared authority because local hooks can be skipped or differ by machine.

## Gate 3 — PR / clean CI

Goal: prove the candidate from a clean environment.

Typical required checks:

- clean dependency install;
- full/required build;
- broader unit/integration tests;
- contract/schema compatibility;
- `agentsam security scan`;
- deterministic repository/AST/Merkle evidence;
- deployment dry run where supported.

Use branch protection to make required checks real gates instead of reminders.

## Gate 4 — predeploy

Goal: tie the exact candidate to a reproducible evidence identity.

Capture the Merkle/semantic snapshot and compare with the last promoted baseline.
Confirm:

- source tree/revision intended for deploy;
- no unexplained trust-boundary contradictions;
- required release checks green;
- credentialed destinations/config are present without logging their secret values;
- migration/deploy plan is understood.

Use `agentsam deploy-receipt capture` immediately before the provider release command
when practical.

## Gate 5 — deploy

Goal: perform the real side effect with the smallest necessary authority.

Record provider deployment/version identity. Deployment success means the provider
accepted the candidate; it does not yet prove user-visible health.

## Gate 6 — postdeploy

Goal: exercise critical live I/O.

Examples:

- health endpoint;
- authentication callback/session creation;
- one critical read/write path against non-destructive test data;
- public asset/route availability;
- service binding/RPC call;
- external provider integration where a safe smoke path exists;
- error/latency signals for the new version.

Failure should block promotion and trigger the defined rollback/quarantine response.

## Gate 7 — promote

Only now advance the last-known-good evidence baseline. In AgentSam that means
finalizing the deploy receipt as success. Failed deploy or failed smoke must finalize
as failure and leave the trusted baseline untouched.

## Gate 8 — runtime

Continue observing after promotion. For higher-risk changes, use a canary cohort,
feature flag, or gradual rollout so health can be compared before full exposure.

Runtime signals should have owners and actions, not just dashboards:

```text
signal -> threshold/window -> action -> receipt/incident
```

Examples: error-rate spike -> disable feature flag; auth failures -> halt rollout;
latency regression -> keep canary at current cohort and investigate.
