"""Git identity and recent churn evidence."""
from __future__ import annotations

import subprocess
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


def run_git(repo_root: Path, *args: str) -> str:
    try:
        return subprocess.check_output(
            ["git", *args], cwd=repo_root, text=True, stderr=subprocess.DEVNULL
        )
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return ""


def git_identity(repo_root: Path) -> dict[str, Any]:
    sha = run_git(repo_root, "rev-parse", "HEAD").strip()
    branch = run_git(repo_root, "branch", "--show-current").strip()
    status = run_git(repo_root, "status", "--porcelain=v1")
    return {
        "is_git": bool(sha),
        "branch": branch or None,
        "head_sha": sha if len(sha) == 40 else (sha or None),
        "dirty": bool(status.strip()) if sha else None,
        "changed_paths": len([line for line in status.splitlines() if line.strip()]) if sha else None,
    }


def git_churn(repo_root: Path, *, days: int = 30) -> dict[str, dict[str, int]]:
    """Aggregate commit touches and numstat changes per file for a recent window."""
    if days <= 0:
        return {}
    output = run_git(
        repo_root,
        "log",
        f"--since={int(days)} days ago",
        "--numstat",
        "--format=@@%H",
        "--no-renames",
    )
    if not output:
        return {}

    commits_by_path: dict[str, set[str]] = defaultdict(set)
    additions: Counter[str] = Counter()
    deletions: Counter[str] = Counter()
    current_commit = ""
    for line in output.splitlines():
        if line.startswith("@@"):
            current_commit = line[2:].strip()
            continue
        parts = line.split("\t", 2)
        if len(parts) != 3:
            continue
        added_raw, deleted_raw, path = parts
        if added_raw == "-" or deleted_raw == "-":
            continue
        try:
            added = int(added_raw)
            deleted = int(deleted_raw)
        except ValueError:
            continue
        if current_commit:
            commits_by_path[path].add(current_commit)
        additions[path] += added
        deletions[path] += deleted

    paths = set(commits_by_path) | set(additions) | set(deletions)
    return {
        path: {
            "commits": len(commits_by_path[path]),
            "additions": int(additions[path]),
            "deletions": int(deletions[path]),
            "changed_lines": int(additions[path] + deletions[path]),
        }
        for path in paths
    }
