# AgentSam Go `--skip-deploy` lifecycle fix

## Symptom

`npm run test:standard` appeared to hang during the CLI suite.

File-level isolation identified:

`test/cli/go.test.mjs`

and test-level isolation identified:

`agentsam go --cloudflare agentsam-go-worker --skip-deploy is idempotent`

## Root cause

This was not R2, D1, Wrangler, Cloudflare OAuth, or a remote
registry request.

The command stalled before the Go build began.

`preflightToolchain({ requireDocker: false })` still executed:

`docker info`

and only ignored a failed Docker result after the command returned.

On this development machine, `docker info` did not return while the
Docker daemon was unavailable/stalled.

Therefore the meaning of `requireDocker: false` was incorrect:

Docker was logically optional but still physically executed.

A second unconditional Docker probe also existed later inside
`deployGoCloudflare()`.

## Correct contract

For:

`agentsam go --cloudflare agentsam-go-worker --skip-deploy`

the runtime may:

- discover the AgentSam Go product
- inspect Go/Wrangler tooling needed for local validation
- run Go test/vet/build
- probe the native Go runtime
- write temporary/local build receipts
- write local product validation evidence

It must not:

- execute Docker
- build or inspect a container
- resolve Cloudflare deployment identity
- deploy with Wrangler
- perform live deployment health probes
- publish the official InnerAnimalMedia product registry
- write product state to R2
- perform a remote D1 product-registry upsert

## Local storage behavior

The test supplies a temporary `stateRoot`.

Under `skipDeploy`, `deployGoCloudflare()` writes local validation
receipt/product evidence into that supplied state root.

The remote official registry lane remains isolated and reports:

`self_host_registry_isolated`

## Fix

1. `preflightToolchain()` now accepts an injectable spawn authority.
2. Docker is executed only when `requireDocker === true`.
3. When Docker is unnecessary, the stable check result is:
   `docker / ok / skipped:not-required`.
4. `deployGoCloudflare()` independently skips its Docker probe when
   `skipDeploy === true`.
5. Regression tests throw immediately if either skip path attempts
   to execute Docker or another deployment spawn.

## Test-runner policy

No `--test-force-exit` workaround is used.

The code must terminate naturally with all lifecycle boundaries intact.
