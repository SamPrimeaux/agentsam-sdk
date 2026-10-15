# AgentSam CLI bootstrap and remote database readiness

This first repair addresses the inability to use ordinary AgentSam commands
when the optional SAM CMS package link is missing, accidental model selection,
and incomplete remote storage discovery. It does **not** silently connect to,
modify, or migrate production resources.

## Bootstrap

- PR #227 established SDK-owned relative CMS module resolution. We retain
  that upstream fix; SDK core and CMS operations no longer depend on a separate
  npm workspace link just to boot. No competing loader is introduced here.
- For existing developer worktrees, broken node_modules links can still be
  repaired by installing dependencies from the SDK root; the new branch does
  not alter the user's dependency installation automatically.
- `auto` model preference cannot select the first model in a global catalog.
  A verified cached preference can be restored; otherwise AgentSam instructs
  the user to choose a model with `/model`. It does not substitute an embedding
  model for a coding model. An explicit local-model selection remains possible.

## Repository store authority

The existing `agentsam db sources` output now reads both Wrangler JSON/JSONC
and a restricted allowlisted subset of Wrangler TOML bindings (root and
environment variants). D1, R2, KV, Hyperdrive and Vectorize declarations are
reported with their existing binding name and source file. The scanner never
emits tokens, secrets, variables or connection URLs. It is not a general TOML
parser and does not independently establish connectivity.

The local AgentSam runtime SQLite database remains separate from an application's
D1 or other remote databases. The CLI must not replace or select an application
binding as its own knowledge store without an explicit authorized adapter.

## Explicit remote D1 schema operation

Example (not executed automatically):

    agentsam db sources
    agentsam db schema --remote --binding DB --config wrangler.toml --limit 100 --offset 0 --json

The second operation resolves a declared D1 binding, then invokes the project's
existing Wrangler binary with a fixed SQL query against `sqlite_schema`. It
supports limit 1..250 and offset 0..1000000. There is no user-defined SQL,
no implicit `--remote`, no `npx` package download and no automatic migration.
Success is a live read verification for that one configured binding and query,
not blanket permission to inspect every database in the account.

Agent tool `cloudflare.d1.schema` uses the same implementation with
`network-read` side-effect classification. `capability.invoke` requires an
explicit host authorization callback, including for reads; a missing host
approval denies execution.

## Verification

    npm run verify:registry
    node --test test/integration/cli-bootstrap-storage-readiness.test.mjs
    node --test test/integration/remote-d1-schema.test.mjs
    node --test test/integration/store-discovery.test.mjs
    node --test test/integration/sam-cms-machine.integration.test.mjs
    node --test test/shell.test.mjs

Limits: no real remote query, paid-model API call or desktop-host execution is
performed by these tests. A model snapshot's prior verification is not proof
of a fresh provider connection. Full live D1 account/database inventory and
fine-grained schema inspection require subsequent host-authorized adapters.
