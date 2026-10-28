# DreamHouse / Projects + measurements sprint — 2026-10-28

Canonical project: projects.id (TEXT); DreamHouse: proj_mrb5shkc_3kos2c.

## Source contracts
- Identity: accounts.id / auth_users. This sprint does not rewrite identity.
- OAuth: user_oauth_tokens is the account-owned provider grant authority. Other Cloudflare connection registries are compatibility metadata, not an alternate login path. The Work project inspector exposes only metadata and never tokens.
- Projects: projects.id. No duplicate agentsam_projects or workspace-scoped substitute.
- Registered resources: project_storage rows owned by canonical project. DreamHouse has four active records (local DreamHouse repo, GitHub, R2 CAD and external drive). A configured record is not automatically an API-verified connection.
- Drawings: project_draws, keyed by project_id; existing 77 DreamHouse drawings are linked to the cad R2 storage record. In Work Gallery they are metadata-backed entries, and authenticated GET /api/work/projects/:id/draws/:drawingId/file serves their private R2 objects. No public R2 URL or bucket key is returned.
- Measured time: time_entries, not chat messages or git commit counts. POST /api/work/projects/:id/timer/start and /stop persist account-owned elapsed sessions, one active session per account and project.
- Costs / token usage: existing project_costs ledger, not estimates or a fake total. Only USD recorded costs are summed. This does not include unattributed Cloudflare or provider costs.
- project_metrics: cached derived project totals for quick access, with real TEXT project_id; the previous 8 legacy rows are preserved in project_metrics_legacy_20261028 and copied only as explicitly unverified legacy estimates. Migration 1349 must precede deploying the new timer API.

## Quality of measurement

A session is counted as measured if it has completed start/end timestamps, reasonable elapsed duration (at most 24 hours per entry) and an allowed manual / work_timer source. Imported/auto entries and long-duration entries are excluded and counted as unverified instead.

Live D1 read-only audit: DreamHouse has 0 linked time entries, 6 cost entries totaling $0.55, 77 project drawings, and 4 storage registrations. The existing time_entries dataset has 1,317 entries with 177 auto entries longer than 24h; summing those as actual human time would inflate results.

The project inspector shows recorded measured hours, recorded attributed USD costs, API tokens from project_costs, timer controls, and project resource connection registration/authorization states.

## Release order

1. Keep current CAD/source trees unchanged, make a DB backup and inspect the 8 legacy project_metrics rows.
2. Apply apps/local-studio/backend/migrations/1349_projects_metrics_time_ssot.sql as an explicitly coordinated migration. It rebuilds project_metrics while preserving all legacy rows, and creates a unique active-timer index. Test on a D1 backup before production.
3. Deploy the compatible Work Worker and frontend together; do not deploy half the API. Ensure CAD_PROJECT_ASSETS binding points to bucket cad.
4. Open /admin/projects/proj_mrb5shkc_3kos2c and check Gallery (registered drawings), inspector (4 resources and recorded $0.55), start/stop timer, reload measured hours, try a forbidden project/drawing request.
5. Verify any Cloudflare OAuth reauthorization from existing connections UI, not via copying credentials out of agentsam_cloudflare_connections. The R2 service binding does not require a personal OAuth row.
6. Future: connect verified agent-run durations, collaborator time and rate/cost classifications with deduplication. No fabricated historical metrics or Supabase column deletion in this sprint.

## Verification

Local SQLite migration, data ownership, duplicate-timer prevention, ledger aggregates, excluded spurious records, 77-drawing-capable list and private R2 proxy tests. Backend suite and Work package pass. No live D1 mutations or production deploy were performed while the broader CAD working tree has unrelated changes.
