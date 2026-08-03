"""agentsam_sdk.data.d1_bloat -- port of scripts/d1_bloat_audit.py.

Database-scoped D1 size audit (not tenant/workspace). Walks one CF D1 database.

Modes:
  quick  — every user table + COUNT(*) only
  full   — same tables + SUM(LENGTH(...)) on text-ish columns + briefing

D1 remote has no dbstat; sizes are LENGTH estimates, not exact page bytes.

Deferred from the legacy script (see docs/gaps.md): --email/Resend delivery.
This module writes json + markdown only.
"""
from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from agentsam_sdk.data.d1_adapter import D1Adapter, D1AdapterError
from agentsam_sdk.runtime.contract import ToolInput, ToolResult, start_timer, write_receipt

TOOL_NAME = "data.d1_bloat"

# Prefer payload-ish TEXT columns when measuring LENGTH (full mode).
BLOAT_COL_RE = re.compile(
    r"(body|content|value|markdown|_json\b|schema|payload|output|prompt|message|"
    r"text|config|metadata|description|notes|script|summary|arguments|result|"
    r"attributes|events|resource|handler|input_|output_|sql\b|embedding|merged_)",
    re.I,
)

ROLLUP_HINTS: dict[str, str] = {
    "agentsam_tool_call_log": "Archive/purge output_json + input_json >30d; keep output_summary + ids.",
    "agentsam_tool_chain": "result_json dominates — rollup to R2 or truncate; keep summaries.",
    "agentsam_tool_cache": "Enforce TTL + max rows; output_json must not grow unbounded.",
    "agentsam_mcp_tool_execution": "Archive old output_json; mirror tool_call_log policy.",
    "agentsam_execution_steps": "Archive input/output JSON after workflow completes.",
    "agentsam_workflow_runs": "Move step_results_json to R2; D1 row = pointer + status + cost.",
    "agentsam_webhook_events": "Rollup payload_json; retain type + ts + external id.",
    "agentsam_scripts": "body must stay empty; canonical source in R2 (source_stored=r2:…).",
    "agentsam_skill": "Large SKILL.md → R2; D1 = metadata + retrieval_strategy=r2.",
    "agentsam_memory": "Archive stale prose; vectors live in Supabase/Vectorize, not D1.",
    "agentsam_rules_document": "body_markdown → R2; D1 = trigger + key + short summary.",
    "agentsam_cron_runs": "Trim metadata_json on old runs.",
    "agentsam_hook_execution": "Archive payload_json; keep hook id + status.",
    "agentsam_eval_runs": "Cap grader notes; long artifacts → Supabase eval tables.",
    "otlp_traces": "Retention on attributes_json; sample or export off-D1.",
    "terminal_history_archive_431": "Archive scrollback to R2 or cap rows per connection.",
    "system_health_snapshots": "Shorten retention or aggregate further.",
}


@dataclass
class ColStat:
    name: str
    bytes: int
    max_len: int = 0


@dataclass
class TableStat:
    name: str
    row_count: int = 0
    text_bytes: int = 0
    est_bytes: int = 0
    columns: list[ColStat] = field(default_factory=list)
    error: Optional[str] = None

    @property
    def rollup_hint(self) -> Optional[str]:
        if self.name in ROLLUP_HINTS:
            return ROLLUP_HINTS[self.name]
        if self.text_bytes > 500_000 and any(
            c.name
            in (
                "body",
                "content_markdown",
                "value",
                "output_json",
                "result_json",
                "payload_json",
            )
            for c in self.columns
        ):
            return "Large text/JSON in D1 — prefer R2 pointer + vector lanes for search."
        return None


def _pick_measure_columns(cols: list[tuple[str, str]], max_cols: int = 12) -> list[str]:
    """TEXT/BLOB/JSON columns to LENGTH-scan. Prefer payload-ish names; else any text cols."""
    textish = [
        n
        for n, typ in cols
        if (typ or "TEXT").upper() in ("TEXT", "BLOB", "JSON") or "CHAR" in (typ or "").upper()
    ]
    preferred = [n for n in textish if BLOAT_COL_RE.search(n)]
    chosen = preferred if preferred else textish
    return chosen[:max_cols]


def _scan_table(adapter: D1Adapter, table: str, analyze_text: bool) -> TableStat:
    stat = TableStat(name=table)
    try:
        if not analyze_text:
            stat.row_count = adapter.row_count(table)
            stat.est_bytes = stat.row_count * 120
            return stat

        cols = adapter.table_columns(table)
        measure = _pick_measure_columns(cols)
        if measure:
            parts = [f'SUM(LENGTH(COALESCE("{c}", \'\'))) AS "{c}"' for c in measure]
            max_parts = [f'MAX(LENGTH(COALESCE("{c}", \'\'))) AS "m_{c}"' for c in measure]
            sql = f'SELECT COUNT(*) AS rc, {", ".join(parts + max_parts)} FROM "{table}"'
            row = adapter.query(sql)[0]
            stat.row_count = int(row.get("rc") or 0)
            for c in measure:
                b = int(row.get(c) or 0)
                if b:
                    stat.columns.append(
                        ColStat(name=c, bytes=b, max_len=int(row.get(f"m_{c}") or 0))
                    )
            stat.text_bytes = sum(c.bytes for c in stat.columns)
            stat.est_bytes = stat.text_bytes if stat.text_bytes else stat.row_count * 120
        else:
            stat.row_count = adapter.row_count(table)
            stat.est_bytes = stat.row_count * 120
    except D1AdapterError as e:
        stat.error = str(e)[:200]
    except Exception as e:  # noqa: BLE001 -- surfaced in receipt, not swallowed
        stat.error = str(e)[:200]
    return stat


def _fmt_bytes(n: int) -> str:
    if n >= 1024 * 1024:
        return f"{n / 1024 / 1024:.2f} MB"
    if n >= 1024:
        return f"{n / 1024:.1f} KB"
    return f"{n} B"


def _build_findings(stats: list[TableStat], mode: str) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    if mode == "quick":
        ranked = sorted(stats, key=lambda s: s.row_count, reverse=True)
        for s in ranked[:40]:
            if s.error:
                findings.append(
                    {
                        "severity": "medium",
                        "table": s.name,
                        "rows": s.row_count,
                        "est_bytes": 0,
                        "est_human": "—",
                        "why": f"scan_error: {s.error[:120]}",
                        "next_steps": ["Re-run --full for this table after fixing access."],
                    }
                )
                continue
            if s.row_count < 50_000:
                continue
            sev = "high" if s.row_count >= 100_000 else "medium"
            findings.append(
                {
                    "severity": sev,
                    "table": s.name,
                    "rows": s.row_count,
                    "est_bytes": s.est_bytes,
                    "est_human": _fmt_bytes(s.est_bytes),
                    "why": f"High row count ({s.row_count:,}) — run --full to size text/JSON.",
                    "next_steps": [
                        f"agentsam data d1-bloat --full --prefix {s.name}",
                        "Confirm retention / archive policy for this table.",
                    ],
                }
            )
        return findings

    total_text = sum(s.text_bytes for s in stats) or 1
    ranked = sorted(stats, key=lambda s: s.text_bytes or s.est_bytes, reverse=True)
    for s in ranked[:80]:
        est = s.text_bytes or s.est_bytes
        reasons: list[str] = []
        if est >= 5_000_000:
            reasons.append(f"text_est>={_fmt_bytes(5_000_000)}")
        if s.row_count >= 100_000:
            reasons.append(f"rows>={s.row_count:,}")
        if est >= 1_000_000 and (est / total_text) >= 0.08:
            reasons.append(f"share>={100 * est / total_text:.0f}% of scanned text")
        if s.rollup_hint and est >= 500_000:
            reasons.append("known_rollup_candidate")
        if s.error:
            reasons.append(f"scan_error:{s.error[:80]}")
        if not reasons:
            continue
        steps = []
        if s.rollup_hint:
            steps.append(s.rollup_hint)
        else:
            steps.append("Inspect top text columns; archive or move large payloads to R2.")
        steps.append("Cap writers at source (result ceilings / retention).")
        findings.append(
            {
                "severity": "high"
                if est >= 5_000_000 or s.row_count >= 100_000
                else "medium",
                "table": s.name,
                "rows": s.row_count,
                "est_bytes": est,
                "est_human": _fmt_bytes(est),
                "why": "; ".join(reasons),
                "next_steps": steps,
                "top_columns": [
                    {"name": c.name, "bytes": c.bytes, "human": _fmt_bytes(c.bytes)}
                    for c in sorted(s.columns, key=lambda x: x.bytes, reverse=True)[:5]
                ],
            }
        )
    return findings


def _build_doing_well(
    stats: list[TableStat], findings: list[dict[str, Any]]
) -> list[dict[str, str]]:
    flagged = {f["table"] for f in findings}
    well: list[dict[str, str]] = []
    small = [s for s in stats if not s.error and s.row_count < 1_000 and s.name not in flagged]
    if small:
        well.append(
            {
                "area": "small_tables",
                "why": f"{len(small)} tables under 1k rows and not flagged — fine for registry/config.",
            }
        )
    empty = sum(1 for s in stats if not s.error and s.row_count == 0)
    if empty:
        well.append(
            {
                "area": "empty_tables",
                "why": f"{empty} empty tables (candidates to drop later, not urgent).",
            }
        )
    if not findings:
        well.append(
            {"area": "no_flags", "why": "No high/medium bloat heuristics fired on this pass."}
        )
    return well


def _build_briefing(
    stats: list[TableStat],
    findings: list[dict[str, Any]],
    doing_well: list[dict[str, str]],
    db_name: str,
    db_size: Optional[str],
    mode: str,
    table_total: int,
) -> str:
    high = sum(1 for f in findings if f["severity"] == "high")
    med = sum(1 for f in findings if f["severity"] == "medium")
    verdict = "needs_attention" if high or med else "healthy"
    lines = [
        f"# D1 health — {db_name}",
        "",
        f"- **Generated:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        f"- **Mode:** {mode} (database-scoped; not tenant/workspace)",
        f"- **Reported DB size:** {db_size or 'unknown'}",
        f"- **Tables:** {table_total} scanned",
        f"- **Verdict:** {verdict} ({high} high / {med} medium findings)",
        "",
    ]
    if mode == "quick":
        lines.append(
            "> Quick = row counts only. Run `--full` for text/JSON size estimates and rollup guidance."
        )
        lines.append("")
    else:
        lines.append(
            f"> Full text estimate (scanned columns): {_fmt_bytes(sum(s.text_bytes for s in stats))}."
        )
        lines.append(
            "> D1 remote has no `dbstat` — sizes are `SUM(LENGTH(...))`, not exact page bytes."
        )
        lines.append("")

    lines.append("## What's fine")
    lines.append("")
    if doing_well:
        for w in doing_well:
            lines.append(f"- **{w['area']}:** {w['why']}")
    else:
        lines.append("- (nothing notable)")
    lines.append("")

    lines.append("## What's bloated / needs attention")
    lines.append("")
    if not findings:
        lines.append("- None flagged on this pass.")
    else:
        for i, f in enumerate(findings[:25], 1):
            lines.append(
                f"{i}. **`{f['table']}`** [{f['severity']}] — "
                f"rows={f['rows']:,}, est={f['est_human']}"
            )
            lines.append(f"   - Why: {f['why']}")
            for step in f.get("next_steps") or []:
                lines.append(f"   - Next: {step}")
    lines.append("")

    lines.append("## Next steps (global)")
    lines.append("")
    if mode == "quick":
        lines.append("1. `agentsam data d1-bloat --full --format json` for size + column detail.")
        lines.append("2. Prioritize tables with ≥100k rows from the inventory above.")
    else:
        lines.append("1. Act on high findings first (archive / R2 / writer caps).")
        lines.append("2. Re-run `--quick` weekly for row-count drift; `--full` after large ingest.")
        lines.append("3. Prefer D1 for pointers + state; R2 for bytes; Vectorize/Supabase for search.")
    lines.append("")
    return "\n".join(lines)


def run(tool_input: ToolInput) -> ToolResult:
    started = start_timer()
    tool_input.assert_read_only()
    p = tool_input.params
    mode = tool_input.mode if tool_input.mode in ("quick", "full") else "quick"
    prefix = p.get("prefix")
    workers = int(p.get("workers", 6))
    top = int(p.get("top", 40))
    analyze_text = mode == "full"

    output_dir = tool_input.output_path()

    try:
        adapter = D1Adapter.from_env(
            db_name=p.get("db"),
            wrangler_config=p.get("config"),
            repo_root=p.get("repo_root"),
        )
        all_tables = adapter.list_tables()
        tables = all_tables
        if prefix:
            tables = [t for t in all_tables if t.lower().startswith(str(prefix).lower())]

        db_size = adapter.database_size()
        stats: list[TableStat] = []
        with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
            futures = {
                pool.submit(_scan_table, adapter, t, analyze_text): t for t in tables
            }
            for fut in as_completed(futures):
                try:
                    stats.append(fut.result())
                except Exception as e:  # noqa: BLE001
                    stats.append(TableStat(name=futures[fut], error=str(e)))

        if mode == "quick":
            stats.sort(key=lambda s: s.row_count, reverse=True)
        else:
            stats.sort(key=lambda s: s.text_bytes or s.est_bytes, reverse=True)

        findings = _build_findings(stats, mode)
        doing_well = _build_doing_well(stats, findings)
        high = sum(1 for f in findings if f["severity"] == "high")
        med = sum(1 for f in findings if f["severity"] == "medium")
        verdict = "needs_attention" if high or med else "healthy"
        md = _build_briefing(
            stats, findings, doing_well, adapter.db_name, db_size, mode, len(tables)
        )

        json_payload = {
            "database": adapter.db_name,
            "scope": "database",
            "mode": mode,
            "verdict": verdict,
            "database_size": db_size,
            "tables_total": len(all_tables),
            "tables_scanned": len(tables),
            "estimated_text_bytes": sum(s.text_bytes for s in stats),
            "doing_well": doing_well,
            "findings": findings,
            "next_steps_global": (
                [
                    "agentsam data d1-bloat --full --format json",
                    "Act on tables with ≥100k rows first",
                ]
                if mode == "quick"
                else [
                    "Act on high findings (archive / R2 / writer caps)",
                    "Re-run --quick weekly for row drift",
                ]
            ),
            "tables": [
                {
                    **{k: v for k, v in asdict(s).items() if k != "columns"},
                    "columns": [asdict(c) for c in s.columns],
                    "rollup_hint": s.rollup_hint,
                }
                for s in stats[:top]
            ],
        }

        artifacts: list[str] = []
        if output_dir:
            output_dir.mkdir(parents=True, exist_ok=True)
            (output_dir / "d1-bloat.md").write_text(md, encoding="utf-8")
            (output_dir / "d1-bloat.json").write_text(
                json.dumps(json_payload, indent=2), encoding="utf-8"
            )
            artifacts = [str(output_dir / "d1-bloat.md"), str(output_dir / "d1-bloat.json")]

        result = ToolResult(
            ok=True,
            tool=TOOL_NAME,
            mode=mode,
            request_id=tool_input.request_id,
            started_at=started,
            finished_at=start_timer(),
            summary=(
                f"Scanned {len(tables)}/{len(all_tables)} tables "
                f"(mode={mode}, verdict={verdict}, findings={len(findings)})."
            ),
            data=json_payload,
            artifacts=artifacts,
        )
    except D1AdapterError as e:
        result = ToolResult(
            ok=False,
            tool=TOOL_NAME,
            mode=mode,
            request_id=tool_input.request_id,
            started_at=started,
            finished_at=start_timer(),
            summary="D1 adapter error",
            error=str(e),
        )

    write_receipt(result, output_dir)
    return result
