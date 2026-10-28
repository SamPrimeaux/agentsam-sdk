# AgentSam Account-First Authority and Real Metrics V2

## Authority — one account, optional contexts
- Authenticate user, then resolve the canonical `account_id`/`auth_user_id` from the identity/session provider. Never take ownership from URL/body/workspace.
- A project is an optional grouping of resources (`project_id`) that must pass an account-owned resource lookup.
- A workspace is optional **execution/collaboration context**, not an ownership requirement or provisioning prerequisite. Use ephemeral isolation for separate agent lanes.
- Account-first contract: `packages/agentsam-contracts/src/resource-scope.ts` (`agentsam.resource-scope.v2`).
- Spawn policy is a separate, host-enforced authority in `agentsam.spawn-policy.v2`. Production host must resolve account budgets explicitly and validate any optional workspace override. No fallback from another user's workspace, profile default, or arbitrary caller string.

## Actual D1 tables, not invented aggregates
- `agentsam_tool_call_log`: canonical per-tool execution receipts. Indexed by `(account_id, created_at_unix)` via `idx_tool_call_account_time`. `tool_key`, `status`, `duration_ms`, `cache_hit`, `cost_usd`, `agent_run_id`, `conversation_id` provide truthful measurements.
- `agentsam_tool_stats_compacted`: intended derived per-tool/day read model, **empty during the 2026-10-28 audit**; do not drive charts from it until the compactor is implemented and reconciled.
- `agentsam_analytics`: separate normalized event stream, one row in audit; cannot be substituted for the canonical tool execution ledger.
- `agentsam_usage_rollups_daily`: 259 populated rows at audit, source coverage must be documented before merging with tool logs; prevent double counting.
- `agentsam_agent_run`: three runs at audit; separately recorded usage; do not infer that three runs equals all account activity.
- `projects`: existing project authority currently populated (39 records at audit); scope access by owner, not a requested workspace.
- `agentsam_projects`: 0 rows at audit. Treat as an optional projection requiring explicit reconciliation, not an empty authoritative replacement.
- D1 stores indexed structured measurements, revision links and job state; R2 stores binaries and immutable artifacts. Local SQLite caches are never the hosted authority.

## Implemented API & UI
- `GET /api/analytics/tool-usage?range=24h|7d|30d|90d|YTD|All` authenticates the account session, binds `account_id` to SQL, and returns `agentsam.tool-usage.v2`.
- No `account_id`, `workspace_id`, or owner override accepted from query/body. Bridge-only clients without verified account identity are denied on this endpoint.
- The packaged `agentsam-analytics` Tools tab defaults to canonical event metrics. Missing coverage/cost is not imputed.
- Compatibility tests verify tool aggregation input contract, account binding, read-model coverage and null-safe zero rates.

## Release blockers and follow-on migration
1. Existing legacy `/api/analytics/overview|usage|performance|health|scores` queries still read `agentsam_analytics` without account filters. They must be migrated and tested before production exposure across multiple accounts. Do not regard them as account-safe merely because the new tool endpoint is scoped.
2. Integrate actual hosted spawn policy with the account-first contract and authenticated optional workspace membership; account-default policy has null spending caps and spawning disabled while the `ws_inneranimalmedia` policy has $5/$2 caps and spawning enabled. Do not change account-wide authorization implicitly.
3. Implement event-to-rollup reconciliation and measured cost attribution, with daily/account/tool grain and duplicate prevention. Compare compacted statistics against canonical log counts.
4. Reconcile `projects` and `agentsam_projects` identities without creating duplicate project rows. Add project/job/artifact outcome KPIs from their actual D1 sources and versioned R2 receipts.
5. Verify login, account isolation, metrics UI and per-surface parity in a real browser. No hosted merge/deploy yet.

## Current local package revisions
- `@inneranimalmedia/agentsam-contracts` 2.6.15 — resource-scope.v2 and spawn-policy.v2 contracts.
- `@inneranimalmedia/agentsam-analytics` 2.6.14 — account-scoped Tools read model and UI.
- `@inneranimalmedia/agentsam-local-studio` 2.6.14 — account-authenticated Tools API host and packaged shell.

The source worktree contains unrelated staged work. Commit only reviewed scoped files after UI/host acceptance. Never bulk-stage.
