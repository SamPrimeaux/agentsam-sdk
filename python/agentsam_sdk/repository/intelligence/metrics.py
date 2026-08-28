"""Explainable directory and language metrics derived from repository evidence."""
from __future__ import annotations

import math
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable


def _directory_keys(rel_path: str, *, max_depth: int) -> list[str]:
    parts = Path(rel_path).parts[:-1]
    if not parts:
        return ["."]
    return ["/".join(parts[:depth]) for depth in range(1, min(len(parts), max_depth) + 1)]


def aggregate_directories(
    files: list[dict[str, Any]],
    churn: dict[str, dict[str, int]],
    *,
    max_depth: int = 4,
) -> list[dict[str, Any]]:
    stats: dict[str, dict[str, int]] = defaultdict(
        lambda: {"files": 0, "bytes": 0, "lines": 0, "source_files": 0, "commits": 0, "changed_lines": 0}
    )
    for row in files:
        change = churn.get(row["path"], {})
        for key in _directory_keys(row["path"], max_depth=max_depth):
            bucket = stats[key]
            bucket["files"] += 1
            bucket["bytes"] += int(row.get("size_bytes") or 0)
            if row.get("lines") is not None:
                bucket["source_files"] += 1
                bucket["lines"] += int(row.get("lines") or 0)
            bucket["changed_lines"] += int(change.get("changed_lines") or 0)
            bucket["commits"] += int(change.get("commits") or 0)
    return sorted(
        ({"path": path, **values} for path, values in stats.items()),
        key=lambda row: (row["path"].count("/"), row["path"]),
    )


def _normalize(rows: list[dict[str, Any]], key: str) -> dict[str, float]:
    values = [math.log1p(max(0, int(row.get(key) or 0))) for row in rows]
    ceiling = max(values, default=0.0)
    if ceiling <= 0:
        return {row["path"]: 0.0 for row in rows}
    return {
        row["path"]: math.log1p(max(0, int(row.get(key) or 0))) / ceiling
        for row in rows
    }


def score_directories(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Attach relative 0-100 density, pressure, and stability heuristics."""
    if not rows:
        return []
    lines_n = _normalize(rows, "lines")
    files_n = _normalize(rows, "files")
    churn_n = _normalize(rows, "changed_lines")
    touches_n = _normalize(rows, "commits")
    scored: list[dict[str, Any]] = []
    for row in rows:
        path = row["path"]
        density = 0.65 * lines_n[path] + 0.35 * files_n[path]
        activity = 0.75 * churn_n[path] + 0.25 * touches_n[path]
        pressure = 0.40 * lines_n[path] + 0.60 * activity
        scored.append(
            {
                **row,
                "density_score": round(100.0 * density, 1),
                "pressure_score": round(100.0 * pressure, 1),
                "stability_score": round(100.0 * (1.0 - activity), 1),
            }
        )
    return scored


def language_summary(files: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    agg: dict[str, dict[str, int]] = defaultdict(lambda: {"files": 0, "lines": 0, "bytes": 0})
    for row in files:
        language = row.get("language")
        if not language:
            continue
        bucket = agg[str(language)]
        bucket["files"] += 1
        bucket["bytes"] += int(row.get("size_bytes") or 0)
        bucket["lines"] += int(row.get("lines") or 0)
    return sorted(
        ({"language": language, **values} for language, values in agg.items()),
        key=lambda row: (-row["lines"], -row["bytes"], row["language"]),
    )
