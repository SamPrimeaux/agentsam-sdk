"""Shared tool contract for agentsam_sdk Python tools.

Every tool accepts ToolInput-shaped kwargs (or builds them from CLI) and
returns ToolResult with a receipt. Default mode is read-only.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class ToolInput:
    """Common input envelope. Tool-specific fields go in `params`."""

    mode: str = "read-only"
    repo_root: str | None = None
    output_format: str = "json"  # json | markdown | table
    params: dict[str, Any] = field(default_factory=dict)

    def assert_read_only(self) -> None:
        if self.mode not in ("read-only", "readonly", "ro"):
            raise ValueError(
                f"mode={self.mode!r} not allowed; this tool is read-only"
            )


@dataclass
class ToolResult:
    ok: bool
    tool: str
    data: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    receipt: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def make_receipt(
    *,
    tool: str,
    started_unix: int,
    finished_unix: int,
    mode: str = "read-only",
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "tool": tool,
        "mode": mode,
        "started_unix": int(started_unix),
        "finished_unix": int(finished_unix),
        "duration_ms": max(0, (int(finished_unix) - int(started_unix)) * 1000),
    }
    if extra:
        out.update(extra)
    return out
