# CLI `go.test.mjs` Hang Diagnostic

Recorded: `2026-10-04T03:26:23.680511+00:00`

Branch: `feat/work-suite-graduation-20261003`

## Prior isolation

The complete CLI file diagnostic found:

- 20 CLI test files pass independently
- `test/cli/go.test.mjs` alone exceeds 30 seconds
- no other CLI test file times out

## Force-exit diagnostic

Result: **TIMEOUT**

Duration: **15.02s**

Diagnosis: **SPECIFIC_TEST_TIMEOUT**

Node `--test-force-exit` was used only as a diagnostic.
It is not an accepted permanent fix for the test suite.

## Per-test isolation

- PASS | 0.37s | discoverGoRuntime finds agentsam-go-worker without inventing a sibling
- PASS | 0.24s | ensureProductContract refuses missing product roots instead of scaffolding siblings
- PASS | 1.49s | buildGoProduct emits build receipt after go test/vet/build
- PASS | 0.94s | agentsam go build --json exposes only portable build paths
- TIMEOUT | 12.01s | agentsam go --cloudflare agentsam-go-worker --skip-deploy is idempotent
- PASS | 0.48s | agentsam go status --json reports discovery

## Active resource probe

Not applicable for this diagnosis branch.

## Acceptance

The permanent correction must:

- close/await resources created by the test or implementation
- preserve GO/GOAP runtime behavior
- preserve timeout/queue semantics
- not add `--test-force-exit` to the normal test command
- allow `node --test test/cli/go.test.mjs` to terminate normally
- allow `npm run test:cli` to terminate normally
- allow `npm run test:standard` to terminate normally
