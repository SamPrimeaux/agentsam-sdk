# Knowledge, current state, and provider context

Status: design proposal grounded in the current SDK. This document does not
claim a durable-claim store, D1 knowledge adapter, or automatic distillation
pipeline has been implemented.

## Existing authorities

| Concern | Existing owner | Lifetime |
| --- | --- | --- |
| ProjectSession, plans, runs, approvals, receipts | `src/local/runtime-store.js`, `migrations/runtime/`, project `.agentsam/data/agentsam.sqlite` | session/work cycle; selected receipts persist |
| Blackboard/current workspace state | `agentsam_workspace_state`; repository package workspace-state and GOAP adapters | current work cycle, versioned observations |
| Hosted GOAP inspection | `packages/agentsam-repository/src/goap.js` currently reads D1 workspace state, tickets, runs, commits, checkpoints | live observation, refresh required |
| Repository retrieval knowledge | `src/knowledge/engine.js`, existing SQLite/Postgres stores | published index generation; superseded generations are retrieval history |
| Local repository index | `.agentsam/knowledge/index.sqlite`, configured by `.agentsam/knowledge.json` | rebuildable index/cache, distinct from runtime SQLite |
| Provider continuation | provider response ID or pending exact compaction output in `agentsam_provider_continuations` | session; replaced on compaction, removed after successful continuation |
| Application data | user's configured application storage | application-owned |

This repository declares D1 `inneranimalmedia-business` as binding `DB` in
`apps/local-studio/backend/wrangler.jsonc`, plus `HYPERDRIVE`, R2
`WEBSITE_ASSETS`, AI and service bindings. These are configuration observations,
not live connectivity proof. Local SQLite does not silently replace or mirror them.

The runtime migration already supplies `agentsam_workspace_state`. Extend that
owner and its adapters for portable blackboard behavior; do not introduce a
second table named `agentsam_blackboard` just to express the same state.
The current hosted `/goap` implementation is not yet a portable local-first
blackboard adapter. Its configured D1 and query scoping need a separate audited
adapter cutover before promising the same behavior to a new offline user.

## Four independent contracts

1. **Blackboard**: what the runtime currently knows about this task. Goal, plan,
   blockers, observations, approvals and pending actions retain explicit owners.
   Observations include source revision and observed time. Updating state uses
   an expected revision; concurrent agents must not overwrite each other's work.
2. **Knowledge claim**: reusable understanding, supported by attributable evidence.
   Decisions can be superseded; observations expire. Claims never grant permissions.
3. **Evidence**: source identity, revision/hash, observation time, and a bounded
   range or payload reference. References do not imply the payload remains available.
4. **Provider context**: opaque inference continuation. Pass it back unchanged.
   It is neither a knowledge record nor the authority for the current goal.

Provider context compaction, removal of stale blackboard observations, and
knowledge distillation are separate operations with separate receipts. A provider
compaction must still succeed when no knowledge candidates are accepted.
`src/context/compact.js` remains bounded context-item truncation.

## Proposed claim envelope

Extend the existing `protocol/knowledge/` namespace; do not create a competing
knowledge package or replace the current retrieval contracts in place.

A versioned claim should contain:

- `id`, `schema_version`, and an authority-issued namespace/scope reference;
- `kind`: fact, decision, constraint, preference, procedure, relationship, observation;
- `statement`, plus optional typed subject/predicate/object when known;
- `assertion_basis`: observed, user_asserted, derived, inferred;
- `evidence_refs`, including source revision/hash and observed time;
- `valid_from`, optional `valid_until`, and `review_after` for drift-prone claims;
- `lifecycle`: persistent, session, work_cycle, ttl, scratch;
- `expires_at` when time-bounded, with an explicit cleanup owner;
- `revision`, `supersedes_id`, and conflict status;
- `sensitivity` and access-policy reference;
- deterministic content hash, creation time and actor/source attribution.

The runtime supplies account, repository, session and work-cycle identity.
Do not accept model-supplied scope as authorization. Filter access and expiry
before retrieval scoring or embedding lookup. Scope-specific policy beats a
semantic match from a different account/project. Inferences remain labelled;
an arbitrary model-generated confidence score is not proof.

Evidence objects are separate from claim-to-evidence links. Store source metadata
once, and use a link relation such as supports, contradicts or supersedes.
Missing/stale evidence makes a claim unverified; it must not silently remain a
confirmed current fact. Secret values belong in credential stores, never claims,
embeddings, generic metadata or lifecycle receipts.

## Promotion and forgetting

Candidate extraction may run at a user checkpoint or completed work cycle over
bounded explicit statements and tool evidence. Never extract hidden reasoning or
interpret encrypted provider content. Admission is a runtime operation, not a
model write directly to durable storage.

| Candidate | Treatment |
| --- | --- |
| Explicit user architectural decision | Persistent, scoped, attributable, supersedable |
| Verified provider constraint | Durable with review-after date and source revision |
| Current failing test or unresolved blocker | Work-cycle blackboard observation |
| Current branch, dirty files, temporary hypothesis | Refreshable working state |
| Fixed typo, repeated stdout, intermediate speculation | Discard or bounded evidence TTL |
| API key or session credential | Reject from generic knowledge |

Require future usefulness and evidence for durable promotion. Reacquisition cost
is a useful ranking signal, not an override of access, privacy, or correctness.
A question or tentative suggestion is not a decision. Stable wording alone does
not prove semantic identity: dedupe exact content deterministically; mark fuzzy
matches as candidates. Contradictions create a conflict or explicit supersession,
not a silent last-write-wins overwrite. Preserve tombstones through any explicit
sync so deletion is not undone by an offline replica.

A distillation receipt identifies source checkpoint and evidence references,
candidate counts, admitted/rejected/superseded IDs, rejection reason codes,
extractor/version, and idempotency key. Counts must reconcile. No raw transcript
or hidden reasoning belongs in the receipt. Admission and its receipt commit
atomically; retries must not create duplicate claims.

## Storage and retrieval

Use store roles rather than a universal database abstraction. Runtime relational
state remains project-local SQLite. Knowledge may select the existing SQLite or
Postgres adapter. D1 application bindings stay application-owned until a tested
knowledge adapter with migrations, scoping, lifecycle and concurrency semantics
is explicitly selected. Object evidence payloads and vector indexes retain their
own capabilities. Do not copy an application's entire database into memory.

`/db sources` reads bounded local configuration and reports candidates, role,
selection and support. Discovery is not authorization or connectivity proof.
`/db select knowledge sqlite` selects the local index.
`/db select knowledge postgres MY_DATABASE_URL` selects an environment-variable
reference; it stores no connection string. Existing include/exclude scope and
repository identity are preserved. Selection does not migrate existing data,
initialize remote tables, switch the runtime database, or enable synchronization.
JSON/JSONC Wrangler configurations and named environment bindings are supported;
TOML is reported for explicit inspection. Future connectors can extend discovery
without being implicitly granted query/write access.

A new user gets the existing runtime SQLite migrations immediately and builds
the local repository index with `agentsam index run`. A durable-claim migration
and promotion API are still future implementation, not a feature of the current
index merely because it is named knowledge.

Extend the existing context-pack protocol to reference admitted claims alongside
source evidence. Retrieval first applies authority, scope, expiry, and freshness,
then relevance and token budget. Return source references/hashes and a selection
receipt with considered, selected, excluded and estimated-token counts. Rehydrate
exact source evidence when a task needs details. The model receives a bounded
pack for its objective, never the entire knowledge store.
