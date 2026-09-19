# Memory

Agent Sam's own memory commit/search/save/manager surface — semantic memory, not to be confused with this assistant's own memory system.

**4 tools** in this domain.

## `memory` (1)

- **`agentsam_memory_commit`** (Memory Commit) — Canonical Agent Sam memory commit (D1 SSOT + projection outbox). Returns memory_id, revision, content_hash, semantic_ready, and projection receipts. Use dry_run to validate. Prefer this over agentsam_memory_manager.

## `memory.manager` (1)

- **`agentsam_memory_manager`** (Memory Manager (compat)) — COMPATIBILITY adapter only. Prefer agentsam_memory_commit / agentsam_memory_search. Routes through IAM_MAIN canonical hybrid/commit — not the legacy standalone Supabase vector lane.

## `memory.search` (1)

- **`agentsam_memory_search`** (Memory Search) — Hybrid semantic memory search via IAM_MAIN (exact → Vectorize → pgvector → lexical → D1 hydrate). Returns memory_id/revision/content_hash and suppresses low-score noise.

## `memory.write` (1)

- **`agentsam_memory_save`** (Memory Save) — Canonical memory save (same commit path as agentsam_memory_commit with eager=false). Still enqueues outbox; projections retry on hourly cron.
