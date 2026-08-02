"""agentsam_sdk.data.d1_bloat -- port of scripts/d1_bloat_audit.py.

Finds largest / text-heavy D1 tables via row counts + SUM(LENGTH(text_col))
(D1 remote has no dbstat, so this is an estimate, not exact page bytes).

Deferred from the legacy script (see docs/gaps.md): --email/Resend delivery.
This module writes json + markdown only; wire up email at the CLI/ops layer
if still wanted -- keeps this module free of a RESEND_API_KEY dependency.
"""
from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from agentsam_sdk.data.d1_adapter import D1Adapter, D1AdapterError
from agentsam_sdk.runtime.contract import ToolInput, ToolResult, write_receipt, start_timer

TOOL_NAME = "data.d1_bloat"

BLOAT_COL_RE = re.compile(
    r"(body|content|value|markdown|_json\b|schema|payload|output|prompt|message|"
    r"text|config|metadata|description|notes|script|summary|arguments|result|"
    r"attributes|events|resource|handler|input_|output_|sql\b|embedding|merged_)",
    re.I,
)
SKIP_COL_RE = re.compile(
    r"(^id$|_id$|_at$|_at_epoch$|_hash$|_key$|_uuid$|_ref$|_url$|_path$|_email$|"
    r"_slug$|_name$|_type$|_status$|_mode$|_token$|tenant_id|workspace_id|user_id)",
    re.I,
)
QUICK_TABLE_RE = re.compile(
    r"^(agentsam_|otlp_|system_health|deployment|terminal_|cms_|worker_analytics|"
    r"ai_api_test|dashboard_versions|semantic_search)",
    re.I,
)

# Table-name -> rollup guidance. Naming convention hints, not identity/secrets;
# safe to ship. Extend freely -- this is documentation, not config.
ROLLUP_HINTS: dict[str, str] = {
    "agentsam_tool_call_log": "Archive/purge output_json + input_json >30d; keep output_summary + ids.",
    "agentsam_tool_chain": "result_json dominates -- rollup to object storage or truncate JSON.",
    "agentsam_tool_cache": "Cache table -- enforce TTL + max rows.",
    "agentsam_workflow_runs": "Move step_results_json to R2 artifact; D1 row = pointer + status + cost.",
    "agentsam_scripts": "body must stay empty; canonical source in R2 (source_stored=r2:...).",
    "agentsam_skill": "Large SKILL.md -> R2; D1 = metadata + retrieval_strategy=r2.",
    "agentsam_memory": "value is prose -- OK for pinned rows; vectors live in Supabase/Vectorize.",
    "otlp_traces": "Retention policy on attributes_json; sample or export to observability backend.",
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
            c.name in ("body", "content_markdown", "value", "output_json", "result_json", "payload_json")
            for c in self.columns
        ):
            return "Large text/JSON in D1 -- prefer R2 pointer + vector lanes for search."
        return None


def _pick_bloat_columns(cols: list[tuple[str, str]], max_cols: int = 8) -> list[str]:
    out: list[str] = []
    for name, typ in cols:
        if typ not in ("TEXT", "BLOB", "JSON"):
            continue
        if SKIP_COL_RE.search(name):
            continue
        if BLOAT_COL_RE.search(name):
            out.append(name)
    return out[:max_cols]


def _scan_table(adapter: D1Adapter, table: str, analyze_text: bool) -> TableStat:
    stat = TableStat(name=table)
    try:
        cols = adapter.table_columns(table)
        bloat_cols = _pick_bloat_columns(cols) if analyze_text else []
        if bloat_cols:
            parts = [f'SUM(LENGTH(COALESCE("{c}", \'\'))) AS "{c}"' for c in bloat_cols]
            max_parts = [f'MAX(LENGTH(COALESCE("{c}", \'\'))) AS "m_{c}"' for c in bloat_cols]
            sql = f'SELECT COUNT(*) AS rc, {", ".join(parts + max_parts)} FROM "{table}"'
            row = adapter.query(sql)[0]
            stat.row_count = int(row.get("rc") or 0)
            for c in bloat_cols:
                b = int(row.get(c) or 0)
                if b:
                    stat.columns.append(ColStat(name=c, bytes=b, max_len=int(row.get(f"m_{c}") or 0)))
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


def _flag_suspicious(stats: list[TableStat]) -> list[dict[str, Any]]:
    flags: list[dict[str, Any]] = []
    ranked = sorted(stats, key=lambda s: s.text_bytes or s.est_bytes, reverse=True)
    total_text = sum(s.text_bytes for s in stats) or 1
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
        if reasons:
            flags.append({
                "table": s.name, "rows": s.row_count, "est_bytes": est,
                "est_human": _fmt_bytes(est),
                "severity": "high" if est >= 5_000_000 or s.row_count >= 100_000 else "medium",
                "reasons": reasons, "hint": s.rollup_hint,
            })
    return flags


def _render_markdown(stats: list[TableStat], db_size, mode, table_total, scanned) -> str:
    lines = [
        "# D1 bloat audit",
        "",
        f"- **Generated:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        f"- **Reported DB size:** {db_size or 'unknown'}",
        f"- **Mode:** {mode}",
        f"- **Tables in DB:** {table_total}",
        f"- **Tables scanned:** {scanned}",
        f"- **Estimated text payload (scanned):** {_fmt_bytes(sum(s.text_bytes for s in stats))}",
        "",
        "> D1 remote has no `dbstat`. Sizes are `SUM(LENGTH(text_col))` estimates.",
        "",
        "## Top tables by estimated text bytes",
        "",
        "| Rank | Table | Rows | Text est. | Top columns | Rollup hint |",
        "|------|-------|------|-----------|-------------|-------------|",
    ]
    ranked = sorted(stats, key=lambda s: s.est_bytes, reverse=True)
    for i, s in enumerate(ranked[:40], 1):
        top_cols = ", ".join(
            f"`{c.name}` {_fmt_bytes(c.bytes)}"
            for c in sorted(s.columns, key=lambda x: x.bytes, reverse=True)[:3]
        )
        hint = (s.rollup_hint or "").replace("|", "/")[:80]
        err = f" ⚠ {s.error}" if s.error else ""
        lines.append(
            f"| {i} | `{s.name}` | {s.row_count:,} | {_fmt_bytes(s.text_bytes or s.est_bytes)} | "
            f"{top_cols or '—'} | {hint or '—'}{err} |"
        )
    lines.append("")
    return "\n".join(lines)


def run(tool_input: ToolInput) -> ToolResult:
    started = start_timer()
    p = tool_input.params
    mode = tool_input.mode if tool_input.mode in ("quick", "full") else "quick"
    prefix = p.get("prefix")
    workers = int(p.get("workers", 6))
    count_only = bool(p.get("count_only", False))
    top = int(p.get("top", 40))

    output_dir = tool_input.output_path()

    try:
        adapter = D1Adapter.from_env(
            db_name=p.get("db"), wrangler_config=p.get("config"), repo_root=p.get("repo_root")
        )
        all_tables = adapter.list_tables()
        if prefix:
            tables = [t for t in all_tables if t.lower().startswith(prefix.lower())]
        elif mode == "quick":
            tables = [t for t in all_tables if QUICK_TABLE_RE.match(t)]
        else:
            tables = all_tables

        db_size = adapter.database_size()
        stats: list[TableStat] = []
        with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
            futures = {pool.submit(_scan_table, adapter, t, not count_only): t for t in tables}
            for fut in as_completed(futures):
                try:
                    stats.append(fut.result())
                except Exception as e:  # noqa: BLE001
                    stats.append(TableStat(name=futures[fut], error=str(e)))

        stats.sort(key=lambda s: s.est_bytes, reverse=True)
        flags = _flag_suspicious(stats)
        md = _render_markdown(stats, db_size, mode, len(all_tables), len(tables))

        artifacts: list[str] = []
        json_payload = {
            "database": adapter.db_name,
            "database_size": db_size,
            "mode": mode,
            "tables_total": len(all_tables),
            "tables_scanned": len(tables),
            "estimated_text_bytes": sum(s.text_bytes for s in stats),
            "flags": flags,
            "tables": [
                {**{k: v for k, v in asdict(s).items() if k != "columns"},
                 "columns": [asdict(c) for c in s.columns], "rollup_hint": s.rollup_hint}
                for s in stats[:top]
            ],
        }
        if output_dir:
            output_dir.mkdir(parents=True, exist_ok=True)
            (output_dir / "d1-bloat.md").write_text(md, encoding="utf-8")
            (output_dir / "d1-bloat.json").write_text(
                __import__("json").dumps(json_payload, indent=2), encoding="utf-8"
            )
            artifacts = [str(output_dir / "d1-bloat.md"), str(output_dir / "d1-bloat.json")]

        result = ToolResult(
            ok=True, tool=TOOL_NAME, mode=mode, request_id=tool_input.request_id,
            started_at=started, finished_at=start_timer(),
            summary=f"Scanned {len(tables)}/{len(all_tables)} tables, {len(flags)} flagged.",
            data=json_payload, artifacts=artifacts,
        )
    except D1AdapterError as e:
        result = ToolResult(
            ok=False, tool=TOOL_NAME, mode=mode, request_id=tool_input.request_id,
            started_at=started, finished_at=start_timer(),
            summary="D1 adapter error", error=str(e),
        )

    write_receipt(result, output_dir)
    return result
