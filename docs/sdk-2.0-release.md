# AgentSam SDK 2.0.0 release

Status: prepared for manual npm publication; no publish is performed by branch cleanup.

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

- The npm `latest` tag was 1.9.0 at preparation; the alpha tag was
  2.0.0-alpha.identity.12. Version 2.0.0 was not present in the registry.
- Node 22.5+ is required. Python 3.10+ is required for Python repository intelligence;
  Docker is required only when actually building/running containers.
- In an existing repository, `agentsam init` configures repository knowledge. Use
  `agentsam init --name my-agent --yes` to create a fresh local application.
- Generated stable applications depend on `^2.0.0`; prerelease scaffolds continue to pin
  the exact prerelease. Default scaffold metadata now uses the installed SDK version.
- Knowledge and Docker features from PRs #20 and #21 are integrated in main.
- Publication runs the installed-tarball consumer proof, Python tests, and dependency scan
  in addition to the existing SDK, identity, bootstrap and package checks.
- The legacy alpha workflow refuses stable versions. Stable npm publication stays manual.

## Publish from the clean main checkout

```sh
cd /Users/samprimeaux/agentsam-sdk
git status --short
git pull --ff-only
npm ci
bash scripts/npm-publish-preflight.sh
npm publish --tag latest --access public
```

The `prepublishOnly` hook runs `npm run verify:release` before upload. This runs the SDK and
identity suites, package/bootstrap checks, installed-tarball fixtures, Python tests and a
complete dependency scan. The tests do not call embedding providers or production databases.
If npm requests login or a one-time code, complete that in your terminal. Do not publish
with `--workspaces`: identity and shell-kit workspaces remain private.

After a successful publish, verify the registry and record the receipt:

```sh
npm view @inneranimalmedia/agentsam-sdk@2.0.0 version dist.integrity
npm view @inneranimalmedia/agentsam-sdk dist-tags --json
npm install -g @inneranimalmedia/agentsam-sdk@2.0.0
agentsam --version
```

Record the actual publication date and SDK commit in `docs/RELEASES.md`; only then create
the `v2.0.0` release tag. A published npm name/version cannot be overwritten.

## Branch consolidation

See [branch archive](branch-archive-2026-09-02.md) for exact old branch heads, archive tags,
implemented replacements, and deferred work. Source history is preserved before remote
branch deletion. The existing knowledge container's checkout and data volume are retained.
