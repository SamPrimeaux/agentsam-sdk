# Dependency health and repair

AgentSam checks npm dependency graphs against known OSV advisories, reads dependency warnings from install/build/deploy logs, and prepares verified repairs. A passing report means no findings in the supported checks; it is not proof that application code is secure.

## Commands

~~~bash
agentsam security scan --path .
agentsam security check --path . --log /tmp/deploy.log --json
agentsam security run --path . -- npm run build
agentsam security repair --path . --log /tmp/deploy.log --json
agentsam security repair --path . --apply --verify verify --json
~~~

The alias is "agentsam sca". Offline scanning lists dependency inventory but **always exits 2**, because no vulnerability lookup was performed. Use "node src/security/cli.mjs" inside this repository before dependencies are installed.

The run command executes the exact argument vector after "--", without a shell, captures up to 8 MiB, and checks the resulting logs and lockfile. It preserves a failed command as a failed result. Logs are captured rather than streamed; receipts contain categories and line numbers, never raw log lines. Use it around an existing deployment command to make warnings visible, or around the build before deployment. It does not roll back a deployment already performed by that command.

## What is checked

- Exact npm package-lock / shrinkwrap versions 1, 2 and 3, including nested dependencies, aliases, and workspaces. npm-shrinkwrap takes precedence.
- Lockfile consistency with root/workspace manifest declarations and missing direct lock entries.
- Full paginated OSV advisories, including IDs, aliases, severity evidence, and package-specific fixed releases. Withdrawn advisories are excluded.
- Deprecations recorded in the lockfile and warnings in a supplied log.
- Engine mismatches, peer conflicts, package-manager configuration warnings, audit summaries, and unclassified warnings.
- Experimental runtime and pip/npm update notices are explicitly informational.

An old audit summary can be resolved by a complete fresh scan. A deprecated-package log warning is resolved when the package is absent or its version changed and the new lock entry is not deprecated. Engine/peer/configuration/unclassified warnings stay actionable until reviewed at their source.

## Coverage and exit codes

- **0:** complete and clean, already clean, or verified repair candidate.
- **1:** unresolved findings, failed wrapped command, or manual action needed.
- **2:** incomplete lookup/coverage, offline inventory, invalid input, or failed repair execution.

The npm graph adapter does not pretend to parse pnpm, Yarn or Bun formats. Those managers produce an explicit incomplete result. Missing lockfiles, unresolved ranges, external file/Git dependencies, and mismatched workspace manifests also make coverage incomplete. A package.json-only scan cannot prove transitive coverage.

The scanner includes development and optional dependencies present in the lockfile. It queries OSV for each unique registry package name/version with four concurrent requests, a two-minute overall deadline, per-request timeouts, bounded response bodies, transient-status retries, and pagination-loop detection. Names and versions go to OSV; project source and log contents do not. No local credentials are sent to OSV. Unknown severities remain actionable and raw CVSS vectors are retained rather than guessed.

## Repair contract

Repair produces a plan by default. Applying requires an online complete scan, a clean Git repository root, and an existing npm verification script (verify, otherwise test, or explicit --verify SCRIPT). Automated repair currently requires macOS/Linux; Windows can scan and triage.

The command creates a new agentsam/security-* branch and worktree under the system temporary directory, leaving the source checkout untouched. It:

1. Runs npm audit fix with package-lock-only, ignore-scripts, force=false and legacy-peer-deps=false.
2. For deprecated dependencies, also runs npm update within existing declared ranges, with scripts disabled and no manifest saving.
3. Rejects changes outside the selected lockfile and major-version changes at existing dependency paths.
4. Runs a fresh npm ci with install scripts disabled, then the configured verification script.
5. Rescans OSV and triages the original plus new install/verification logs.
6. Returns a structured receipt with branch, worktree, step exit codes, before/after reports, and verified status.

A verified candidate remains available for review/commit. Failed or unresolved candidates are retained for inspection and never marked fixed. Native packages needing lifecycle builds may fail verification; that remains visible rather than silently enabling install scripts. The existing verification script runs as trusted project code.

The command never uses force, edits dependency declarations, selects a major upgrade, suppresses warnings, executes instructions copied from logs/advisories, publishes, or deploys. Fixed versions listed by an advisory are evidence, not a promise they are compatible with your application. Breaking upgrades, package replacements, engine changes, and peer-range design decisions remain explicit follow-up work.

## Installed automation in this repository

CI and the alpha publication workflow wrap npm installation with the dependency-health gate. The root prepublish hook also performs an online security scan after verification.

The dependency-maintenance workflow runs weekly and can be dispatched manually. It prepares and verifies a repair, then opens a PR when a verified lockfile change exists. It does not auto-merge or publish. It explicitly dispatches CI for its generated branch because GitHub-token-created PRs do not trigger another workflow automatically. An existing repair PR prevents duplicates. If repository settings block PR creation, the verified branch and compare URL remain in the failed run receipt for follow-up. Unresolved or incomplete runs fail visibly and upload a JSON receipt. GitHub repository settings must permit Actions to create pull requests.

Other projects opt in by wrapping their existing build/install commands or calling the exported @inneranimalmedia/agentsam-sdk/security API. This SDK does not silently monitor unrelated deployments.

References: [OSV query API](https://google.github.io/osv.dev/post-v1-query/), [npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/), [npm update](https://docs.npmjs.com/cli/v11/commands/npm-update/).
