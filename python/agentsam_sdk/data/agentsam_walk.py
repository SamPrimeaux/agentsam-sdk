"""agentsam_sdk.data.agentsam_walk -- condensed port of
scripts/walk_agentsam_tables.py (+ schema-focus of scripts/d1_schema_audit.py).

Walks every `agentsam_%` sqlite_master object: schema, indexes, foreign
keys, row count, freshness (via *_at / *_at_epoch columns if present), and
groups tables into capability buckets by name-substring heuristics.

Note: this is a condensed re-implementation, not a byte-for-byte port of the
801-line original -- see docs/gaps.md for what's folded in vs deferred
(duplicate-detection heuristics, per-feature markdown chunking into db/*.md
files a la d1_schema_audit.py are deferred to a follow-up pass).
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from agentsam_sdk.data.d1_adapter import D1Adapter, D1AdapterError
from agentsam_sdk.runtime.contract import ToolInput, ToolResult, write_receipt, start_timer

TOOL_NAME = "data.agentsam_walk"

CAPABILITY_RULES: dict[str, list[str]] = {
    "agent_run_spine": ["run", "runs", "execution", "executions", "session", "sessions", "step", "steps", "message", "messages"],
    "model_routing": ["model", "catalog", "routing", "route", "routes", "arm", "arms", "requirement", "provider", "prompt"],
    "tools_commands_mcp": ["tool", "tools", "mcp", "command", "commands", "skill", "skills", "invocation", "chain", "script", "scripts"],
    "workflow_dag": ["workflow", "workflows", "node", "nodes", "edge", "edges", "approval", "approvals", "task", "tasks"],
    "memory_rag": ["memory", "embedding", "vector", "chunk", "chunks", "document", "documents", "rag"],
    "observability": ["log", "logs", "trace", "traces", "metric", "metrics", "health", "analytics", "otlp", "error", "errors"],
    "cms_content": ["cms_", "page", "pages", "content", "nav", "template"],
    "security_policy": ["policy", "policies", "guardrail", "trusted", "origin", "auth", "credential"],
}


@dataclass
class TableWalk:
    name: str
    columns: list[dict] = field(default_factory=list)
    indexes: list[dict] = field(default_factory=list)
    foreign_keys: list[dict] = field(default_factory=list)
    row_count: int = 0
    has_freshness_col: bool = False
    capability: str = "uncategorized"
    error: Optional[str] = None
    flags: list[str] = field(default_factory=list)


def _capability_for(table: str) -> str:
    """Score by total matched-keyword *length*, not match count -- a single
    specific hit ("workflow") should outrank two generic ones ("run", "runs").
    """
    lname = table.lower()
    best, best_score = "uncategorized", 0
    for cap, keywords in CAPABILITY_RULES.items():
        score = sum(len(kw) for kw in keywords if kw in lname)
        if score > best_score:
            best, best_score = cap, score
    return best


def _walk_table(adapter: D1Adapter, table: str) -> TableWalk:
    tw = TableWalk(name=table, capability=_capability_for(table))
    try:
        cols = adapter.table_columns(table)
        tw.columns = [{"name": n, "type": t} for n, t in cols]
        tw.indexes = adapter.table_indexes(table)
        tw.foreign_keys = adapter.foreign_keys(table)
        tw.row_count = adapter.row_count(table)
        tw.has_freshness_col = any(
            n.lower() in ("updated_at", "created_at", "updated_at_epoch", "created_at_epoch")
            for n, _ in cols
        )
        if tw.row_count == 0:
            tw.flags.append("empty")
        if not tw.has_freshness_col:
            tw.flags.append("no_freshness_column")
        if not tw.indexes and tw.row_count > 1000:
            tw.flags.append("no_index_high_row_count")
    except D1AdapterError as e:
        tw.error = str(e)[:200]
    except Exception as e:  # noqa: BLE001
        tw.error = str(e)[:200]
    return tw


def _render_markdown(walks: list[TableWalk], prefix: str) -> str:
    lines = [
        f"# agentsam walk -- `{prefix}%` objects",
        "",
        f"- **Generated:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        f"- **Tables walked:** {len(walks)}",
        "",
        "## By capability",
        "",
    ]
    by_cap: dict[str, list[TableWalk]] = {}
    for w in walks:
        by_cap.setdefault(w.capability, []).append(w)
    for cap in sorted(by_cap):
        lines.append(f"### {cap} ({len(by_cap[cap])})")
        lines.append("")
        lines.append("| Table | Rows | Indexes | FKs | Flags |")
        lines.append("|-------|------|---------|-----|-------|")
        for w in sorted(by_cap[cap], key=lambda x: x.row_count, reverse=True):
            flags = ", ".join(w.flags) or "-"
            err = f" ⚠ {w.error}" if w.error else ""
            lines.append(f"| `{w.name}` | {w.row_count:,} | {len(w.indexes)} | {len(w.foreign_keys)} | {flags}{err} |")
        lines.append("")
    return "\n".join(lines)


def run(tool_input: ToolInput) -> ToolResult:
    started = start_timer()
    tool_input.assert_read_only()
    p = tool_input.params
    prefix = p.get("prefix", "agentsam_")
    output_dir = tool_input.output_path()

    try:
        adapter = D1Adapter.from_env(
            db_name=p.get("db"), wrangler_config=p.get("config"), repo_root=p.get("repo_root")
        )
        tables = adapter.list_tables(like=f"{prefix}%")
        walks = [_walk_table(adapter, t) for t in tables]
        md = _render_markdown(walks, prefix)
        json_payload = {
            "prefix": prefix,
            "database": adapter.db_name,
            "table_count": len(walks),
            "tables": [asdict(w) for w in walks],
        }

        artifacts: list[str] = []
        if output_dir:
            output_dir.mkdir(parents=True, exist_ok=True)
            (output_dir / "agentsam-walk.md").write_text(md, encoding="utf-8")
            (output_dir / "agentsam-walk.json").write_text(
                __import__("json").dumps(json_payload, indent=2), encoding="utf-8"
            )
            artifacts = [str(output_dir / "agentsam-walk.md"), str(output_dir / "agentsam-walk.json")]

        result = ToolResult(
            ok=True, tool=TOOL_NAME, mode=tool_input.mode, request_id=tool_input.request_id,
            started_at=started, finished_at=start_timer(),
            summary=f"Walked {len(walks)} `{prefix}%` tables.",
            data=json_payload, artifacts=artifacts,
        )
    except D1AdapterError as e:
        result = ToolResult(
            ok=False, tool=TOOL_NAME, mode=tool_input.mode, request_id=tool_input.request_id,
            started_at=started, finished_at=start_timer(),
            summary="D1 adapter error", error=str(e),
        )

    write_receipt(result, output_dir)
    return result
