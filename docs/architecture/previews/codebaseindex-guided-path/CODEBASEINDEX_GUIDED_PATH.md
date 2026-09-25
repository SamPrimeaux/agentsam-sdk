# Codebaseindex Guided Path — Template Lanes + Inventory-First UX

**Status:** PLAN · LOCKED intent (2026-09-25)  
**Product:** AgentSam · pipeline `sam.codebaseindex.index.run` · operation `codebaseindex.ingest`  
**Audience:** SDK CLI/TUI, Local Studio, future customer “bring your own vector lane” templates

---

## 1. Host SSOT today — Supabase tables (Gemini @ 1536)

Owner IAM path: **Gemini Embedding 2 → 1536-d → Supabase pgvector**, written via **node-api** edge (`POST /codebase/ingest`, vector RPCs). D1 owns control/structure; Postgres owns vectors.

### Live code-intelligence projections (`agentsam` schema)

| Table | Role |
|-------|------|
| `agentsam.agentsam_codebase_chunks_gemini_embedding_2_1536` | Chunk-level retrieval vectors (primary ANN for code Q&A) |
| `agentsam.agentsam_codebase_files_gemini_embedding_2_1536` | File-level vectors |
| `agentsam.agentsam_codebase_ast_symbols_gemini_embedding_2_1536` | Symbol ANN |

### Related semantic / twin tables (same embed family, different corpora)

| Table | Role |
|-------|------|
| `agentsam.agentsam_gemini_semantic_embeddings_1536` | Unified semantic authority (memory + code symbol projections by `corpus_type` / `record_kind`) |
| `agentsam.agentsam_documents_gemini_embedding_2_1536` | Document ingest twin (node-api `/vectors/ingest`) |

### Retired (do not write for new runs)

| Table | Note |
|-------|------|
| `agentsam.agentsam_codebase_*_oai3large_1536` | Legacy OpenAI code lanes |

### Control plane (D1 — not Supabase, but paired)

| Table | Role |
|-------|------|
| `code_repositories` | Account-owned repo identity |
| `agentsam_code_index_job` / `agentsam_code_index_job_file` | Run progress (`cidxrun_*`) |
| `codebase_ast_nodes` / `codebase_dep_edges` | Structural units + deps |
| `agentsam_pgvector_lane_registry` | Purpose → live PG table + model + dims |
| `agentsam_fs_merkle_snapshots` | Merkle evidence receipts |
| `agentsam_codebase_index_health` | Staleness / weekly health |

**I/O path (owner):** Worker / SDK → **node-api** (Deno edge) → Hyperdrive / session pooler → Supabase PG.

---

## 2. End goal — templateable vector lanes

Owner setup is already live. Customers should get the **same harness**, parameterized:

```text
                    codebaseindex.ingest (guided)
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         local_exact     supabase_pgvector   cloudflare_vectorize
         (SQLite)        (+ node-api edge)   (CF binding)
              │               │               │
         Ollama/paid     Gemini@1536     project Vectorize
         on this machine  BYO Supabase    BYO index/model
```

| Lane | Who runs compute | Where vectors live | When to offer |
|------|------------------|--------------------|---------------|
| **Local** | User machine | `.agentsam/knowledge/index.sqlite` | Default; Ollama free embed OK |
| **Supabase + node-api** | Their edge (template of IAM node-api) | Their `agentsam.*` PG tables | They opt into hosted ANN |
| **CF Vectorize** | Worker/plugin binding | Their Vectorize index | They already live on CF |

**Template rule:** ship **contracts + migrations + edge stubs**, not a shared multi-tenant dump of IAM tables into customer projects. Owner IAM remains the reference implementation.

Same-model law still holds per generation: vectors written with profile `P` are only queried with profile `P` (fingerprint of provider/model/dims/params).

---

## 3. Guided path (inventory first — LOCK this UX)

One option at a time. Plan/dry-run is **not** “skip inventory.”

```text
① Provider / connection
        ↓
② Scan → file map inventory (Merkle + facet view)
        ↓
③ Include / exclude against the map
        ▼
④ Embedding model + dimensions (discovered, not hardcoded)
        ↓
⑤ Vector lane / data source
   · local SQLite
   · Supabase + node-api (Hyperdrive)
   · Cloudflare Vectorize
        ↓
⑥ Dry-run / plan receipt (work-graph stages)
        ↓
⑦ Confirm → run (progress on Gantt + CLI)
```

### CLI / TUI (lightweight)

| Step | Interaction |
|------|-------------|
| ① | `select` configured providers + optional `agentsam providers` deep-link; Ollama online badge from `ollama list` |
| ② | Run `repository.inspect` / Merkle; print compact tree + counts; `--json` for Studio |
| ③ | `text` include / exclude; optional local chat assist; never invent denylist |
| ④ | `select` from **discovered** embed models only |
| ⑤ | `select` lane; if Supabase → collect URL/env names + offer node-api scaffold; if Vectorize → binding/index |
| ⑥ | `plan` emits work-graph JSON + pretty plan card |
| ⑦ | `confirm` then run; stream stage events |

Terminal aesthetic: short notes, one clack prompt per step, `tip: use skill agentsam-codebaseindex`, no wall of presets.

### Studio / localhost Gantt

Work-graph is the **source of truth** for the job; Gantt/timeline are projections.

Example stages (bars):

1. `connect` — providers resolved  
2. `inventory` — file map / merkle  
3. `scope` — include/exclude locked  
4. `embed_profile` — model + dims  
5. `lane` — local | supabase | vectorize  
6. `plan` — dry-run receipt  
7. `index` — parse / chunk / embed  
8. `activate` — verify + ready  

Local Studio (or this preview) polls `agentsam_code_index_job` / local generation receipts and feeds `createGanttModel(graph)`.

---

## 4. Supabase + node-api customer path (what “template” means)

When the user picks **Supabase / Hyperdrive**:

1. Scaffold edge from IAM `supabase/functions/node-api` **pattern** (ingest + account-scoped vector query RPCs).  
2. Apply PG migrations that create **their** `agentsam.agentsam_codebase_*` (or lane-registry–driven table names).  
3. Wire `AGENTSAM_DATABASE_URL` / Hyperdrive binding names into knowledge `lane.backend = supabase_pgvector`.  
4. Register row in **their** `agentsam_pgvector_lane_registry` (or SDK lane config) pointing at table + model + dims.  
5. Runs still use `codebaseindex.ingest` / `sam.codebaseindex.index.run` — only the **provider adapter** changes.

Owner machine: skip scaffold; credentials and node-api already exist → wizard jumps to inventory.

---

## 5. CF Vectorize path (valid peer, not code-index SSOT for IAM)

IAM host law keeps **code index vectors off Vectorize**. Customer template may still choose Vectorize for **their** product:

- Plugin scope: binding + index + model + dims  
- Knowledge `lane.backend = cloudflare_vectorize`  
- Same guided steps ①–⑦; stage `lane` records Vectorize target in the receipt  

Do not silently redirect owner IAM full-index onto Vectorize.

---

## 6. Local Ollama value (strategic I/O)

| Use | How |
|-----|-----|
| Free semantic search | `agentsam search --semantic` against local generation |
| Pre-filter before paid chat | Retrieve top-k chunks → pass only those to hosted model |
| Offline agent turns | Shell/agent retrieve while Ollama is up |
| Scope assist | Chat model (e.g. `qwen2.5-coder`) suggests include/exclude only |

Query must use **same** embed profile as write (e.g. `mxbai-embed-large:latest` @ 1024).

---

## 7. Implementation slices (ordered)

| Slice | Deliverable |
|-------|-------------|
| **A** | Reframe CLI wizard to ①→⑦ (inventory before scope); `plan` prints work-graph stages |
| **B** | Emit `codebaseindex.job.graph.v1` JSON consumed by work-graph Gantt |
| **C** | Local Studio / preview page binding graph → Gantt (this doc’s companion HTML) |
| **D** | Lane picker adapters: local (done-ish), supabase+node-api scaffold stub, vectorize scope probe |
| **E** | Customer template pack: migrations + edge stub + README (no IAM secrets) |

---

## 8. Acceptance checks

- [ ] Wizard never jumps to embed/lane before an inventory receipt exists (or user explicitly skips with `--skip-inventory`).  
- [ ] Exclude is user-authored (blank = none).  
- [ ] Embed options come only from credentials + live Ollama tags.  
- [ ] Plan/dry-run produces work-graph JSON + human card.  
- [ ] Gantt shows the same stage ids as CLI.  
- [ ] Choosing Supabase does not mutate owner IAM tables when running as a customer template.  
- [ ] Semantic retrieve fails closed on embedding-profile mismatch.

---

## Related

- Host SSOT: `inneranimalmedia/docs/platform/codebase-index-ssot-2026-07.md`  
- SAM kernel: `docs/architecture/SAM_KERNEL.md`  
- Skill: `skills/agentsam-codebaseindex/SKILL.md`  
- Work-graph: `packages/work-graph` (`createGanttModel`)  
- Preview: `docs/architecture/previews/codebaseindex-guided-path/`
