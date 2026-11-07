# AgentSam SDK — Finish-Line Release Program

Status: ACTIVE · Source repository: `agentsam-sdk` · Owner: InnerAnimalMedia
Established: 2026-11-06 · Program target: one verified release from `main`

## Purpose and non-negotiable rules

Finish the existing AgentSam SDK / Local Studio platform without parallel products, fixture replacements, silent feature removals, or losing prior agents' work.

1. All implementation agents **read this file before editing** and record findings in the program ledger below.
2. Preserve and disposition every relevant dirty file, old branch, open PR, installed runtime path, and existing table before replacing or deleting it. **WIP = work to finish**, not work to ignore.
3. One code authority per concern: authenticated runtime, registry, credentials, Settings host, Tauri source permissions, release. Views may differ, but they consume shared contracts.
4. Proof must be **authenticated execution on the actual deployed surface**; tests or a successful build alone do not constitute acceptance.
5. Each sprint closes with a merged PR or documented blocker, test commands/results, deployed SHA where relevant, before/after behavior, and remaining open acceptance conditions.
6. No agent silently modifies or expands a user's OAuth/provider grants, user policy, terminal target, or global service bridge privilege merely to get a test green.
7. Keep the platform bridge secret separate from customer-issued service credentials. A connected OAuth account is not the same as an executable tool.
8. Scope work by outcome and independent file ownership. Two concurrent editing lanes maximum, plus one read-only integration/QA lane; no worktree or branch explosion.
9. This program doc is the **coordination source of truth**. Existing D1 `agentsam_tickets` may track execution tasks, and GitHub PRs are immutable code/evidence links. Do not create a competing manual status tracker.
10. Theme Studio, CMS, CAD and unrelated product WIP must remain preserved and have a disposition, but do not absorb their whole feature redesigns into this security/plugin release.

## Evidence-backed baseline (2026-11-06; refresh at every sprint start)

- Local `main` changed during this audit: initial `f0ee1767` was replaced by two commits, `8043d368` (Tauri schema untracking) and `46159572` (Gmail migration 1353); `main` was **two commits ahead of `origin/main`** at the last check. Always refresh `git status -sb && git log origin/main..HEAD --oneline` before working: another agent may be rebasing concurrently.
- Previously modified Tauri schemas are protected at `/Users/samprimeaux/agent-audits/agentsam-sdk-tauri-schemas-20261106` (four files + patch + SHA256SUMS). Source `src-tauri/capabilities/native-events.json` is tracked. Generated schemas are now ignored; verify fresh rebuild.
- Older release worktree: `/Users/samprimeaux/agent-worktrees/sdk-ci-desktop-lockstep-20261105`, with two dirty 2.6.14-to-2.6.13 changes protected at `/Users/samprimeaux/agent-audits/agentsam-sdk-release-worktree-20261106`. Do not merge downgrades blindly.
- Product route worktree contains one commit in open [PR #477](https://github.com/SamPrimeaux/agentsam-sdk/pull/477). Old commerce and widget branches have unique valuable commits; evaluate separately.
- Production D1 `inneranimalmedia-business`: 255 tool records (234 active), 96 capabilities, 81 tools without capability mappings, 181 tool-capability links, 38 profiles. `agentsam_tool_health` has 255 rows but no populated `last_health_check`; `agentsam_tool_stats_compacted` has 0 rows. Tool-call logs, cache, daily health and error records exist.
- Gmail: migration 1353 was manually executed in D1 Studio and 16 Gmail tools now link to the `google_gmail` plugin, **but each tool is a global definition (`account_id IS NULL`)**. Current `listPluginTools` joins `i.account_id=t.account_id`, so it still excludes them. The inspected Gmail installation is `enabled=0` and `health_status=unknown`. Neither is evidence that a Gmail action is runnable.
- Google Drive, Calendar and GitHub have 0 directly linked OAuth-plugin tool rows. Existing global tools and separate provider adapters may already implement actions: inspect before adding rows.
- The Settings package still has simulated credentials, secrets, session and audit panels. The app already has live `LiveKeysSettingsPage`, `MintCredentialModal`, `CredentialsTable`, `ApiKeysTable` and real `/api/vault/credentials` routes. Reconcile mounted routes, don't build a third key manager.
- `apps/local-studio/backend/worker/agentsam-credentials-mint.js` still issues broad hardcoded `DEFAULT_SCOPES` for both account and service credentials. It must not ship unchanged. Customer keys must never pass the privileged `env.AGENTSAM_BRIDGE_KEY` verifier.
- npm latest published: `agentsam-contracts`, `agentsam-loading-scene`, `agentsam-workbench` all 2.6.13; local manifests pin 2.6.14. Publish dependencies before workbench after checks.
- For read-only Wrangler queries from repo root, use `npx wrangler d1 execute inneranimalmedia-business --remote --config apps/local-studio/backend/wrangler.jsonc --command 'SELECT 1;'`. Verified successful. Commands without `--config` were resolving the database name incorrectly.
- Secrets/tokens/hashes are not to be printed in handoffs, test logs, PR descriptions, or screenshots.

## Batch A — Establish the truth (Sprint 01 then 02)

### Sprint 01 — Reconcile release/WIP/migrations/Tauri

Owned areas: release scripts, Tauri build input/packaging, repo hygiene, migrations.

Deliver:
- Audit all active worktrees/branches/PRs, list unique commits and dirty changes, and merge/revise/close them **individually with explicit disposition**.
- Validate `f0ee1767`: ensure ignoring `gen/schemas` preserves fresh-clone Tauri schema generation and native-event permissions in development and macOS bundle.
- Validate migration 1353 against actual schema and idempotent reapplication. Reconcile that prod was manually patched; verify migrations ledger/pipeline. Do not apply ad-hoc repeat UPDATE.
- Resolve Wrangler config selection in scripts and diagnostics (right account + DB UUID), not by broadening a user's permissions.
- Determine 2.6.14 release dependency order and isolate the dirty version downgrades. No blind `git add -A` or auto-merge of an old worktree.

Accept: fresh checkout builds Tauri permissions; the migration runner is safe and deterministic; clean/explicit branch disposition with all WIP traceable; release blockers have evidence.

### Sprint 02 — Dynamic plugin/tool/capability projection and execution

Owned areas: `src/plugins/registry.js`, `apps/local-studio/backend/worker/plugin-registry.js`, `connections-registry.js`, capability resolver and runtime dispatcher.

Deliver:
- Reconcile global tool definitions (`account_id IS NULL`) with installed, account-scoped plugins **without duplicating the global rows per tenant**; enforce tenancy at execution.
- Separate states: discovered, installed, connected, enabled, authorized, healthy, executable. Make `tool_count` count the relevant executable installation capabilities rather than arbitrary cross-account rows.
- Preserve `agentsam_capabilities` + `agentsam_tool_capabilities` as semantic vocabulary. Review 81 unmapped tools: assign valid mappings where supported, otherwise report explicitly; never fabricate handlers or metadata.
- Profiles (including `max_tools` and `default_deny_oauth`) should govern model-facing selection or deliberate policy, not accidentally redefine account privileges. Document intent and test.
- Prove one read-only Gmail operation in a test account with the connector explicitly enabled; then Google Drive, Calendar, GitHub and Cloudflare where actually authorized. Do not auto-enable deliberately disabled installations or assume broad OAuth scopes.

Accept: provider → grant → installation → tools → authorization → dispatcher → real result → logged evidence, with both positive and negative account isolation tests. Settings and composer share the same derived readiness semantics.

## Batch B — Authorize real customers (Sprints 03 and 04 can run in parallel after Sprint 02 contracts stabilize)

### Sprint 03 — Account/service credential authorization

Owned areas: credential minting, SDK auth verification, key management methods and tests.

Deliver:
- Remove `DEFAULT_SCOPES` as a static credential authority. Mint choices from the capability registry and effective account/resource permissions. Client `scopes_json` must be validated; unknown capabilities fail closed.
- A logged-in delegated account key may explicitly inherit that account's **current effective permissions**, bounded at use time by resource grants and policy. A service key must use explicit constrained authority. Never interpret model-tool selection limits as credential scopes.
- Verify the existing IAM CLI `/api/sdk/api-keys` pathway alongside Local Studio `/api/vault/credentials`; prevent user-issued `brk_*` from impersonating the privileged environment bridge.
- Finish account-scoped create/list/show-once/revoke/rotate, correct expiry handling, resource subjects, scope selection, auditing and immediate revoked-key rejection. Cover cross-account attempts, malformed scopes, stale grants and migration of legacy credentials.
- CI guard against any fixed broad *mint default list*. Do not ban all valid operation identifiers from route schemas, terminal contracts, or registry seeds.

Accept: customer A's own key works on A's allowed resources, fails on B's; a scoped Worker service key cannot inherit the platform bridge; no hardcoded broad issuance defaults.

### Sprint 04 — OAuth lifecycle and provider readiness

Owned areas: `connector-oauth.js`, Google desktop PKCE, native provider handoff, OAuth grants, refresh and provider adapters.

Deliver:
- Finish real Google, GitHub and Cloudflare account linking, refresh, disconnect and reconnect on web and Tauri; distinguish identity login from a user-authorized provider resource connection.
- Audit `GOOGLE_AGENT_DESKTOP_CLIENT_ID/SECRET` against the existing `GOOGLE_DESKTOP_CLIENT_ID` path: verify exact use, redirect, PKCE, token and resource audiences. Do not assume a new client ID is wired because Wrangler contains it.
- Reconcile Gmail MCP endpoint/consent, required granted scopes, installation projection and error handling without weakening real provider authorization.
- Replace silent failed installation upserts with attributable error codes and safe logs, preserving credentials and user-visible recovery.

Accept: actual consent → authenticated token → installed capability → working read-only tool → refresh/health/clear errors; revoked or missing grants cannot execute.

## Batch C — Finish the product and ship (Sprint 05 then integrated Sprint 06)

### Sprint 05 — Real Settings, side-stage and observability

Owned areas: Settings contract/host/UI, plugin composer + side-stage, usage/health pipelines.

Deliver:
- Reuse live key/secret components, remove second demo-producing Keys UI. Wire Sessions, Usage, Codebase, Widgets and audit where authority exists; otherwise honest empty or unavailable states. No fabricated credentials, events, limits or usage numbers.
- Unify Settings, composer and side-stage plugin readiness. Retain existing dynamic plugin discovery and polished states rather than replacing with static fixtures or popups.
- Connect tool call results to `agentsam_tool_call_log`, `agentsam_tool_health`, `agentsam_tool_stats_compacted` and error reporting (including surface/theme-save failures). Verify actual timed probes and stats materialization before labeling healthy.
- Keep theme presets/preview/covers and broader CMS editor issues in a distinct tracked follow-on unless directly regressed by this change.

Accept: account-owned state is accurate on web and desktop; real create/revoke/enable/run actions work, retries recover, health and usage match actual records.

### Sprint 06 — Publish, deploy and acceptance

Owned areas: release lockstep, test matrices, release deployment.

Deliver:
- Publish `@inneranimalmedia/agentsam-contracts@2.6.14`, then `agentsam-loading-scene@2.6.14`, then `agentsam-workbench@2.6.14` after build/pack and registry/permission checks. Verify actual dependency graph first.
- Fresh `npm ci`, CI status, Tauri fresh install/build, Workers route smoke, matched source/deployed SHA, D1 migration runner status, installer/desktop PKCE, live user123-like tenant and operator smoke.
- Include negative security tests, tool call history, user-owned keys and an OAuth provider refresh/reconnect test.
- Publish release receipts and record all remaining non-blocking items as explicit follow-up tickets, not uncommitted or forgotten WIP.

Accept: packages are retrievable from npm at matching versions; main is deployed; authenticated capabilities work on real endpoints; failures have clear recovery; receipts contain exact SHA, tests and verifiable links.

## Coordination / anti-drift protocol

- One program owner accepts cross-sprint contracts and merges. Maximum two editing agents on non-overlapping file sets; third agent may run read-only tests and produce findings. An agent must not create another lane/worktree without registering it here.
- Every active task has: owner, scope/files, base SHA, dependency, test plan, PR, acceptance status, regression proof and WIP disposition.
- No sprint may claim completion from `npm run build` alone. At least one real authenticated execution and at least one denied unauthorized execution where relevant.
- Merge small verified vertical slices into current `main`, rebase pending branches promptly, stop creating dormant branches. Report dirty files by reason, not as 'irrelevant'.
- Changes to schemas or D1 require migration file + repeatable migration test + the production-state reconciliation record. Never drop 'redundant' tables/columns until all their readers/writers and migrations are inventoried.
- Each implementation agent's final comment follows:
  1. **Accepted outcomes** (feature + proof)
  2. **Code and data changes** (paths/PR/commit/migration)
  3. **Verified environments** (web/Tauri/D1/npm)
  4. **Unaccepted outcomes and cause**
  5. **Exact next task** (owner, files, blockers; no duplicate rebuild)
- Start of any new chat: paste **'Continue AgentSam SDK finish-line program from docs/plans/AGENTSAM_SDK_RELEASE_PROGRAM.md; inspect main and WIP; take the next unaccepted gate, do not redesign.'** Attach the latest PR/test receipts. This file, not the chat, remains authoritative.

## Current program ledger (update after every accepted PR)

| Sprint | State | Evidence | Next owner/action |
| --- | --- | --- | --- |
| 01 Release foundations | LOCAL LAUNCH ACCEPTED · PUBLIC RELEASE BLOCKED | See [source + npm launch receipt](../acceptance/AGENTSAM_SDK_LOCAL_LAUNCH_2026-11-06.md): native Tauri executable ran; build/desktop/auth/test gates pass; six D1 migrations are tracked and current; PR #477/#479 merged; obsolete worktrees pruned; merch tests graduated. | npm registry has 2.6.13 only; npm auth E401 prevents 2.6.14 publication; signed installer and clean external npm install remain unverified. Intentional widget and eight stash WIP assigned to app-specific acceptance. |
| 02 Tool/capability runtime | PARTIAL · PROJECTION MERGED | PR #479 fixed shared tool definitions through account installations and mismatched runtime context; SQLite tests pass; Gmail has 16 linked tools, intentionally disabled for this account. | Prove real authorized provider execution; 81 unmapped tools and other provider associations remain to reconcile. |
| 03 Customer keys | QUEUED | Existing mint/revoke + hardcoded `DEFAULT_SCOPES` identified | Replace issuance policy after capability contract |
| 04 OAuth | QUEUED | Existing native PKCE, OAuth token/grant tables and worker paths | Provider lifecycle acceptance |
| 05 Settings/telemetry | WIP GRADUATION IN PROGRESS | [Widget utility acceptance](../acceptance/AGENTSAM_WIDGET_UTILITIES_2026-11-06.md): native Clock/Calculator now packaged in Workbench; Settings uses real controls, Utilities route mounts, isolated tarball consumer and Chrome interactions passed. | Other Settings fixtures/telemetry remain; graduate donor approvals/metrics only with real account-owned adapters; 18 widget concepts still preview-only. |
| 06 Release | LOCAL DEV PASS · PUBLIC PUBLISH BLOCKED | `npm run launch` started Tauri desktop binary; `launch:check` passed. CI `ETARGET` cannot fetch unissued workbench@2.6.14; local `npm whoami` E401. | Restore authenticated npm publishing, publish dependency-ordered 2.6.14 train, verify clean external consumer, installer signing, live deployment and remaining product security gates. |

## Launch line for next agent

> Read `docs/plans/AGENTSAM_SDK_RELEASE_PROGRAM.md`. Work only in the scoped sprint; inspect actual main, relevant worktrees and existing implementation before touching files. Do not hide broken flows, use fixtures, grant more privileges, or close WIP without disposition. Ship one vertical slice with tests and precise acceptance evidence, update the program ledger, and hand off the next unaccepted gate.
