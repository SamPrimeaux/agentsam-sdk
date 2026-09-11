# Real Application Logic — Build/Inspection Gate

Use this checklist when AgentSam builds, inspects, or revises an application,
website with behavior, service, microservice, CLI, or cross-layer feature.

The purpose is to distinguish a real implementation from a convincing-looking
surface.

## 1. State the behavior

Write one sentence describing what a user/system can now actually do.

Bad:

> Add an agent dashboard.

Better:

> A signed-in user can start an agent run, watch its live task state, cancel it,
> and reopen its persisted result later.

That sentence exposes the required mechanics.

## 2. Find the current architecture

Prove where these concerns live today:

- entrypoint,
- UI/client,
- API/action boundary,
- business/domain logic,
- persistence,
- identity/auth,
- background work,
- external providers,
- tests,
- deployment/runtime.

Do not create a second architecture because the first one took effort to find.

## 3. Identify authority

For every important state value, ask:

> Who is allowed to declare this true?

Examples:

- `isMenuOpen` -> frontend UI state,
- `currentUserId` -> verified backend identity,
- `paymentSucceeded` -> payment provider/backend webhook,
- `agentRun.status` -> agent runtime/store,
- `deployment.version` -> deployment system,
- `file root hash` -> Merkle computation/evidence store.

Many broken applications are authority bugs disguised as UI bugs.

## 4. Trace the complete flow

For mutations:

```text
intent
 -> input
 -> validation
 -> authorization
 -> business rule
 -> mutation/provider operation
 -> persistence/event
 -> response
 -> visible state
```

For reads:

```text
question/view
 -> query/request
 -> authorization/scope
 -> authoritative source
 -> bounded result
 -> transformation
 -> presentation
```

Mark every missing edge before coding.

## 5. Handle non-happy paths

At minimum consider:

- invalid input,
- unauthenticated/unauthorized request,
- missing resource,
- provider/network failure,
- timeout/cancellation,
- duplicate/retried request,
- partial failure,
- stale client state,
- empty/loading state.

Do not add elaborate machinery for impossible cases, but do not pretend the
happy path is the whole application either.

## 6. Verify reality

Prefer the strongest available proof:

1. real end-to-end path,
2. integration test against real local dependency,
3. contract/API test,
4. unit test,
5. static/type/lint check.

A screenshot proves appearance. It does not prove persistence, authorization,
API correctness, side effects, cancellation, or recovery.

## 7. Inspect/revision questions

When auditing an existing project, ask:

- Is there more than one source of truth for the same state?
- Does frontend code hold secrets or claim authority it should not have?
- Does the backend trust client-supplied identity/ownership fields?
- Are runtime entrypoints overloaded with business logic?
- Are shared packages actually portable, or importing host-specific internals?
- Are API contracts explicit and validated?
- Are writes idempotent where retries can occur?
- Are errors observable and actionable?
- Are generated/demo/reference files being mistaken for runtime authority?
- Does the deployment path match the development path closely enough to trust?
- Can an agent retrieve the exact evidence it needs without flooding context?

## 8. Junior explanation after implementation

When reporting back, explain in this order:

```text
What changed
  user-visible behavior

How it works
  3-7 step real flow

Where it lives
  exact important files/modules

Why the boundaries are there
  authority/security/state reasons

How we proved it
  tests/commands/real runtime evidence
```

Keep implementation detail proportional to the user's curiosity, but never hide
an unimplemented layer behind simplified language.
