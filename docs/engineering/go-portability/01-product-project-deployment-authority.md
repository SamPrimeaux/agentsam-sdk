# AgentSam Go Product / Project / Deployment Authority

## Product

`@inneranimalmedia/agentsam-go-worker` is a distributable AgentSam product.

The portable package owns source code and the generic Cloudflare Worker +
Container configuration.

It does not own a customer's Cloudflare account, domain, or mutable project
state.

## Project instance

Mutable AgentSam Go state belongs to the caller repository:

`<project>/.agentsam/go/`

This rule applies equally to maintainers and third-party users.

Product source must not become state authority merely because it was discovered
from the SDK repository.

## Deployment

A deployment belongs to the Cloudflare account selected by the current user.

The published portable config:

`apps/agentsam-go-worker/wrangler.jsonc`

must not contain InnerAnimalMedia's production hostname.

InnerAnimalMedia production deployment is a separate explicit maintainer path:

`apps/agentsam-go-worker/wrangler.inneranimalmedia.jsonc`

That file is intentionally excluded from the npm package `files` contract.

## Invariants

- `runtime.inneranimalmedia.com` is Sam's deployment, not the AgentSam Go product.
- self-host mode uses `wrangler.jsonc`
- official release mode uses `wrangler.inneranimalmedia.jsonc`
- self-host state belongs to the caller project
- maintainer state follows the same caller-project rule
- no live deployment is performed by portability tests


## Receipt location

Interactive `agentsam go` asks the operator where run receipts/state should live.

Supported choices:

- project-local
- central `~/.agentsam/receipts/<project>`
- custom directory

Non-interactive callers may use:

`--receipt-root <path>`

Distribution verification remains offline by default. Ambient Cloudflare
credentials do not enable remote/container verification. Explicit opt-in is:

`AGENTSAM_VERIFY_GO_CLOUDFLARE=1`

Dry-run and skip-deploy lanes must never execute Docker.
