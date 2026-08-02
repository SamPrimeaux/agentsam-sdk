# agentsam-sdk — D1 audit port: status

Tracks the file list from `plans/active/CLAUDE-AGENTSAM-SDK-D1-AUDIT-PORT-HANDOFF-2026-08.md`.

Context: `feature/agentsam-sdk-scaffold` had no `agentsam-sdk/` package at all
when this pass started (no pyproject, no CLI, no docs/gaps.md) -- the
handoff doc assumed a scaffold that hadn't actually landed. This pass builds
the minimal scaffold from zero, then ports P0.

Host tools (jq, wrangler, Python): see `docs/tooling.md` + `scripts/check-host-tooling.sh`.

## P0 — whole-D1 / agentsam walkers

| Legacy script | SDK target | Status |
|---|---|---|
| `scripts/d1_bloat_audit.py` | `agentsam_sdk.data.d1_bloat` | **Ported.** Full parity on scan/flag/render logic. Deferred: `--email`/Resend delivery (kept module free of a RESEND_API_KEY dep; wire at CLI/ops layer if still wanted). |
| `scripts/run-d1-bloat-audit.sh` | `agentsam data d1-bloat` via CLI | **Shimmed**, see below — legacy `npm run audit:d1-bloat*` scripts still work unchanged. GCP-fallback/nohup wrapper behavior not reimplemented in the SDK itself (that's operational, not tool logic); still available via the legacy `.sh`. |
| `scripts/walk_agentsam_tables.py` | `agentsam_sdk.data.agentsam_walk` | **Ported, condensed.** Schema/indexes/FKs/row-count/freshness/capability-grouping all present. Not byte-for-byte: duplicate-table detection and some staleness heuristics from the 801-line original are deferred. |
| `scripts/d1_schema_audit.py` | folded into `agentsam_walk` (schema slice) | **Partially folded.** The capability-grouping + schema dump is covered by `agentsam_walk`. NOT ported: the per-feature markdown chunking into 14 separate `db/agentsam-*.md` files, and the curated `TABLE_META` purpose annotations (760+ lines of hand-written table descriptions) -- that's product documentation content, not audit logic, and belongs in a follow-up pass, not this one. Also note: the legacy script hardcoded a D1 database id as a fallback default (`D1_DATABASE_ID = os.environ.get("D1_DATABASE_ID", "cf87b717-...")`) -- **do not carry that forward**; the new adapter has no such fallback (HARD LAW). |

## P1 — agentsam quality / wiring (not started this pass)

`audit_agentsam_full.py`, `agentsam_db_deep_audit.py`, `audit_agentsam_tables.py`,
`audit_agentsam_schema.py`, `audit_agentsam_table_usage.py`,
`agentsam_cms_d1_table_audit.py`, `agentsam_audit.py` — all deferred. Reason:
scope boundary for this pass was P0 only, per the handoff doc's file list.

## P2 — repository / history / readiness

| Legacy script | SDK target | Status |
|---|---|---|
| `scripts/repo-size-inventory.py` (main) / `repo_inventory.py` | `agentsam_sdk.repository.inventory` | **Ported** (category + byte sizes + largest files + extension rollups; jq-friendly JSON; stub fields `by_extension` / `by_top_level_dir` retained). |
| `repo_cleanup_classify.py`, `repo-cleanup.py` | `agentsam_sdk.repository.cleanup_plan` | **Not started** |
| `audit_dead_code.py` | `agentsam_sdk.repository.dead_paths` | **Not started** |
| `audit_hardcoded_identity.py`, `guard-no-hardcoded-identity.sh` | `agentsam_sdk.readiness.boundaries` | **Not started** |
| `audit_migration_chain.py` | `agentsam_sdk.history.timeline` / `.supersession` | **Not started** |
| leftover `d1_*_audit.py` | `agentsam_sdk.data.d1` adapters | **Not started** |

## Out of scope (per handoff doc, unchanged)

`scripts/embed_*`, `scripts/ingest_*` (product Vectorize/pgvector pipelines);
dashboard/Worker `client_fs`/ExecOS path-propose lane; inventing new D1
tables for audit output (output stays json+markdown under `--output-dir`,
R2 later if wanted).

## Contract compliance

- [x] `runtime/contract.py`: `ToolInput`/`ToolResult` + receipt, every tool call writes one.
- [x] Read-only default; `ToolInput.write` exists but nothing in this pass sets it True — no silent production writes.
- [x] D1 access only via `data/d1_adapter.py` (wraps `wrangler d1 execute`); no other module shells out to wrangler or hits the CF API directly.
- [x] No hardcoded `au_*`/`ws_*`/`tenant_*`/database-id values anywhere — `D1Adapter.from_env` raises rather than guessing.
- [x] Output: json + markdown from `d1_bloat`, `agentsam_walk`, and `repository.inventory`. No other formats claimed.
- [x] Tests use fixtures/pure functions only — `python3 -m unittest discover -s tests` needs no live D1 or network.
- [x] Receipts use `written_at_unixepoch` (unixepoch integer per AGENTS.md); tool-level timestamps otherwise use `time.time()` floats for duration math, not stored as durable rows.
- [x] `scripts/run-d1-bloat-audit.sh` untouched and still works (legacy path preserved) — see shim note above.
- [x] Host tooling documented: `docs/tooling.md` (jq + wrangler + env); `scripts/check-host-tooling.sh`.

## Known limitations to fix before this is "done" for P0

1. `agentsam_walk` is a condensed reimplementation, not byte-identical to the 801-line original — needs a side-by-side diff review against real D1 output before calling P0 fully closed.
2. No live-D1 smoke test has been run yet in this pass (would need `AGENTSAM_D1_DB_NAME` + Cloudflare creds on the operator machine) — see README "D1 audits" section for the command to run one.
3. `d1_schema_audit.py`'s curated `TABLE_META` prose (table-by-table purpose descriptions) is real, hand-maintained documentation value that this port does NOT carry over. Flagging so it isn't silently lost.
