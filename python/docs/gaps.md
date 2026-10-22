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
| `scripts/d1_bloat_audit.py` | `agentsam_sdk.data.d1_bloat` | **Ported + aligned (2026-08).** Database-scoped: `--quick` = all tables COUNT(*); `--full` = text LENGTH + briefing. Removed `QUICK_TABLE_RE` / `SKIP_COL_RE` / `--count-only`. Deferred: `--email`/Resend (CLI/ops layer). |
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
| `tools/scan_bloat.py` (IAM shim) | `agentsam_sdk.repository.scan_bloat` | **Ported.** Per-file KB/lines/est. tokens; CLI `agentsam repository scan-bloat`. D1: `agentsam_scripts.slug=scan_bloat` (not `agentsam_commands`). |
| `repo_cleanup_classify.py`, `repo-cleanup.py` | `agentsam_sdk.repository.cleanup_plan` | **Not started** |
| `audit_dead_code.py` | `agentsam_sdk.repository.dead_paths` | **Not started** |
| `audit_hardcoded_identity.py`, `guard-no-hardcoded-identity.sh` | `agentsam_sdk.readiness.boundaries` | **Not started** |
| `audit_migration_chain.py` | `agentsam_sdk.history.timeline` / `.supersession` | **Not started** |
| leftover `d1_*_audit.py` | `agentsam_sdk.data.d1` adapters | **Not started** |

## Optional / network packages (outside stdlib core)

These live under `packages/`, **not** under `python/agentsam_sdk/`.
Core `python/pyproject.toml` stays `dependencies = []`.

| Package | Path | Deps | Status | Dual-home |
|---|---|---|---|---|
| `agentsam-site-scrape` | `packages/agentsam-site-scrape/` | `requests` (network + R2 mutate) | **Live experimental** (was planned) | IAM `tools/agentsam-site-scrape/` @ `33fa6c26aa2d007bdb115310473e939191a1940b` |

## Out of scope (per handoff doc, unchanged)

`scripts/embed_*`, `scripts/ingest_*` (product Vectorize/pgvector pipelines);
dashboard/Worker `client_fs`/ExecOS path-propose lane; inventing new D1
tables for audit output (output stays json+markdown under `--output-dir`,
R2 later if wanted).

## Native runtime and PrimeTech procedures (2026-10)

- [x] Native Python operations now cover workspace read/list/stat/write/patch/remove and bounded argv process execution without requiring Node or the JavaScript bridge for those operations.
- [x] The Node SAM kernel remains the canonical host. The Python runtime follows the shared workspace and terminal conformance fixtures under protocol/runtime; it is a second implementation, not a replacement kernel.
- [x] D1 mutation remains exclusively behind the existing D1Adapter and requires an explicit database UUID. The adapter uses Wrangler/Node; D1 mutation is unavailable if that existing adapter is not bound.
- [x] The Python ProcedureClient delegates to an injected trusted host operation. It does not spawn a shell or create a parallel procedure registry.
- [x] PrimeTech's experimental repo.asset.inventory@0.1.0 procedure was executed through the existing sam.superbash operation against a native CAD/BIM workspace. It discovered and hashed 27 assets without truncation; the smoke-run artifact and receipt were written to a temporary evidence directory, not into the source project.
- [ ] No live D1 mutation has been run. No public PrimeTech package release is claimed. The procedure package remains a private workspace package pending portability and release review.

## Contract compliance

- [x] `runtime/contract.py`: `ToolInput`/`ToolResult` + receipt, every tool call writes one.
- [x] Native runtime is read-only by default. Workspace writes/patch/removal and terminal execution require explicit write intent plus trusted host approval; refusals and successful calls produce ToolResult receipts.
- [x] D1 access only via `data/d1_adapter.py` (wraps `wrangler d1 execute`); no other module shells out to wrangler or hits the CF API directly.
- [x] No hardcoded `au_*`/`ws_*`/`tenant_*`/database-id values anywhere — `D1Adapter.from_env` raises rather than guessing.
- [x] D1 audit tools and repository inventory retain their JSON/Markdown outputs. Native runtime and PrimeTech procedures additionally emit structured JSON results, artifact hashes, and receipts.
- [x] Runtime conformance and D1 adapter tests use temporary fixtures/fakes and need no live D1 or network. No live D1 write has been exercised.
- [x] Receipts use `written_at_unixepoch` (unixepoch integer per AGENTS.md); tool-level timestamps otherwise use `time.time()` floats for duration math, not stored as durable rows.
- [x] `scripts/run-d1-bloat-audit.sh` untouched and still works (legacy path preserved) — see shim note above.
- [x] Host tooling documented: `docs/tooling.md` (jq + wrangler + env); `scripts/check-host-tooling.sh`.

## Known limitations to fix before this is "done" for P0

1. `agentsam_walk` is a condensed reimplementation, not byte-identical to the 801-line original — needs a side-by-side diff review against real D1 output before calling P0 fully closed.
2. No live-D1 smoke test has been run yet in this pass (would need `AGENTSAM_D1_DB_NAME` + Cloudflare creds on the operator machine) — see README "D1 audits" section for the command to run one.
3. `d1_schema_audit.py`'s curated `TABLE_META` prose (table-by-table purpose descriptions) is real, hand-maintained documentation value that this port does NOT carry over. Flagging so it isn't silently lost.
