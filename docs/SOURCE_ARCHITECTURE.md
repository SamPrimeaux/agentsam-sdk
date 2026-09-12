# AgentSam SDK source architecture

The SDK root is the product/package composition layer, not the permanent home for every reusable subsystem.

## Ownership rule

New reusable code should have an explicit owner:

- `packages/agentsam-contracts/` — framework-neutral wire/types vocabulary shared across AgentSam products and repositories.
- `packages/identity/` — identity/auth contracts and adapters.
- `packages/connectors/*/` — provider-specific connectors.
- `packages/agentsam-workbench/` — reusable UI/workbench primitives.
- `apps/*/` — self-contained applications with their own frontend/backend/shared package boundaries.
- root `src/commands/`, `src/cli.js`, and `src/index.js` — SDK/CLI composition and public facade.

`src/lib/` is a legacy extraction zone. Its current files are supported, but new unrelated reusable modules must not be added there. The source-boundary verifier freezes that surface so it can shrink over time.

## Package extraction status

Do not split the repo into micro-packages for their own sake. Extract a subsystem when it has a coherent public responsibility and can own its tests.

**Extracted:** `packages/agentsam-repository/` now owns Git identity, Merkle/filemeta algorithms, repository graph runtime normalization, and snapshot persistence. Root SDK exports and CLI/runtime consumers compose that package without restoring `src/lib/merkle` or `src/lib/git-context.js`.

Next coherent extractions:

1. **Runtime/core** — account session, provider credentials, execution approvals, run/session primitives, and telemetry composition that are not CLI-specific.
2. **Knowledge/indexing** — repository knowledge engine, stores, indexing provider contracts, and service client/runtime seams.

The root CLI should depend on these packages; packages must not depend on root CLI/commands/UI internals.

## Test placement

Package behavior belongs with the package:

```text
packages/identity/tests/*
packages/agentsam-contracts/test/*
packages/agentsam-workbench/test/*
packages/connectors/cloudflare/tests/*
```

Root SDK tests should move toward explicit roles:

```text
test/integration/*   cross-package/root-facade behavior
test/cli/*           CLI command behavior
test/release/*       packaging/release hygiene
```

The existing flat `test/*.test.mjs` set is legacy debt. It is frozen: old tests may remain while their owning subsystem is extracted, but new flat tests are rejected by `npm run verify:boundaries`.

## App isolation

Every `apps/<name>/` is a self-contained application boundary. Apps may consume documented SDK/package exports, but must not deep-import root `src/` implementation files. Reusable app logic should live in that app's `shared/` package first, then move to a top-level package only when it is genuinely cross-application.

## Company graph / Merkle authority

`agentsam-sdk` defines the portable vocabulary and deterministic algorithms. `inneranimalmedia` owns account-scoped operational persistence. The SDK must not introduce tenant/workspace/user ownership aliases or environment variables that impersonate authenticated account/repository authority.
