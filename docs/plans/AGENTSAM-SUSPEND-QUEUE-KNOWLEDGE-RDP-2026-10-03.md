# AgentSam Suspend / Queue / Knowledge Runtime RDP

**Date:** 2026-10-03
**Branch:** feat/agent-control-plane
**Status:** Proposed implementation contract
**Scope:** AgentSam SDK/CLI, Local Studio, hosted AgentSam, local/enrolled runtimes, Queue Control, WorkGraph, GOAP, knowledge/AutoRAG/indexing/vectorization.

## 1. Problem

AgentSam already has real pieces that should reinforce each other:

- durable agentsam_agent_run records, including parent_run_id, multitask mode, status, cancellation, model/tool usage, token/cost fields, plan/todo references;
- agentsam.activity.v1 for live run activity;
- Queue Control with logical queues, retry policy and exponential backoff;
- WorkGraph and GOAP;
- runtime protocol and local/remote/sandbox lanes;
- Local Studio lead/co-worker presentation and task-aware loading scenes;
- repository indexing, Merkle evidence, AST/lexical retrieval, optional embeddings;
- @inneranimalmedia/agentsam-knowledge AutoRAG discovery/configuration/providers/backends/probes;
- local SQLite knowledge plus optional pgvector/Supabase/Cloudflare Vectorize backends.

What is missing is one portable lifecycle for doing work, yielding while nothing useful can happen, waking cheaply, reusing accumulated knowledge, and proving what happened.

The failure mode to avoid is an LLM turn staying alive merely to poll an API, watch a queue, wait for indexing, wait for deployment, or periodically ask whether an external condition changed.

## 2. Core principle

**Models decide; deterministic machinery waits.**

A model may inspect retrieved context, choose/plan an action, request tools or child runs, decide a wake condition, and then yield.

After yield, the run is durable. A queue consumer, webhook, scheduler, runtime event, approval, filesystem event, child-run completion, or deterministic poller wakes the run.

No model tokens are spent during the wait.

## 3. System boundary

AgentSam is the portable harness. agentsam-go-worker is one hosted AgentSam implementation, not the universal authority.

~~~text
CLI / SDK / Local Studio
        |
        v
portable run/control contract
        |
        +---- local --------> agentsamd / native machine
        +---- hosted -------> agentsam-go-worker
        +---- remote -------> enrolled device / VM
        +---- sandbox ------> container runtime
        |
        v
agentsam.runtime.v1
~~~

The same control contract must work for interactive agent work, child AgentSam runs, repository indexing, knowledge ingestion, embedding/vectorization, package verification, deploy/infra workflows, CAD, CMS/commerce, webhooks, and background maintenance.

## 4. Run lifecycle

Extend the portable run vocabulary so a run may be inactive without being terminal.

~~~text
queued
running
waiting_external
waiting_child
awaiting_input
awaiting_approval
sleeping
retry_scheduled
completed
failed
cancelled
timed_out
~~~

Terminal states are only completed, failed, cancelled, and timed_out.

A waiting run has zero model activity unless a wake event transitions it back to queued/running.

### 4.1 Suspension record

~~~ts
interface AgentRunSuspension {
  runId: string;
  reason:
    | "external"
    | "child_run"
    | "approval"
    | "input"
    | "retry"
    | "scheduled"
    | "rate_limit";
  wakeAt?: number;
  wakeEvent?: string;
  dependencyRunIds?: string[];
  attempt?: number;
  resumeStepId?: string;
  checkpointRef?: string;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}
~~~

This is not a serialized model process. It is deterministic state describing why the run stopped and what makes it runnable again.

## 5. Wait mechanisms

Use the cheapest mechanism appropriate to the condition.

### 5.1 Event wake

Preferred whenever an external system can signal completion.

Examples: child run completed, queue job acknowledged, deployment webhook arrived, object created, approval submitted, user replied, terminal job finished, indexing generation published.

~~~text
run requests work
    |
    v
persist suspension + checkpoint
    |
    v
end model turn
    |
external event
    |
    v
append run event
    |
    v
transition run -> queued
    |
    v
resume only when scheduler dispatches it
~~~

### 5.2 Delayed queue wake

Use for bounded retry/rate-limit/backoff windows.

Portable queue contract:

~~~ts
enqueue(job, {
  availableAt,
  retry: {
    maxAttempts,
    backoff: "exponential",
    baseDelayMs,
    maxDelayMs,
    jitter: true
  }
});
~~~

Adapters project this to Cloudflare Queues, local SQLite jobs, Postgres, etc.

### 5.3 Scheduled wake

For long waits, recurring maintenance, or time-based jobs persist:

~~~text
wake_at
run_id
reason
dedupe_key
~~~

A cheap scheduler scans due rows and enqueues them.

The scheduler never calls a model merely because a row exists. It only marks/enqueues runnable work.

### 5.4 Deterministic polling job

Some providers expose no webhook/event. In that case create a poller job, not an agent loop.

~~~text
deploy requested
    |
    v
run sleeps
    |
    v
deployment.poll job
    |
provider status API
    |
    +-- pending -> retry(delay=backoff)
    |
    +-- complete -> emit deployment.completed -> wake run
    |
    +-- failed -> emit deployment.failed -> wake/fail run
~~~

Pollers must be deterministic, no-LLM, idempotent, bounded, backoff+jitter aware, circuit-breaker aware, and able to terminate into DLQ/manual intervention.

## 6. Timeout hierarchy

Do not use one global timeout.

~~~text
model_call_timeout
tool_call_timeout
step_timeout
lease_timeout
external_wait_timeout
run_deadline
idle_retention_ttl
~~~

Semantics:

- model call: fail/retry model transport only;
- tool call: bound one invocation;
- step: bound one logical WorkGraph/GOAP action;
- lease: detect crashed consumers without failing the logical run;
- external wait: cap unresolved dependencies;
- run deadline: user/policy budget for the whole objective;
- retention TTL: cleanup after terminal completion.

Timeouts produce typed events and receipts. They should never silently disappear.

## 7. Queue topology

Keep logical queues portable and extend current Queue Control rather than replacing it.

~~~text
interactive
agent_runs
indexing
knowledge
embeddings
batch_ai
deployments
cad
cms
webhooks
maintenance
dlq
~~~

Queue policy should own priority, max concurrency, batching, retry class, provider/rate-limit budget, dead-letter destination, dedupe/idempotency key, and cost class.

## 8. Lease and idempotency

Every background job needs an execution identity.

~~~text
job_id
run_id
step_id
attempt
idempotency_key
lease_owner
lease_expires_at
~~~

Rules:

1. Claim/lease before side effects.
2. Refresh lease only while deterministic work is actually running.
3. Lease expiry permits another worker to retry after a crash.
4. Side-effecting providers receive an idempotency key when supported.
5. Result publication is compare-and-swap / generation based.
6. Duplicate delivery must not duplicate artifacts, embeddings, deployments, or child runs.

## 9. Knowledge must become an execution advantage

The knowledge work already proves incremental indexing and retained generations, but its payoff is too separate from the normal AgentSam run.

Desired loop:

~~~text
repository changed
      |
      v
cheap Merkle diff
      |
      +---- no relevant change ------> reuse existing generation
      |
      v
index changed material only
      |
      v
structural + lexical knowledge
      |
 optional semantic lane
      |
      v
publish immutable generation
      |
      v
run retrieval
      |
      v
smaller / better model context
      |
      v
run creates new verified evidence
      |
      v
incremental knowledge update
~~~

### 9.1 Retrieval before model calls

Before a model receives a repository task, run a bounded deterministic retrieval stage.

Input:

~~~text
task text
repository id
current revision / Merkle root
working paths if known
run/plan context
~~~

Retrieval order:

1. exact/path/symbol evidence;
2. WorkGraph/repository contracts/dependency evidence;
3. lexical chunks;
4. semantic retrieval only if configured and useful;
5. related repository/company routing only when intent requires it.

Return a bounded evidence packet with provenance.

This packet should feed lead agent, co-worker child runs, GOAP evaluators, package/deploy workflows, and browser/build flows.

### 9.2 Retrieval receipt

~~~ts
interface KnowledgeRetrievalReceipt {
  repositoryId: string;
  generationId: string;
  merkleRoot?: string;
  query: string;
  lanes: string[];
  candidates: number;
  selected: number;
  bytesInjected: number;
  providerCallsAvoided?: number;
  embeddingCalls: number;
  cacheHits: number;
  evidenceRefs: string[];
}
~~~

Do not claim token/cost savings unless measured. Start by measuring bytes/chunks/cache hits and whether the model needed fallback search.

### 9.3 Write-back after useful work

Do not embed every chat response.

Write back durable evidence when it has a useful source:

- changed files;
- verified build/test receipt;
- package contract;
- migration;
- deployment receipt;
- approved decision;
- generated artifact;
- code symbol/AST changes;
- user-authored durable project note.

Then queue incremental indexing.

## 10. AutoRAG role

@inneranimalmedia/agentsam-knowledge remains the portable knowledge orchestration/configuration layer, not a second indexer.

Current behavior is already pointed in the right direction:

- local SQLite by default;
- structural/lexical first;
- semantic opt-in;
- bounded probe;
- backend registry;
- provider registry;
- repository-specific lanes;
- no credentials in project config.

The next step is connecting it to run execution.

### 10.1 AutoRAG preflight

A run requiring repository knowledge asks:

~~~text
knowledge.resolve(repository, task)
~~~

Resolver checks:

1. active generation exists;
2. Merkle/profile freshness;
3. requested lane availability;
4. exact/structural retrieval sufficiency;
5. semantic retrieval configuration;
6. semantic index freshness;
7. run budget for paid semantic work.

Outcomes:

~~~text
READY
STALE_BUT_USABLE
INDEX_REQUIRED
SEMANTIC_OPTIONAL
SEMANTIC_REQUIRED
UNAVAILABLE
~~~

### 10.2 Indexing should not block an LLM

If INDEX_REQUIRED:

~~~text
parent run
   |
   +-- enqueue repository.index
   |
   +-- suspend(waiting_child)
~~~

Indexing operates without a model where possible.

On generation publication:

~~~text
repository.index completed
   |
   v
knowledge.generation.published event
   |
   v
wake parent run
   |
   v
retrieve
   |
   v
model reasoning resumes
~~~

### 10.3 Embeddings/vectorization

Embedding is its own queue because it has separate batching economics, rate limits, dimensions/model compatibility, and cache semantics.

Use content-addressed embedding cache keys:

~~~text
provider
model
dimensions
normalized_content_hash
profile/lane
~~~

No-change reruns should make zero embedding calls. Changed chunks enqueue only changed content.

Provider 429/5xx becomes delayed exponential retry. The parent indexing generation does not need an LLM waiting for that retry.

## 11. Cloudflare AutoRAG integration

Cloudflare AutoRAG can be one backend/provider integration, not the universal knowledge architecture.

Use it when a project deliberately chooses a managed R2/Vectorize pipeline.

Portable AgentSam still owns repository identity, run identity, evidence/provenance, freshness expectations, routing, receipts, and fallbacks.

Cloudflare AutoRAG may own managed document sync, chunking/index maintenance, embeddings, Vectorize storage, and retrieval/query execution.

## 12. Cost-aware reasoning lifecycle

~~~text
RECEIVE
  |
  v
DETERMINISTIC PREP
  inspect state
  retrieve knowledge
  resolve capabilities
  calculate plan evidence
  |
  v
MODEL REASON
  only if a decision/generation is needed
  |
  v
DISPATCH
  tools / child runs / queue jobs
  |
  v
YIELD
  persist checkpoint + wake condition
  model turn ends
  |
  v
WAIT FOR EVENT
  zero model tokens
  |
  v
RESUME
  deterministic state refresh
  bounded retrieval
  model only if a new decision is needed
~~~

A completion event should not automatically trigger another model call. If deterministic machinery can continue the plan safely, continue deterministically.

## 13. GOAP / WorkGraph relationship

GOAP actions should support explicit wait semantics.

~~~ts
{
  id: "repository.index",
  cost: 2,
  effects: ["knowledge.index.fresh"],
  execution: "queue",
  waitFor: "knowledge.generation.published"
}
~~~

The planner is not kept resident while the action runs.

WorkGraph records dependencies. Queue Control dispatches only runnable nodes.

## 14. Child agents / co-workers

Child agents use the same mechanics.

~~~text
lead run
  |
  +-- child run: research
  +-- child run: verify
  |
  +-- lead may continue independent work
  |
  +-- if blocked on children -> waiting_child
~~~

Completion emits events; no lead-model polling.

Local Studio can subscribe to each child run's agentsam.activity.v1 projection and drive the scene/status/progress already built.

## 15. Progress

Metric points come from plan/run state, not elapsed time.

~~~text
completed known points / total known points
~~~

Sources include WorkGraph node weights, GOAP action costs, known verification gates, queue job steps, and provider-reported progress.

Expose basis = plan-points | phase-points | steps | provider | unknown.

## 16. CLI product surface

Initial generic run family:

~~~text
agentsam run start
agentsam run get <id>
agentsam run watch <id>
agentsam run tree <id>
agentsam run cancel <id>
agentsam run events <id>
agentsam run artifacts <id>
agentsam run receipt <id>
~~~

Knowledge payoff surface:

~~~text
agentsam knowledge status
agentsam knowledge freshness
agentsam knowledge retrieval "<question>"
agentsam knowledge generations
agentsam knowledge receipt <run-id>
~~~

Existing commands such as index, autorag, go, package, and machine stay as friendly domain commands and may compile into the same run machinery.

run watch is a client-side event observer. It never keeps a model active.

## 17. Hosted AgentSam endpoints

A hosted implementation may expose:

~~~text
POST /v1/runs
GET  /v1/runs/:id
POST /v1/runs/:id/cancel

POST /v1/runs/:id/spawn
GET  /v1/runs/:id/children

POST /v1/runs/:id/handoff
POST /v1/runs/:id/approve

GET  /v1/runs/:id/events
GET  /v1/runs/:id/artifacts
GET  /v1/runs/:id/receipt
~~~

These routes adapt the portable control contract; they do not define AgentSam itself.

## 18. Storage additions

Prefer extending current run authority rather than creating duplicate state.

### Run suspension

~~~text
run_id
state
reason
wake_at
wake_event
resume_step_id
checkpoint_ref
expires_at
attempt
metadata_json
~~~

### Run event journal

Append-only:

~~~text
event_id
run_id
parent_run_id
seq
event_type
phase
label
detail
progress_current
progress_total
source_kind
source_name
evidence_json
created_at
~~~

This journal can project to agentsam.activity.v1.

### Dependency edge

Use WorkGraph authority if it already owns the relation; otherwise minimally:

~~~text
parent_run_id
child_run_id
relationship
required
status
~~~

## 19. Retry classes

~~~text
TRANSIENT
  network timeout
  429
  provider 5xx
  temporary runtime unavailable

WAIT
  approval
  user input
  external job pending

REPLAN
  deterministic precondition failure
  changed repository state
  unavailable capability with alternate lane

TERMINAL
  invalid request
  permission denied
  unsupported contract
  explicit policy denial
~~~

Only transient failures enter automatic exponential retry.

## 20. Circuit breakers and budgets

Per provider/tool maintain cheap health state: closed, open, half_open.

If repeated failures open the circuit, stop hammering the provider; reroute when allowed or suspend/fail explicitly.

Run budgets should support:

~~~text
max_model_calls
max_tool_calls
max_cost
deadline
max_child_runs
max_parallel_children
max_embedding_calls
~~~

## 21. Observability / payoff metrics

### Waiting efficiency

- model-active milliseconds;
- suspended milliseconds;
- deterministic wakeups;
- poller jobs;
- model polls avoided.

### Knowledge efficiency

- retrieval generation;
- retrieval cache hits;
- chunks selected;
- bytes injected;
- lexical/structural/semantic lane usage;
- embedding cache hits;
- embedding calls;
- incremental files/chunks changed;
- fallback repository searches after retrieval.

### Queue efficiency

- queue wait time;
- processing time;
- attempts;
- delayed retries;
- DLQ count;
- concurrency/backlog.

### Agent effectiveness

- parent/child run tree;
- plan-point progress;
- tool receipts;
- artifacts;
- verification results;
- recovery/replan count.

Measure these before claiming dollar/token savings.

## 22. Implementation slices

### Slice A - portable suspension + activity authority

1. Expand portable AgentRun contract to align with real agentsam_agent_run.
2. Add wait/suspension types.
3. Add canonical run-event-to-agentsam.activity.v1 projection.
4. Add retry classification.
5. Test suspend/resume, timeout, cancel, duplicate wake.

### Slice B - Queue Control wake machinery

1. Add availableAt / delayed retry to queue envelope.
2. Add idempotency + lease semantics.
3. Add retry/backoff/jitter helper.
4. Add DLQ contract.
5. Implement local SQLite adapter first.
6. Implement Cloudflare adapter with message delay/retry delay.

### Slice C - generic run CLI

1. agentsam run start/get/watch/tree/cancel/events/receipt.
2. Local adapter first.
3. Hosted adapter second.
4. Watch consumes events; it never invokes a model.

### Slice D - knowledge payoff

1. knowledge.resolve pre-model retrieval boundary.
2. Attach retrieval receipt to run.
3. repository.index becomes resumable queue work.
4. generation-published event wakes blocked runs.
5. Queue changed chunks for embeddings.
6. Add incremental post-run indexing trigger for verified file changes.

### Slice E - child-run orchestration

1. spawn/children/handoff semantics.
2. waiting-child suspension.
3. Local Studio lead/co-worker subscribe to real run ids.
4. Parent run resumes from child completion event.

### Slice F - hosted AgentSam

1. Implement run routes in hosted Go adapter.
2. Persist/run through same contracts.
3. Map runtime execution to agentsam.runtime.v1.
4. Keep MCP as tool plane.
5. Add webhook/event wake endpoints where required.

## 23. Acceptance criteria

1. A run waiting 10 minutes for an external operation spends zero model tokens during the wait.
2. A provider that only supports polling is watched by deterministic backoff jobs, not an LLM.
3. A child agent can run independently and wake its parent on completion.
4. A repository index can rebuild incrementally without a model being active.
5. A no-change index rerun makes zero new embedding calls.
6. Changed-file indexing embeds only new/changed content where semantic indexing is enabled.
7. A normal repository task retrieves knowledge before model reasoning and records a retrieval receipt.
8. CLI and Local Studio can observe the same run/event stream.
9. Local, hosted, remote and sandbox execution use the same portable run contract.
10. Retry exhaustion ends in explicit failure/DLQ/receipt, never an infinite loop.
11. Progress is derived from real plan/step/provider points, not timer animation.
12. The user can inspect whether knowledge/indexing reduced repeated repository discovery work.

## 24. Immediate tickets

Implementation checkpoint (2026-10-03): ACP-001 through ACP-007 are implemented on `feat/agent-control-plane`. Portable contracts own the richer run/suspension/wake/event semantics; runtime migration `0006_agent_run_suspend_activity.sql` persists suspension and the append-only journal without rebuilding the legacy `agentsam_agent_run.status` check. Queue Control owns delayed availability, retry/backoff/jitter, stable idempotency identity, lease claim/refresh/release, provider-independent dead-letter jobs, and provider-managed DLQ delegation. Runtime migration `0007_queue_control.sql` plus the SQLite adapter provide the durable local scheduler reference implementation; Cloudflare Queues remains one hosted adapter rather than the control-plane authority.

ACP host note: `agentsam run` now defaults to project-local SQLite and can target any HTTP-compatible Agent Control Plane via `AGENTSAM_CONTROL_PLANE_URL` / `--url`; no Cloudflare, GCP, AWS, Fly, Docker, VM, or local runtime provider is encoded into run semantics. Hosted implementations must conform to the same `/v1/runs/:id` control contract.

Workbench audit note: `@inneranimalmedia/agentsam-workbench` already owns the portable thread + persistent composer surface (`AgentConversationSurface`), and its lead/co-worker/legacy composition tests pass. Do not create a second composer primitive in Local Studio; any remaining disappearing-lead-composer bug should be treated as Local Studio viewport/composition behavior unless a new portable invariant is proven missing.

~~~text
ACP-001  DONE  Promote agentsam_agent_run fields into portable AgentRun contract
ACP-002  DONE  Define AgentRunSuspension + wake conditions
ACP-003  DONE  Define append-only run event journal and activity projection
ACP-004  DONE  Add queue availableAt/backoff/jitter/idempotency/lease contract
ACP-005  DONE  Implement local SQLite delayed-work scheduler
ACP-006  DONE  Implement provider queue delay/retry/DLQ adapters (Cloudflare first)
ACP-007  DONE  Add agentsam run get/watch/tree/cancel/events/receipt

KNOW-001 Add knowledge.resolve pre-model retrieval boundary
KNOW-002 Attach KnowledgeRetrievalReceipt to runs
KNOW-003 Route repository.index through Queue Control
KNOW-004 Emit knowledge.generation.published and wake dependents
KNOW-005 Queue incremental embeddings/vectorization by content hash
KNOW-006 Add verified-change post-run incremental indexing hook

MULTI-001 Bind child runs to parent_run_id + WorkGraph dependency
MULTI-002 Resume parent from child completion without polling

UI-001   Bind Local Studio lead/co-worker panels to actual run ids/activity
OBS-001  Record waiting/model-active/retrieval/queue effectiveness metrics
~~~

## 25. Non-goals

This lane does not require:

- forcing all AgentSam work through Cloudflare;
- making agentsam-go-worker the only control plane;
- keeping an LLM process resident during background work;
- embedding every repository or chat turn;
- replacing structural/lexical retrieval with vectors;
- one giant company-wide vector collection;
- a new Durable Object architecture for every wait;
- duplicating Queue Control, WorkGraph, GOAP, AutoRAG, or runtime protocol.

The objective is to connect the machinery that already exists into a durable, cheap, observable harness.
