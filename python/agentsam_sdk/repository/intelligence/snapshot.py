"""Build and render a current repository intelligence snapshot."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from .discovery import active_paths, detect_manifests, file_records
from .git import git_churn, git_identity
from .metrics import aggregate_directories, language_summary, score_directories

SCHEMA_VERSION = 1
TOOL_NAME = "repository.intelligence"


def build_snapshot(
    repo_root: str | Path,
    *,
    churn_days: int = 30,
    top: int = 20,
    max_directory_depth: int = 4,
) -> dict[str, Any]:
    root = Path(repo_root).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        raise FileNotFoundError(f"repo_root_not_found:{root}")

    paths, discovery = active_paths(root)
    files = file_records(root, paths)
    churn = git_churn(root, days=churn_days)
    directories = score_directories(
        aggregate_directories(files, churn, max_depth=max_directory_depth)
    )

    hot_files = [{**row, **churn[row["path"]]} for row in files if row["path"] in churn]
    hot_files.sort(
        key=lambda row: (-int(row["changed_lines"]), -int(row["commits"]), row["path"])
    )
    pressure_points = sorted(
        directories,
        key=lambda row: (-float(row["pressure_score"]), -int(row["lines"]), row["path"]),
    )[: max(1, top)]
    top_level = [row for row in directories if "/" not in row["path"]]
    top_level.sort(key=lambda row: (-int(row["bytes"]), row["path"]))

    return {
        "schema_version": SCHEMA_VERSION,
        "tool": TOOL_NAME,
        "generated_at_unix": int(time.time()),
        "repo_root": str(root),
        "repo_name": root.name,
        "discovery": discovery,
        "git": git_identity(root),
        "summary": {
            "file_count": len(files),
            "source_file_count": sum(1 for row in files if row.get("lines") is not None),
            "total_bytes": sum(int(row.get("size_bytes") or 0) for row in files),
            "total_lines": sum(int(row.get("lines") or 0) for row in files),
            "churn_days": int(churn_days),
            "changed_file_count": len(churn),
        },
        "languages": language_summary(files),
        "manifests": detect_manifests(files),
        "top_level": top_level,
        "pressure_points": pressure_points,
        "hot_files": hot_files[: max(1, top)],
        "directories": directories,
        "score_model": {
            "density": "65% normalized LOC + 35% normalized file count",
            "activity": "75% normalized changed lines + 25% normalized commit touches",
            "pressure": "40% normalized LOC + 60% activity",
            "stability": "100 - activity",
            "note": "Relative heuristics within one snapshot; not quality grades.",
        },
    }


def render_text(snapshot: dict[str, Any]) -> str:
    summary = snapshot.get("summary") or {}
    git = snapshot.get("git") or {}
    lines = [
        f"AgentSam Repository Intelligence — {snapshot.get('repo_name')}",
        f"branch {git.get('branch') or '?'}  sha {str(git.get('head_sha') or '')[:12] or '?'}  discovery {snapshot.get('discovery')}",
        (
            f"files {int(summary.get('file_count') or 0):,}  "
            f"source {int(summary.get('source_file_count') or 0):,}  "
            f"LOC {int(summary.get('total_lines') or 0):,}  "
            f"changed({int(summary.get('churn_days') or 0)}d) {int(summary.get('changed_file_count') or 0):,}"
        ),
        "",
        "Top-level density:",
    ]
    for row in (snapshot.get("top_level") or [])[:12]:
        lines.append(
            f"  {row['path']:<28} files={row['files']:>5}  LOC={row['lines']:>8}  "
            f"density={row['density_score']:>5.1f}  pressure={row['pressure_score']:>5.1f}  stability={row['stability_score']:>5.1f}"
        )
    lines.extend(["", "Pressure points:"])
    for row in (snapshot.get("pressure_points") or [])[:12]:
        lines.append(
            f"  {row['pressure_score']:>5.1f}  {row['path']:<36} "
            f"LOC={row['lines']:>8}  churn={row['changed_lines']:>8}  touches={row['commits']:>5}"
        )
    lines.extend(["", "Languages:"])
    for row in (snapshot.get("languages") or [])[:12]:
        lines.append(
            f"  {row['language']:<16} files={row['files']:>5}  LOC={row['lines']:>8}  bytes={row['bytes']:>10}"
        )
    return "\n".join(lines) + "\n"
