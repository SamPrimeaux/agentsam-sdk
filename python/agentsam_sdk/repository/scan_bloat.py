"""agentsam_sdk.repository.scan_bloat — per-file source bloat inventory.

Companion to repository.inventory (category rollups). This tool lists the
largest runtime source files under a root (default: cwd) with size / lines /
est. tokens — for refactor targeting and agent context budgeting.

Read-only. No secrets, no D1.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from agentsam_sdk.runtime.contract import ToolInput, ToolResult, write_receipt, start_timer

TOOL_NAME = "repository.scan_bloat"

DEFAULT_EXTS = frozenset({".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs"})
DEFAULT_EXCLUDE_DIRS = frozenset(
    {
        "node_modules",
        ".git",
        "dist",
        "build",
        ".wrangler",
        ".next",
        ".turbo",
        "coverage",
        ".cache",
        "out",
        ".vercel",
        "__pycache__",
        ".venv",
        "venv",
    }
)
CHARS_PER_TOKEN = 3.7


def scan(
    root: str | Path,
    *,
    exts: set[str] | frozenset[str] = DEFAULT_EXTS,
    exclude_dirs: set[str] | frozenset[str] = DEFAULT_EXCLUDE_DIRS,
) -> list[dict[str, Any]]:
    """Walk root and return file stats sorted by size_bytes desc."""
    root_path = Path(root).resolve()
    results: list[dict[str, Any]] = []
    if root_path.is_file():
        # Allow a single-file root for smoke tests
        if root_path.suffix in exts:
            results.append(_stat_file(root_path, root_path.parent))
        return results

    for dirpath, dirnames, filenames in os.walk(root_path):
        dirnames[:] = [
            d for d in dirnames if d not in exclude_dirs and not d.startswith(".")
        ]
        for fname in filenames:
            ext = os.path.splitext(fname)[1]
            if ext not in exts:
                continue
            fpath = Path(dirpath) / fname
            try:
                results.append(_stat_file(fpath, root_path))
            except (OSError, UnicodeDecodeError):
                continue
    results.sort(key=lambda r: r["size_bytes"], reverse=True)
    return results


def _stat_file(fpath: Path, root: Path) -> dict[str, Any]:
    size_bytes = fpath.stat().st_size
    content = fpath.read_text(encoding="utf-8", errors="replace")
    line_count = content.count("\n") + (1 if content else 0)
    return {
        "path": str(fpath.relative_to(root)),
        "size_bytes": size_bytes,
        "size_kb": round(size_bytes / 1024, 1),
        "lines": line_count,
        "est_tokens": round(size_bytes / CHARS_PER_TOKEN),
        "bytes_per_line": round(size_bytes / line_count, 1) if line_count else 0,
    }


def human_table(files: list[dict[str, Any]], *, scanned: int, total_kb: float, total_tokens: int) -> str:
    """Plain-text table for terminal / markdown CLI mode."""
    if not files:
        return "No files matched.\n"
    path_w = min(max(len(r["path"]) for r in files), 70)
    header = f"{'SIZE':>9}  {'LINES':>7}  {'~TOKENS':>8}  {'B/LINE':>7}  PATH"
    lines = [header, "-" * len(header)]
    for r in files:
        path = r["path"] if len(r["path"]) <= path_w else "…" + r["path"][-(path_w - 1) :]
        lines.append(
            f"{r['size_kb']:>8.1f}KB  {r['lines']:>7}  {r['est_tokens']:>8}  "
            f"{r['bytes_per_line']:>7}  {path}"
        )
    lines.append("-" * len(header))
    lines.append(
        f"Scanned {scanned} files, {total_kb:.1f}KB total, ~{total_tokens:,} est. tokens"
    )
    return "\n".join(lines) + "\n"


def run(tool_input: ToolInput) -> ToolResult:
    started = start_timer()
    p = tool_input.params
    root = str(p.get("root") or p.get("repo_root") or ".")
    top = max(1, int(p.get("top", 30)))
    min_kb = float(p.get("min_kb", 0) or 0)
    ext_raw = p.get("ext") or ",".join(sorted(DEFAULT_EXTS))
    exts = {
        e if str(e).startswith(".") else f".{e}"
        for e in str(ext_raw).split(",")
        if str(e).strip()
    }
    exclude = set(DEFAULT_EXCLUDE_DIRS)
    extra = p.get("exclude") or ""
    if extra:
        exclude |= {d.strip() for d in str(extra).split(",") if d.strip()}

    try:
        all_files = scan(root, exts=exts, exclude_dirs=exclude)
        filtered = [r for r in all_files if r["size_kb"] >= min_kb][:top]
        total_kb = round(sum(r["size_kb"] for r in all_files), 1)
        total_tokens = sum(r["est_tokens"] for r in all_files)
        data = {
            "ok": True,
            "root": str(Path(root).resolve()),
            "file_count": len(all_files),
            "total_kb": total_kb,
            "total_est_tokens": total_tokens,
            "files": filtered,
        }
        artifacts: list[str] = []
        output_dir = tool_input.output_path()
        if output_dir:
            output_dir.mkdir(parents=True, exist_ok=True)
            out_json = output_dir / "scan-bloat.json"
            out_json.write_text(json.dumps(data, indent=2), encoding="utf-8")
            artifacts.append(str(out_json))

        result = ToolResult(
            ok=True,
            tool=TOOL_NAME,
            mode=tool_input.mode or "read-only",
            request_id=tool_input.request_id,
            started_at=started,
            finished_at=start_timer(),
            summary=(
                f"Scanned {len(all_files)} files, {total_kb}KB total, "
                f"top {len(filtered)} ≥{min_kb}KB."
            ),
            data=data,
            artifacts=artifacts,
        )
    except Exception as e:  # noqa: BLE001 — surfaced in ToolResult
        result = ToolResult(
            ok=False,
            tool=TOOL_NAME,
            mode=tool_input.mode or "read-only",
            request_id=tool_input.request_id,
            started_at=started,
            finished_at=start_timer(),
            summary="scan_bloat failed",
            error=str(e)[:500],
        )

    write_receipt(result, tool_input.output_path())
    return result
