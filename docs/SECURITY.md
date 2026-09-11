# Security scan and evidence-backed repair

AgentSam combines dependency security evidence with a deterministic execution trust-boundary analysis. `agentsam security scan` checks the npm dependency graph against OSV **and** derives browser/server/shared execution facts from the repository's AST + Merkle semantic index.

The core security rule is execution authority, not folder naming:

> Code executed on hardware controlled by the user is untrusted client code. Code executed on hardware controlled by the application operator is the trusted server boundary.

Anything sent to a browser can be read or modified. Client validation is useful UX, but authentication, authorization, ownership, prices, permissions, resource identity, and other security/correctness invariants must be re-verified by server-owned code. Secrets must never enter the browser dependency graph or public environment.

A clean scan means no findings in the checks AgentSam could completely evaluate. It is **not** a proof that an application is secure, and the local AST analyzer currently covers JavaScript/TypeScript-family source. Hosted/custom repository knowledge providers may supply richer structural evidence for additional languages.

## Commands

~~~bash
agentsam security scan --path .
agentsam security check --path . --log /tmp/deploy.log --json
agentsam security run --path . --json -- npm run build
agentsam security repair --path . --log /tmp/deploy.log --json
agentsam security repair --path . --apply --verify verify --json
~~~

The alias is `agentsam sca`. Offline scanning still performs the deterministic AST/Merkle trust-boundary analysis, but dependency vulnerability coverage is incomplete without OSV and therefore the overall command exits 2.

The `run` command executes the exact argument vector after `--`, without a shell, captures up to 8 MiB, and checks the resulting logs, dependency graph, and source trust boundary. It preserves a failed command as a failed result. Logs are captured rather than streamed; receipts contain categories and line numbers, never raw log lines. It does not roll back a deployment already performed by that command.

## What is checked

### Dependencies and logs

- Exact npm package-lock / shrinkwrap versions 1, 2 and 3, including nested dependencies, aliases, and workspaces. npm-shrinkwrap takes precedence.
- Lockfile consistency with root/workspace manifest declarations and missing direct lock entries.
- Full paginated OSV advisories, including IDs, aliases, severity evidence, and package-specific fixed releases. Withdrawn advisories are excluded.
- Deprecations recorded in the lockfile and warnings in a supplied log.
- Engine mismatches, peer conflicts, package-manager configuration warnings, audit summaries, and unclassified warnings.
- Experimental runtime and pip/npm update notices are explicitly informational.

### Execution trust boundary

AgentSam's semantic Merkle pass records, for indexed JS/TS files:

- content hash and metadata root;
- inferred/declared `execution_domain` (`browser`, `server`, `shared`, `test`, `tooling`, `framework`, `unknown`);
- AST imports plus resolved local import edges;
- names of `process.env` / `import.meta.env` accesses, never their values;
- parser coverage/errors.

The deterministic analyzer then follows the browser-reachable graph and reports contradictions such as:

- browser code importing server-owned modules;
- browser-reachable code importing Node/server-only runtime dependencies;
- browser code reading private server environment names;
- public environment names that look secret-bearing (`VITE_*`, `NEXT_PUBLIC_*`, etc. do **not** make a secret safe);
- shared code depending on server environment state.

Findings carry source/target hashes and the semantic `metadata_root`, so a repair can be tied to exact evidence rather than a prose guess. The same analyzer is embedded in `repository.snapshot`, so `agentsam inspect` and `agentsam security scan` do not maintain competing architecture models.

Framework adapters are not guessed away. Exceptional layouts can declare deterministic `agentsam.classify` rules in the nearest package manifest. For example, a server-only DB module physically located in a frontend workspace can declare `execution_domain: "server"`; a generated router/server-function bridge can declare `framework`. Tests and known build-tool config files are separately classified instead of being mistaken for shipped browser roots.

## Mechanical repair contract

Every trust-boundary finding has a deterministic repair action such as:

- `move-server-call-behind-api-boundary`
- `move-server-dependency-out-of-browser-graph`
- `move-secret-to-server-runtime`
- `split-shared-contract-from-server-implementation`

`agentsam security repair` includes these in its plan with the exact evidence refs. They are deliberately `automatic: false` today. Moving an application boundary can change behavior, so AgentSam does not blindly rewrite architecture and claim success.

The reliable automatic-repair target is an isolated-worktree workflow: capture the Merkle/metadata baseline, apply a bounded recipe, rebuild/retest, create a fresh semantic snapshot, prove the contradiction disappeared without introducing new ones, and return a before/after receipt. Dependency repair already uses this isolated verified pattern; source-boundary repair will only become automatic when a recipe can satisfy the same proof standard.

## Dependency repair

Dependency repair produces a plan by default. Applying requires an online complete dependency scan, a clean Git repository root, and an existing npm verification script (`verify`, otherwise `test`, or explicit `--verify SCRIPT`). Automated dependency repair currently requires macOS/Linux; Windows can scan and triage.

The command creates a new `agentsam/security-*` branch and worktree under the system temporary directory, leaving the source checkout untouched. It:

1. Runs npm audit fix with package-lock-only, ignore-scripts, force=false and legacy-peer-deps=false.
2. For deprecated dependencies, also runs npm update within existing declared ranges, with scripts disabled and no manifest saving.
3. Rejects changes outside the selected lockfile and major-version changes at existing dependency paths.
4. Runs a fresh npm ci with install scripts disabled, then the configured verification script.
5. Rescans OSV, logs, and the AST/Merkle trust boundary.
6. Returns a structured receipt with branch, worktree, step exit codes, before/after reports, and verified status.

A verified candidate remains available for review/commit. Failed or unresolved candidates are retained for inspection and never marked fixed. The command never force-pushes, publishes, deploys, executes instructions copied from logs/advisories, or treats an advisory's fixed version as proof of application compatibility.

## Coverage and exit codes

- **0:** complete and clean, already clean, or verified repair candidate.
- **1:** complete scan with unresolved findings, failed wrapped command, or manual action needed.
- **2:** incomplete lookup/coverage, offline dependency inventory, invalid input, or failed repair execution.

The npm adapter does not pretend to parse pnpm, Yarn or Bun lock formats. Missing lockfiles, unresolved/external dependencies, and mismatched workspace manifests remain explicitly incomplete. An app workspace that links packages outside its own root can still receive a complete trust-boundary result while its dependency section reports that external package coverage must be scanned at the owning repository root.

## Installed automation in this repository

CI and publication workflows use the same `agentsam security` implementation. The root `prepublishOnly` hook runs `npm run verify:release`, which includes the online security scan. The dependency-maintenance workflow can prepare verified lockfile repairs but does not auto-merge, publish, or deploy.

Other projects can use the CLI or the exported `@inneranimalmedia/agentsam-sdk/security` API. Repository inspection also carries bounded trust-boundary analysis through `repository.snapshot`; observability/index evidence is not injected wholesale into model context.

References: [OSV query API](https://google.github.io/osv.dev/post-v1-query/), [npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/), [npm update](https://docs.npmjs.com/cli/v11/commands/npm-update/).
