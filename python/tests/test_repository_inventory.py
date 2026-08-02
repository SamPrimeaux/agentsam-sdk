"""Unit tests for agentsam_sdk.repository.inventory (no live D1 / network)."""

from __future__ import annotations

from pathlib import Path

from agentsam_sdk.repository.inventory import (
    categorize,
    find_repo_root,
    human_bytes,
    run_inventory,
    scan,
)
from agentsam_sdk.runtime.contract import ToolInput


def test_human_bytes():
    assert human_bytes(500) == "500 B"
    assert "KiB" in human_bytes(2048)


def test_categorize_prefixes():
    assert categorize(Path("docs/foo.md")) == "docs"
    assert categorize(Path("dashboard/App.tsx")) == "dashboard"
    assert categorize(Path("README.md")) == "root_misc"
    assert categorize(Path("weird/thing.bin")) == "other"


def test_scan_fixture_tree(tmp_path: Path):
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "a.md").write_text("hello" * 20)
    (tmp_path / "scripts").mkdir()
    (tmp_path / "scripts" / "x.py").write_text("print(1)\n")
    (tmp_path / "node_modules" / "pkg").mkdir(parents=True)
    (tmp_path / "node_modules" / "pkg" / "big.js").write_text("x" * 10_000)

    report = scan(
        tmp_path,
        skip_names=frozenset({"node_modules", ".git"}),
        top_n=5,
        min_bytes=0,
        follow_symlinks=False,
        by_ext=True,
    )
    assert report["ok"] is True
    assert report["totals"]["file_count"] == 2
    ids = {c["id"] for c in report["categories"]}
    assert "docs" in ids
    assert "scripts" in ids
    # node_modules skipped — only the two source files
    assert report["totals"]["bytes"] < 10_000
    assert any(e["ext"] == ".md" for e in report["by_extension"])


def test_run_inventory_contract(tmp_path: Path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "index.js").write_text("export {}\n")
    result = run_inventory(
        ToolInput(mode="read-only", repo_root=str(tmp_path), params={"top": 3})
    )
    assert result.ok is True
    assert result.tool == "agentsam_sdk.repository.inventory"
    assert result.receipt["started_unix"] >= 0
    assert result.receipt["finished_unix"] >= result.receipt["started_unix"]
    assert result.data["totals"]["file_count"] == 1


def test_read_only_enforced(tmp_path: Path):
    result = run_inventory(ToolInput(mode="write", repo_root=str(tmp_path)))
    assert result.ok is False
    assert "read-only" in (result.error or "")


def test_find_repo_root_explicit(tmp_path: Path):
    assert find_repo_root(str(tmp_path)) == tmp_path.resolve()
