"""Unit tests for repository.scan_bloat — no network."""
from __future__ import annotations

from pathlib import Path

from agentsam_sdk.repository import scan_bloat
from agentsam_sdk.runtime.contract import ToolInput


def test_scan_ranks_by_size(tmp_path: Path) -> None:
    (tmp_path / "small.js").write_text("x=1\n", encoding="utf-8")
    (tmp_path / "big.js").write_text("x=1\n" * 500, encoding="utf-8")
    (tmp_path / "skip.py").write_text("print(1)\n" * 200, encoding="utf-8")
    rows = scan_bloat.scan(tmp_path)
    assert len(rows) == 2
    assert rows[0]["path"] == "big.js"
    assert rows[0]["size_bytes"] > rows[1]["size_bytes"]


def test_run_json_envelope(tmp_path: Path) -> None:
    (tmp_path / "a.ts").write_text("// " + ("n" * 2000) + "\n", encoding="utf-8")
    result = scan_bloat.run(
        ToolInput(
            mode="read-only",
            params={"root": str(tmp_path), "top": 5, "min_kb": 0},
        )
    )
    assert result.ok
    assert result.tool == "repository.scan_bloat"
    assert result.data["file_count"] == 1
    assert result.data["files"][0]["path"] == "a.ts"
