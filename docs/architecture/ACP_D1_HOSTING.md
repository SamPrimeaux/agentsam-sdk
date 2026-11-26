# AgentSam ACP: canonical D1 hosting

## Authority

The hosted AgentSam control plane uses the existing `inneranimalmedia-business`
D1 database. It does not create a second production database and does not depend
on a developer's project-local SQLite file.

- `agentsam_agent_run` is the canonical run row.
- `agentsam_agent_run_event` is the append-only lifecycle journal.
- `agentsam_agent_run_suspension` projects durable waiting state.
- `agentsam_agent_run_dependency` links parent and child runs.
- `agentsam_queue_job` stores lease-aware, idempotent Queue Control jobs.
- `agentsam_usage_events` remains the model/provider usage ledger.
- `agentsam_analytics` stores analytical facts and forwards them to
  `AGENTSAM_ACTIVITY` for Basin.

The `agentsam_request_queue` table is a separate legacy request inbox. Its
completed request rows do not provide Queue Control's lease, retry, physical
queue, and idempotency semantics, so ACP does not silently reuse it.

## Timeout contract

A timeout is persisted as:

1. `agentsam_agent_run.status = 'failed'`, preserving the existing storage
   CHECK constraint.
2. One deduplicated `run.timed_out` row in
   `agentsam_agent_run_event`. The public ACP projection reports
   `status = 'timed_out'` and `storageStatus = 'failed'`.
3. One deduplicated `agentsam_analytics` fact with
   `domain = 'agent_run'`, `operation = 'timeout'`, and
   `outcome = 'timed_out'`. The existing Basin pipeline receives the same fact.

The run's `event_seq` cursor is incremented atomically with
`UPDATE ... RETURNING`; the unique `(run_id, seq)` and dedupe indexes protect
the event journal from duplicate appends.

## Authentication and tenancy

The Local Studio Worker resolves the account from the authenticated browser
session or the existing AgentSam CLI bearer-token authority. The client cannot
choose `account_id` in its request body. Run reads, event reads, tree reads,
spawn, cancel, and timeout are all scoped to that verified account.

## Local SQLite

The packaged SQLite migrations are an explicit local development/test adapter.
They include the same ACP journal, suspension, dependency, queue-job, and event
sequence tables so tests exercise the same contracts. They are not a production
source of truth, and `agentsam run` no longer silently falls back to a local
database when no hosted URL is configured.

Other shared platform tables—approvals, error log, escalations, memory, plugins,
tools, widgets, workflows, and usage integrity—remain owned by D1 and their
existing services. They should not be copied into the ACP's project-local test
database merely to make a local runtime appear complete.
