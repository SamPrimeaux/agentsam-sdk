# AgentSam SDK 2.0.0 release

Status: published to npm as `@inneranimalmedia/agentsam-sdk@2.0.0`; npm `latest` points to 2.0.0.

## Product boundaries

The primary product is the npm package `@inneranimalmedia/agentsam-sdk`: importable SDK
modules, the AgentSam CLI, scaffold kits, and bundled optional Python tools. Docker is an
optional runtime target for independently running services such as the knowledge indexer.
Installing or using the SDK does not require Docker, a cloud account, or an always-on server.

`packages/identity` remains private and ships through the root package's `/identity`
exports. It is not a second npm publication. The Python project has its own version and
is not being published to PyPI in this release.

## What this release supports

- Local project scaffolding, SQLite, status, terminal UI, and optional PTY tooling.
- Reusable identity contracts/adapters, supplied with the consuming host's authorization,
  credentials and storage. Host integration is required for live auth/provider flows.
- Merkle integrity and repository snapshots; Python repository composition/churn tools.
- Incremental JS/TS AST and text indexing, lexical retrieval, versioned generations,
  explicit Gemini embedding requests and SQLite/Postgres store adapters.
- Dependency inventory, OSV scanning, deployment-log triage and isolated verified repair.
- Mini prototypes, Docker recipes, and the opt-in background knowledge service.

The root `AgentSam` HTTP helper provides routing/session primitives; it is not a complete
standalone hosted agent product. Host-specific tool execution, policy and model orchestration
must be supplied by the application. Knowledge AST edges remain syntactic/unresolved;
this release does not claim a complete semantic call graph. Docker service watching,
automatic retention, multi-user authorization and production routing remain host work.

## Changes from 1.9 and the identity alphas

- npm `latest` advanced from 1.9.0 to 2.0.0. The alpha tag remains
  2.0.0-alpha.identity.12 for the final identity prerelease line.
- Node 22.5+ is required. Python 3.10+ is required for Python repository intelligence;
  Docker is required only when actually building/running containers.
- In an existing repository, `agentsam init` configures repository knowledge. Use
  `agentsam init --name my-agent --yes` to create a fresh local application.
- Generated stable applications depend on `^2.0.0`; prerelease scaffolds continue to pin
  the exact prerelease. Default scaffold metadata now uses the installed SDK version.
- Knowledge and Docker features from PRs #20 and #21 are integrated in main.
- Publication runs the installed-tarball consumer proof, Python tests, and dependency scan
  in addition to the existing SDK, identity, bootstrap and package checks.
- The legacy alpha workflow refuses stable versions. Stable npm publication remains manual.

## Publication receipt

Version 2.0.0 was published on 2026-09-03 at `2026-09-03T02:21:44.857Z` from SDK git SHA
`ed629869e701809d2bf4c61bd56d05d8d8d1e183`. npm recorded this integrity value:

```text
sha512-lXnBp8GR1iduKWxxHSRHSd9Q1fjTUZvX1UecwtS8xdDxMdZRd2BSHtDygm0OMNYchrtUP1nR6g0t3MqZTkE5HA==
```

The `prepublishOnly` hook ran `npm run verify:release` before upload. That verification ran
the SDK and identity suites, package/bootstrap checks, installed-tarball fixtures, Python
tests and the complete dependency scan. The private identity and shell-kit workspaces were
not published separately.

Verify the live registry state with:

```sh
npm view @inneranimalmedia/agentsam-sdk@2.0.0 version gitHead dist.integrity
npm view @inneranimalmedia/agentsam-sdk dist-tags --json
npm install -g @inneranimalmedia/agentsam-sdk@2.0.0
agentsam --version
```

The publication receipt is recorded in `docs/RELEASES.md`. Git tag `v2.0.0` identifies the
exact npm `gitHead`. A published npm name/version cannot be overwritten; subsequent package
changes require a new version.

## Branch consolidation

See [branch archive](branch-archive-2026-09-02.md) for exact old branch heads, archive tags,
implemented replacements, and deferred work. Source history is preserved before remote
branch deletion. The existing knowledge container's checkout and data volume are retained.
