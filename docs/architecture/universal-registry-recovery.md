# Universal SDK registry — Batch 1 recovery

**Status:** source-backed staging in production D1; NOT a new execution authority.  
**Primary sources:** the shipped npm and Python CLI code, SAM operation registry, skill manifests, installed package bin definitions, portable hooks, and the existing versioned D1 workflows.

## Registry law

A *source declaration*, a *published distribution*, an *installed package*, an *authorized handler*, and a *successful invocation* are different states. A source file can generate a candidate; it cannot set `release_state=verified`, `is_published=1`, or `is_active=1` by itself. Release verification must compare the **exact** npm tarball / PyPI wheel version, entrypoint, artifact digest and command behavior, and record the receipt.

`npm:@inneranimalmedia/agentsam-sdk:agentsam doctor` and `pip:agentsam-sdk:agentsam doctor` intentionally have different identities. Other npm console-script executables are root binaries with *no repeated executable subcommand*. This protects users from stale workspace-only slash aliases. The Python source version must not be represented as a released PyPI version until the wheel is actually verified.

## D1 provenance and current counts

The account-scoped D1 `inneranimalmedia-business` contained 36 legacy workspace/slash commands, 395 scripts, 262 tools, 100 skills, 86 hooks, 42 hook executions, 44 rules, and 6 workflows. The workflow graphs own 32 nodes, 27 edges, 11 trigger kinds and 1 historical workflow run; all remain unchanged.

**Phase A, additive only**:
- `agentsam_commands_legacy_snapshot_20261123`: persistent exact snapshot of all 36 command rows. A true SQLite TEMP table would disappear between Cloudflare D1 sessions.
- `agentsam_commands_next`: versioned npm/pip source-backed CLI catalog; 93 registered candidates (86 npm + 7 pip), all **inactive and unverified**. `agentsam_commands_published` exposes only verified and active rows.
- `agentsam_skill_next`: 100 preserved account-owned records plus 39 platform-scoped SDK candidates (139 total). The corrected key is scope + package + version + skill **file**, not a unique package/version per skill. 39 SDK candidates all **unpublished and inactive**.
- Existing `agentsam_commands`, `agentsam_skill` and every workflow, hook execution, rule, script and tool record remain available to their current consumers.

**The first-generation broken source candidate roots were removed from new staging only**: six inactive records where `command_key` repeated the executable. Every previous live `agentsam_commands` row is preserved.

## Reproducible source generator

Run from the SDK checkout:

```bash
npm run registry:universal:preview
npm run registry:universal:check
npm run test:registry:universal
```

`scripts/registry/generate-universal.mjs --write` regenerates these committed receipts:

- `protocol/registry/universal-catalog.v1.json`
- `migrations/d1/generated/20261123_portable_cli_seed.sql`
- `migrations/d1/generated/20261123_source_skill_seed.sql`

The generator reads `src/cli/command-catalog.js`, `package.json#bin`, the Python `argparse` tree under `python/agentsam_sdk/cli.py`, `protocol/sam/registry.seed.json`, `skills/catalog.json` + adjacent `agentsam.skill.json` and `SKILL.md`, local hooks, and instructions. It fingerprints the actual source bytes; `npm pack --json` must remain machine-clean. New candidates are disabled. Its `--check` is part of normal SDK `verify:registry`.

The SDK package exposes `./registry/universal-catalog` as **source data**, not a permissioned API or a claim that a particular CLI release is published or runnable.

## Remaining families — no blind import

- **Tools:** the SDK SAM registry currently declares 9 operations; the 262 D1 rows require handler resolution, capability policy and account/plugin authorization before any source identity is promoted.
- **Scripts:** the SDK package declares 7 executable bin entries; the 395 D1 rows are not portable merely because they have a `source_stored` path. Inspect package inclusion, command runner, host capabilities, risks and tenant scope before adoption.
- **Hooks:** portable hook adapters are available, but two hooks in `.agentsam/hooks.json` are explicitly repository-local. They cannot be promoted to platform hooks or run without owner permissions.
- **Rules:** `AGENTSAM.md` documents this repo; it is not a universal user123 policy grant. The 44 D1 rules must retain author/workspace scope and source provenance.
- **Workflows:** `agentsam_workflows` (including nodes, edges, revisions, triggers and runs) remains the versioned graph authority. An active definition is immutable. Source scripts are **not** converted into workflow graphs or activated by scanning.
- **Execution history:** `agentsam_hook_execution` and `agentsam_workflow_runs` are evidence, not definitions; retain their existing identifiers and foreign keys.

`src/registry/universal-reconcile.js` is a read-only parity inspector. It needs a caller-supplied verified account/workspace/user and a trusted D1 binding; it is not an end-user bypass around auth.

## P0 cutover acceptance

1. Verify npm package tarball and pip wheel exact versions and executable flags, independently; document their checksums and update source rows to verified only with separate signed/traceable receipts.
2. Verify each published SDK skill's SKILL.md is included in the exact npm tarball and that slash triggers do not collide; only the packaged subset qualifies for publication.
3. Confirm all old runtime command/slash and skill queries have moved to a compatibility-safe, account-scoped resolver; preserve history, run IDs, approvals and role boundaries.
4. Verify `agentsam_commands_next` command URLs and local CLI paths against actual user123 installs. Only then retire the legacy command table into archival compatibility; never blindly `DROP` or rename while consumers depend on it.
5. Expand handler-proven tools/scripts/hooks/rules **selectively**, with disabled defaults and per-tenant authorization.
6. Verify every live workflow's node/edge/entry references and historical runs, plus idempotent production reconciliation and rollback receipts.
