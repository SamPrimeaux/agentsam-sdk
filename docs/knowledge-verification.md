# Portable knowledge verification — 2026-09-02

Verified the recovered SDK package from current main plus the portable knowledge implementation. No paid embedding requests, production migrations, npm publication, or host-application pipeline changes were performed.

| Verification | Result |
| --- | --- |
| `npm run verify`, Linux / Node 24.19.0 | Pass: SDK smoke, 55 Node tests, 23 identity tests, package invariants, bootstrap and pack check |
| `npm run verify`, macOS / Node 22.22.2 | Pass: same suite, including numbered scaffold-lane regression |
| Installed tarball proof on Linux and macOS | Pass: install into unrelated consumer; two repositories each run init, plan, index, no-change rerun, retrieval, saved snapshots and comparison |
| Python recovered transport contracts | Pass on both environments |
| Gemini adapter | Deterministic HTTP fixtures verify task prefixes, dimensions, transient retry and non-retryable errors; no live provider quality claim |
| Postgres / pgvector | Actual SQL executed in PGlite with pgvector: idempotent setup, native vector storage/ranking, dimension isolation, scoped history and transactional rollback |

Actual-repository pilot used the same exported SDK engine, a temporary local SQLite store, and read-only source checkouts:

| Repository / selected scope | Files | Chunks | Symbols | Syntactic edges | Rerun |
| --- | ---: | ---: | ---: | ---: | --- |
| `agentsam-sdk` / `src/lib/merkle` | 6 | 35 | 73 | 204 | No changes, zero reparsed files |
| `inneranimalmedia` / `backend/workflows/contracts` | 3 | 9 | 22 | 31 | No changes, zero reparsed files |

Retrieval returned `src/lib/merkle/snapshot.js` for `saveSnapshot` and `backend/workflows/contracts/execution-strategy.js` for `execution`. Both pilots made zero embedding requests and left source checkouts unchanged. Temporary proof stores were removed; these were compatibility checks, not scheduled production baselines.

Incremental tests establish: zero embedding calls for a no-change rerun or file move; one new input for a one-function edit in the fixture; old content remains retrievable after deletion; scope expansion can reuse cached vectors; changed profiles/repositories cannot silently reuse another space; bounded provider failure retains completed cache work while keeping the old generation active; invalid vectors, concurrent publication, and edits during indexing do not replace the active generation.

Limits: syntax edges are not resolved semantic dependencies; Python repository intelligence is optional and requires Python 3.10+; Postgres is tested locally, not against a production Supabase deployment; semantic retrieval quality still needs a small live Gemini evaluation set before paying for a broad backfill. The package uses exact search and retained generation payloads, so production-scale ANN indexes and retention policy remain separate rollout work.
