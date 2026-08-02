"""Shared tool contract: ToolInput / ToolResult / receipts.

HARD LAW (see inneranimalmedia AGENTS.md): never hardcode identity, repo,
workspace, or tenant values anywhere in this package -- not in shipped code,
patches, examples, or fallback defaults. All identity-shaped values
(database names, account ids, wrangler config paths) must come from the
caller (CLI flag) or the environment. Generic placeholders only in examples
(e.g. "owner/repo-name", "$D1_DATABASE_NAME").

Every tool module in agentsam_sdk exposes a `run(tool_input: ToolInput) ->
ToolResult` function (or is wrapped to look like one from cli.py). Modes are
read-only by default -- any tool that can write must accept an explicit
`write=True` and should say so loudly in its ToolResult.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Optional


HARD_LAW_NOTE = (
    "Never hardcode identity/repo/workspace/tenant values. Use env vars or "
    "explicit CLI args; fall back to generic placeholders only in docs."
)


@dataclass
class ToolInput:
    """Normalized input every agentsam_sdk tool accepts.

    mode: tool-specific sub-mode (e.g. "quick" | "full" for d1_bloat)
    params: tool-specific keyword args
    output_dir: where json/markdown output + receipt get written
    write: True only for tools that mutate state; default False (read-only)
    """

    mode: str = "default"
    params: dict[str, Any] = field(default_factory=dict)
    output_dir: Optional[str] = None
    write: bool = False
    request_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])

    def output_path(self) -> Optional[Path]:
        return Path(self.output_dir) if self.output_dir else None


@dataclass
class ToolResult:
    """Normalized output every agentsam_sdk tool returns."""

    ok: bool
    tool: str
    mode: str
    request_id: str
    started_at: float
    finished_at: float
    summary: str
    data: dict[str, Any] = field(default_factory=dict)
    artifacts: list[str] = field(default_factory=list)
    error: Optional[str] = None

    @property
    def duration_s(self) -> float:
        return round(self.finished_at - self.started_at, 3)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["duration_s"] = self.duration_s
        return d


def new_receipt_path(output_dir: Path, tool: str, request_id: str) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir / f"receipt-{tool}-{request_id}.json"


def write_receipt(result: ToolResult, output_dir: Optional[Path]) -> Optional[str]:
    """Write a receipt (contract rule: every tool call gets one). Returns path or None."""
    if output_dir is None:
        return None
    path = new_receipt_path(output_dir, result.tool, result.request_id)
    payload = result.to_dict()
    payload["written_at_unixepoch"] = int(time.time())
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    return str(path)


def require_env(*names: str) -> dict[str, str]:
    """Fetch required env vars; raise with a clear message (never invent values)."""
    missing = [n for n in names if not os.environ.get(n)]
    if missing:
        raise RuntimeError(
            f"Missing required env var(s): {', '.join(missing)}. "
            f"{HARD_LAW_NOTE}"
        )
    return {n: os.environ[n] for n in names}


def start_timer() -> float:
    return time.time()
