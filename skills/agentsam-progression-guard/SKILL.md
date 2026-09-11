---
name: agentsam-progression-guard
description: >
  Turn application growth into explicit no-regression checkpoints across local work,
  Git/PR CI, predeploy, deploy, postdeploy, and runtime operation. Use when adding a
  feature/service/package, designing hooks or CI/CD, preparing a release, deciding what
  should block a merge/deploy, implementing canary/rollback/feature-flag mechanics, or
  proving a change is safer than the last promoted baseline. Triggers on "no regress",
  "progression guard", "ship guard", "CI", "deploy hook", "pre-commit", "predeploy",
  "postdeploy", "rollback", "canary", "feature flag", "release gate", and "promotion".
metadata:
  short-description: "Evidence gates and hook contracts that let a growing app progress without silently regressing"
  aliases:
    - progression-guard
    - no-regress
    - ship-guard
    - release-guard
user-invocable: true
---

# AgentSam Progression Guard

The system should not depend on a developer remembering every rule in a million-line
codebase. Put important invariants at lifecycle checkpoints and make promotion depend
on evidence.

## Core law

**A state may be promoted only after the checks appropriate to that boundary pass. A
failed candidate must not advance the last-known-good baseline.**

This is the same principle whether the boundary is a commit, merge, deployment,
feature rollout, schema migration, or service version.

## Checkpoint chain

```text
intent/design
  -> local edit loop
  -> commit/push gate
  -> clean CI / PR gate
  -> predeploy evidence capture
  -> deploy
  -> postdeploy smoke + contract checks
  -> promote baseline
  -> runtime observe / canary / rollback
```

Do not run the heaviest possible suite at every keystroke. Use the dependency graph to
make early gates fast and affected-only, then require broader proof at merge/release.

Read `references/checkpoint-chain.md` for the detailed gate matrix.

## Hooks are operational I/O contracts

A hook is not "some script that happens to run." Every hook should have a small
contract:

```text
Hook
  event:
  scope/affected graph:
  immutable input refs:
  allowed reads:
  allowed writes/side effects:
  credential scope:
  command/handler:
  timeout/retry:
  output receipt:
  failure policy: warn | block | rollback | quarantine
```

Prefer idempotent hooks when practical. Never give a hook broader credentials than the
work it performs. Never let its output leak secret values. Never mark a deploy
successful because the provider command returned zero if the required postdeploy
checks have not run.

Read `references/hooks-operational-io.md` for hook design and failure semantics.

## AgentSam's existing proof chain

Use the SDK mechanics as one coherent gate system rather than unrelated commands:

```bash
# Architecture/index/trust evidence
agentsam inspect --json
agentsam security scan --path .

# Capture exact predeploy state and delta from the last promoted baseline
agentsam deploy-receipt capture . --project <project> --json

# Run the real provider deploy here
# e.g. npm run deploy / wrangler deploy / project-specific release command

# Only after required postdeploy checks succeed
agentsam deploy-receipt success . --deployment-id <id> --worker-version <id> --json

# If deploy or postdeploy verification fails
agentsam deploy-receipt failure . --deployment-id <id> --json
```

A successful finalize advances the local promoted Merkle baseline. A failure preserves
the previous trusted baseline. Keep provider deployment identity and AgentSam evidence
identity together in the receipt when available.

## What each layer should catch

- **AST/index gate:** structural contradictions, dependency edges, execution-domain mistakes, contract ownership drift.
- **Merkle gate:** exact before/after source identity and change scope.
- **Security gate:** dependency advisories plus client/server trust-boundary contradictions.
- **Type/schema gate:** compile-time and runtime contract drift.
- **Test gate:** behavior regressions at unit/integration/end-to-end boundaries.
- **Firewall/WAF/rate-limit gate:** hostile or abusive ingress patterns before application logic.
- **Auth/authorization gate:** verified identity, scope, ownership, and privileged action rules inside the application.
- **Deploy/postdeploy gate:** provider accepted the artifact *and* critical live behavior still works.
- **Runtime gate:** error/latency/saturation/security signals after promotion.

None of these replaces the others.

## Package/service progression rule

When a package/service changes:

```text
changed node
  -> compute affected downstream nodes
  -> run local affected checks
  -> run clean CI for required contract/build/security coverage
  -> deploy only the changed deployable units plus required dependents
  -> smoke their public contracts
  -> promote their evidence baseline
```

For a cross-service contract change, producers and consumers are one change set even
if they live in separate packages/repositories. Use versioned schemas/contracts and
consumer tests to make the coupling explicit.

## Deployment safety ladder

Not every app needs every rung on day one. Add protection as risk grows:

```text
single deploy + smoke test
  -> automatic rollback on failed smoke
  -> feature flag separating deploy from release
  -> canary / small traffic cohort
  -> metrics comparison window
  -> gradual promotion
```

The point is not ceremony. The point is reducing blast radius and making the system
prove health before widening exposure.

## Regression rules

1. Never advance a trusted baseline after a failed deploy or failed postdeploy check.
2. Never let local success substitute for clean-environment CI on merge/release.
3. Never make all hooks blocking; classify fast/blocking versus informational/async deliberately.
4. Never make a pre-commit hook so expensive developers bypass it; move broad work to CI.
5. Never let branch protection depend on checks that are not deterministic/reproducible enough to trust.
6. Never deploy a breaking contract without proving affected consumers or a compatibility strategy.
7. Never use a WAF rule as a substitute for application authorization.
8. Never auto-rollback a database/schema change unless the data migration itself is designed and proven reversible; prefer forward-fix/expand-contract strategies where rollback would lose data.
9. Never make feature flags permanent invisible architecture. Give them an owner and cleanup condition.
10. Never call observability "monitoring later." Define the success/failure signal before promotion.

## Completion receipt

When acting as the release/build agent, finish with a compact receipt:

```text
Candidate
  git/revision:
  merkle root:
  semantic metadata root:
  affected packages/services:

Gates
  type/build:
  tests:
  contracts:
  security:
  deploy:
  postdeploy:

Promotion
  provider deployment/version:
  baseline advanced: yes/no
  feature flag/canary state:
  rollback/failure action:

Open risks
  ...
```

A human should be able to understand why this state was promoted without reading the
entire CI log.
