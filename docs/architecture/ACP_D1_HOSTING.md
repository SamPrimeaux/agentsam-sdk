# AgentSam ACP: canonical D1 hosting

## Authority

The hosted AgentSam control plane uses the existing shared D1 database. It
does not create a second production database and does not depend on a
developer's project-local SQLite file or an InnerAnimalMedia API.

- \`agentsam_agent_run\` is the canonical run row. \`parent_run_id\` is the
  authoritative parent/child relationship.
- \`agentsam_spawn_job\` records one spawn orchestration, its initiator,
  chunking/merge policy, approval state, child counters, and aggregate usage.
- \`agentsam_agent_run_event\` is the append-only lifecycle journal. A child
  run's \`run.created\` evidence records its \`spawn_job_id\`, allowing child
  completion to reconcile the owning spawn job without a second dependency
  table.
- \`agentsam_approval_queue\` is the durable approval request and decision
  record. It carries the owning run, tool/step references, sanitized input,
  risk, expiry, authenticated decision actor, and decision response.
- \`agentsam_queue_job\` stores lease-aware, idempotent dispatch and resume jobs.
  Child queue jobs reference the child through \`source_run_id\` and carry the
  owning \`spawn_job_id\` in their payload.
- \`agentsam_usage_events\` remains the model/provider usage ledger.
- \`agentsam_analytics\` stores analytical facts and forwards them to
  \`AGENTSAM_ACTIVITY\` for Basin.

ACP does not read or write \`agentsam_agent_run_suspension\` or
\`agentsam_agent_run_dependency\`. Waiting states are projections:
\`waiting_child\` is derived from active rows whose \`parent_run_id\` references
the run; \`awaiting_approval\` is derived from pending, unexpired rows in
\`agentsam_approval_queue\`. The storage CHECK constraint remains unchanged.

The \`agentsam_request_queue\` table remains the existing stop-hook retry and
background-drain queue consumed by the platform cron maintenance path. Its
session/position-based retry semantics are separate; do not repurpose it.
Generic ACP Queue Control uses \`agentsam_queue_job\` because it needs
account-scoped idempotency, physical and logical queues, leases, attempts, and
lease generations.

## Parent/child spawn contract

A spawn operation:

1. Inserts an \`agentsam_spawn_job\` row with \`master_run_id\` set to the parent.
2. If approval is required, inserts a pending \`agentsam_approval_queue\` row
   with \`approval_type = 'spawn'\`; no child is created before approval.
3. Once approved (or when approval is not required), inserts each child into
   \`agentsam_agent_run\` with \`parent_run_id\` set to the parent.
4. Appends a child \`run.created\` event whose evidence contains the spawn job
   ID, and enqueues an \`agent.run\` row in \`agentsam_queue_job\`.
5. On child terminal events, aggregates child counts, token/cost/latency totals,
   and status back into \`agentsam_spawn_job\`. The parent is queued for resume
   only after all active children and pending approvals have cleared.

Public routing uses \`automatic\`; the production \`selected_by\` column stores
\`thompson\` as the automatic-selection implementation/provenance. The ACP
projection maps that storage value back to \`automatic\`.

## Approval contract

\`POST /v1/approvals\` creates a durable pending request. \`GET /v1/approvals\`
and \`GET /v1/approvals/:id\` read account-scoped records.
\`POST /v1/approvals/:id/decision\` records \`approved\` or \`denied\`, the
authenticated actor, decision time, and response JSON. Expired requests become
\`expired\`; they cannot be approved afterward.

Approval decisions wake the owning run through an idempotent
\`agent.resume\` Queue Control job once no other approval or child work remains.
An approved spawn instead creates and queues its children; the parent remains
waiting on those children.

## Timeout contract

A timeout is persisted as:

1. \`agentsam_agent_run.status = 'failed'\`, preserving the existing storage
   CHECK constraint.
2. One deduplicated \`run.timed_out\` row in
   \`agentsam_agent_run_event\`. The public ACP projection reports
   \`status = 'timed_out'\` and \`storageStatus = 'failed'\`.
3. One deduplicated \`agentsam_analytics\` fact with
   \`domain = 'agent_run'\`, \`operation = 'timeout'\`, and
   \`outcome = 'timed_out'\`. The existing Basin pipeline receives the same fact.

The run's \`event_seq\` cursor is incremented atomically with
\`UPDATE ... RETURNING\`; the unique \`(run_id, seq)\` and dedupe indexes protect
the event journal from duplicate appends.

## Authentication and tenancy

The Local Studio Worker resolves the account from the authenticated browser
session or the existing AgentSam CLI bearer-token authority. The client cannot
choose \`account_id\` in its request body. Run reads, event reads, tree reads,
spawn, cancel, timeout, and approval operations are scoped to that verified
account. Approval decisions use the authenticated session user as
\`approved_by\`, not a caller-supplied actor.

## Local SQLite

The packaged SQLite migrations are an explicit local development/test adapter.
They retain historical migration compatibility, but the current ACP code path
uses the canonical run, spawn-job, approval, event, and queue contracts. The
strict production-schema fixture tests those contracts without the extra local
columns or legacy suspension/dependency tables. Local SQLite is not a
production source of truth, and \`agentsam run\` no longer silently falls back
to a local database when no hosted URL is configured.

This implementation persists root/child runs, spawn orchestration, approval
decisions, queue dispatch records, and parent reconciliation. It does not claim
that queued work has executed: a production consumer that claims
\`agentsam_queue_job\`, invokes the agent executor, acknowledges the job, and
reconciles the result remains a separate runtime integration. Queue creation
and child persistence are not represented as successful execution.
