"""agentsam_sdk.repository.inspect — repo walk (size + dates) + optional content dupes.

Reusable library: no print(), no sys.exit(), no hardcoded tenant/workspace ids.
Root path is always an explicit parameter.

  from agentsam_sdk.repository.inspect import walk_repo, summarize, find_dupes, build_report

CLI:
  python3 scripts/repo_inspect.py --text
  python3 -m agentsam_sdk.repository.inspect --json --dupes
  agentsam repository inspect --repo-root . --format json --dupes
"""
from __future__ import annotations

import hashlib
import os
import subprocess
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

SCHEMA_VERSION = 1
TOOL_NAME = "repository.inspect"
HASH_CHUNK = 1024 * 1024

DEFAULT_SKIP_DIR_NAMES = frozenset(
    {
        ".git",
        ".scratch",
        ".venv",
        ".venv_agentsam",
        "venv",
        "node_modules",
        "__pycache__",
        ".pytest_cache",
        ".mypy_cache",
        ".ruff_cache",
        ".turbo",
        ".next",
        "dist",
        "build",
        "coverage",
        ".wrangler",
        "vendor",
        "captures",
        "architecture-map",
    }
)


class RepoRootError(Exception):
    """Raised when a git toplevel cannot be resolved."""


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_from_unix(ts: float | int | None) -> str | None:
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(float(ts), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (OSError, OverflowError, ValueError):
        return None


def parse_since(raw: str | None, *, now_unix: int | None = None) -> int | None:
    """Return min mtime_unix, or None for no filter. Raises ValueError on bad input."""
    if raw is None or str(raw).strip() == "":
        return None
    s = str(raw).strip().lower()
    now = int(now_unix if now_unix is not None else utc_now().timestamp())
    if s.endswith("d") and s[:-1].isdigit():
        return now - int(s[:-1]) * 86400
    if s.endswith("h") and s[:-1].isdigit():
        return now - int(s[:-1]) * 3600
    if s.isdigit():
        return now - int(s)
    raise ValueError(f"bad --since {raw!r} (use Nd, Nh, or seconds)")


def find_repo_root(start: Path | None = None) -> Path:
    """Resolve git toplevel from start (default: cwd). Raises RepoRootError."""
    here = (start or Path.cwd()).resolve()
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=here,
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        if out:
            return Path(out).resolve()
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    for p in [here, *here.parents]:
        if (p / ".git").exists():
            return p
    raise RepoRootError(f"not inside a git repository (start={here})")


def git_head(repo_root: Path) -> dict[str, Any]:
    def _run(*args: str) -> str:
        try:
            return subprocess.check_output(
                ["git", *args],
                cwd=repo_root,
                text=True,
                stderr=subprocess.DEVNULL,
            ).strip()
        except (subprocess.CalledProcessError, FileNotFoundError):
            return ""

    sha = _run("rev-parse", "HEAD")
    branch = _run("branch", "--show-current") or _run("rev-parse", "--abbrev-ref", "HEAD")
    subject = _run("log", "-1", "--format=%s")
    author_unix = _run("log", "-1", "--format=%at")
    author_unix_i = int(author_unix) if author_unix.isdigit() else None
    return {
        "branch": branch or None,
        "head_sha": sha if len(sha) == 40 else (sha or None),
        "head_subject": subject or None,
        "head_author_unix": author_unix_i,
        "head_author_iso": iso_from_unix(author_unix_i),
    }


def file_times(st: os.stat_result) -> dict[str, Any]:
    mtime = int(st.st_mtime)
    ctime = int(st.st_ctime)
    birth = None
    birth_raw = getattr(st, "st_birthtime", None)
    if birth_raw is not None:
        try:
            birth = int(birth_raw)
        except (TypeError, ValueError):
            birth = None
    return {
        "size_bytes": int(st.st_size),
        "mtime_unix": mtime,
        "mtime_iso": iso_from_unix(mtime),
        "ctime_unix": ctime,
        "ctime_iso": iso_from_unix(ctime),
        "birth_unix": birth,
        "birth_iso": iso_from_unix(birth),
    }


def walk_repo(
    root: Path,
    *,
    skip_dir_names: Iterable[str] | None = None,
    respect_gitignore: bool = True,
    follow_symlinks: bool = False,
    errors: list[dict[str, str]] | None = None,
) -> list[dict[str, Any]]:
    """Walk root and return file rows (path relative to root, sizes, dates).

    respect_gitignore=True applies DEFAULT_SKIP_DIR_NAMES (heavy/generated dirs).
    Full .gitignore parsing is not implemented — pass skip_dir_names to customize.
    Non-fatal OSErrors append to errors when provided; otherwise they are skipped.
    """
    root = Path(root).resolve()
    skip = set(DEFAULT_SKIP_DIR_NAMES if respect_gitignore else ())
    if skip_dir_names is not None:
        skip |= {str(s) for s in skip_dir_names}

    rows: list[dict[str, Any]] = []
    err_sink = errors if errors is not None else []

    for dirpath, dirnames, filenames in os.walk(root, topdown=True, followlinks=follow_symlinks):
        dirnames[:] = sorted(
            d for d in dirnames if d not in skip and not d.startswith(".cache")
        )
        base = Path(dirpath)
        for name in filenames:
            if name == ".DS_Store":
                continue
            path = base / name
            try:
                if path.is_symlink() and not follow_symlinks:
                    continue
                st = path.stat()
            except OSError as e:
                err_sink.append({"path": str(path), "error": f"stat:{e}"})
                continue
            if not path.is_file():
                continue
            try:
                rel = path.relative_to(root).as_posix()
            except ValueError as e:
                err_sink.append({"path": str(path), "error": f"relative:{e}"})
                continue
            top = rel.split("/", 1)[0] if "/" in rel else "(root)"
            ext = path.suffix.lower() or "(none)"
            rows.append(
                {
                    "path": rel,
                    "top_dir": top,
                    "ext": ext,
                    **file_times(st),
                }
            )
    return rows


def summarize(
    files: list[dict[str, Any]],
    *,
    recent_n: int = 50,
    largest_n: int = 30,
    since_unix: int | None = None,
) -> dict[str, Any]:
    """Rollups + recent/largest slices from walk_repo rows."""
    by_dir: dict[str, dict[str, int]] = defaultdict(lambda: {"files": 0, "bytes": 0})
    total_bytes = 0
    for f in files:
        total_bytes += int(f.get("size_bytes") or 0)
        bucket = by_dir[str(f.get("top_dir") or "(root)")]
        bucket["files"] += 1
        bucket["bytes"] += int(f.get("size_bytes") or 0)

    filtered = files
    if since_unix is not None:
        filtered = [f for f in files if int(f.get("mtime_unix") or 0) >= since_unix]

    recent = sorted(filtered, key=lambda r: (-int(r.get("mtime_unix") or 0), r.get("path") or ""))[
        : max(1, recent_n)
    ]
    largest = sorted(files, key=lambda r: (-int(r.get("size_bytes") or 0), r.get("path") or ""))[
        : max(1, largest_n)
    ]
    top_dirs = sorted(
        ({"top_dir": k, "files": v["files"], "bytes": v["bytes"]} for k, v in by_dir.items()),
        key=lambda r: (-r["bytes"], r["top_dir"]),
    )
    return {
        "file_count": len(files),
        "total_bytes": total_bytes,
        "since_unix": since_unix,
        "recent_count": len(recent),
        "by_top_dir": top_dirs,
        "recent": recent,
        "largest": largest,
    }


def sha256_file(path: Path, *, chunk_size: int = HASH_CHUNK) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def find_dupes(
    files: list[dict[str, Any]],
    *,
    repo_root: Path,
    errors: list[dict[str, str]] | None = None,
    warnings: list[str] | None = None,
) -> list[dict[str, Any]]:
    """True content duplicates: same size_bytes + SHA-256.

    Returns groups sorted by size_bytes descending. Each group:
      size_bytes, sha256, count, wasted_bytes (= size * (count-1)), paths[]
    """
    root = Path(repo_root).resolve()
    err_sink = errors if errors is not None else []
    warn_sink = warnings if warnings is not None else []

    by_size: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for f in files:
        by_size[int(f.get("size_bytes") or 0)].append(f)

    groups: list[dict[str, Any]] = []
    for size, bucket in by_size.items():
        if len(bucket) < 2:
            continue
        by_hash: dict[str, list[str]] = defaultdict(list)
        for f in bucket:
            rel = str(f.get("path") or "")
            abs_path = root / rel
            try:
                digest = sha256_file(abs_path)
            except OSError as e:
                msg = f"hash skip {rel}: {e}"
                warn_sink.append(msg)
                err_sink.append({"path": rel, "error": f"hash:{e}"})
                continue
            by_hash[digest].append(rel)

        for digest, paths in by_hash.items():
            if len(paths) < 2:
                continue
            paths_sorted = sorted(paths)
            count = len(paths_sorted)
            groups.append(
                {
                    "size_bytes": size,
                    "sha256": digest,
                    "count": count,
                    "wasted_bytes": size * (count - 1),
                    "paths": paths_sorted,
                }
            )

    groups.sort(key=lambda g: (-int(g["size_bytes"]), -int(g["count"]), g["sha256"]))
    return groups


def build_report(
    repo_root: Path,
    *,
    recent_n: int = 50,
    largest_n: int = 30,
    since_unix: int | None = None,
    include_all: bool = False,
    include_dupes: bool = False,
    skip_dir_names: Iterable[str] | None = None,
    respect_gitignore: bool = True,
) -> dict[str, Any]:
    """Full jq-stable report dict (summary/recent/largest keys preserved)."""
    root = Path(repo_root).resolve()
    walk_errors: list[dict[str, str]] = []
    files = walk_repo(
        root,
        skip_dir_names=skip_dir_names,
        respect_gitignore=respect_gitignore,
        errors=walk_errors,
    )
    rollup = summarize(
        files,
        recent_n=recent_n,
        largest_n=largest_n,
        since_unix=since_unix,
    )
    now = int(utc_now().timestamp())
    report: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "tool": "repo_inspect",
        "repo_root": str(root),
        "repo_name": root.name,
        "generated_at_unix": now,
        "generated_at_iso": iso_from_unix(now),
        "git": git_head(root),
        "summary": {
            "file_count": rollup["file_count"],
            "total_bytes": rollup["total_bytes"],
            "since_unix": rollup["since_unix"],
            "recent_count": rollup["recent_count"],
            "by_top_dir": rollup["by_top_dir"],
        },
        "recent": rollup["recent"],
        "largest": rollup["largest"],
        "jq": {
            "summary": ".summary",
            "recent": ".recent[] | {path, size_bytes, mtime_iso}",
            "largest": ".largest[] | {path, size_bytes}",
            "by_dir": ".summary.by_top_dir[]",
            "changed_today": f".recent[] | select(.mtime_unix >= {now - 86400})",
            "duplicates": ".duplicates[] | {size_bytes, wasted_bytes, count, paths}",
        },
    }
    if include_all:
        report["files"] = sorted(files, key=lambda r: r["path"])
    if walk_errors:
        report["walk_errors"] = walk_errors

    if include_dupes:
        hash_errors: list[dict[str, str]] = []
        hash_warnings: list[str] = []
        dupes = find_dupes(files, repo_root=root, errors=hash_errors, warnings=hash_warnings)
        report["duplicates"] = dupes
        report["summary"]["duplicate_groups"] = len(dupes)
        report["summary"]["duplicate_wasted_bytes"] = sum(int(g["wasted_bytes"]) for g in dupes)
        if hash_warnings:
            report["hash_warnings"] = hash_warnings
        if hash_errors:
            report["hash_errors"] = hash_errors
    return report


def render_text(report: dict[str, Any]) -> str:
    g = report.get("git") or {}
    s = report.get("summary") or {}
    lines = [
        f"repo_inspect  {report.get('repo_name')}  @ {report.get('generated_at_iso')}",
        f"git  {g.get('branch') or '?'}  {str(g.get('head_sha') or '')[:12]}  {g.get('head_subject') or ''}",
        f"files  {int(s.get('file_count') or 0):,}   bytes  {int(s.get('total_bytes') or 0):,}",
        "",
        "recent (mtime):",
    ]
    for f in (report.get("recent") or [])[:25]:
        lines.append(f"  {f.get('mtime_iso')}  {int(f.get('size_bytes') or 0):>10,}  {f.get('path')}")
    lines.append("")
    lines.append("largest:")
    for f in (report.get("largest") or [])[:15]:
        lines.append(f"  {int(f.get('size_bytes') or 0):>12,}  {f.get('path')}")
    lines.append("")
    lines.append("top dirs:")
    for d in (s.get("by_top_dir") or [])[:12]:
        lines.append(
            f"  {int(d.get('bytes') or 0):>12,}  {int(d.get('files') or 0):>6} files  {d.get('top_dir')}"
        )
    dupes = report.get("duplicates")
    if isinstance(dupes, list):
        lines.append("")
        wasted = int(s.get("duplicate_wasted_bytes") or 0)
        lines.append(f"duplicates: {len(dupes)} group(s), wasted {wasted:,} bytes")
        for gdup in dupes[:20]:
            lines.append(
                f"  size={int(gdup.get('size_bytes') or 0):,}  "
                f"count={int(gdup.get('count') or 0)}  "
                f"wasted={int(gdup.get('wasted_bytes') or 0):,}  "
                f"sha256={str(gdup.get('sha256') or '')[:12]}…"
            )
            for pth in (gdup.get("paths") or [])[:8]:
                lines.append(f"    {pth}")
    lines.append("")
    lines.append("jq: python3 scripts/repo_inspect.py --json | jq '.recent[0:10]'")
    lines.append("dupes: python3 scripts/repo_inspect.py --json --dupes | jq '.duplicates'")
    return "\n".join(lines) + "\n"


def main_cli(argv: list[str] | None = None) -> int:
    """Argparse entry for `python -m agentsam_sdk.repository.inspect` and shims."""
    import argparse
    import json
    import sys

    p = argparse.ArgumentParser(description="Canonical repo file inspect (size + dates)")
    p.add_argument("--repo-root", default=None, help="Repo root (default: git toplevel)")
    p.add_argument("--json", action="store_true", help="Emit JSON (default when not --text)")
    p.add_argument("--text", action="store_true", help="Human briefing on stdout")
    p.add_argument("--recent", type=int, default=50, help="How many recent files (mtime)")
    p.add_argument("--largest", type=int, default=30, help="How many largest files")
    p.add_argument("--since", default=None, help="Only recent[] after window (e.g. 7d, 24h)")
    p.add_argument("--all", action="store_true", help="Include full files[] array")
    p.add_argument(
        "--dupes",
        action="store_true",
        help="SHA-256 content duplicate groups (expensive; off by default)",
    )
    p.add_argument(
        "--out",
        default=None,
        help="Write JSON to path (also prints text/json to stdout per flags)",
    )
    args = p.parse_args(argv)

    try:
        repo = Path(args.repo_root).resolve() if args.repo_root else find_repo_root()
    except RepoRootError as e:
        print(str(e), file=sys.stderr)
        return 2

    try:
        since_unix = parse_since(args.since)
    except ValueError as e:
        print(str(e), file=sys.stderr)
        return 2

    report = build_report(
        repo,
        recent_n=max(1, args.recent),
        largest_n=max(1, args.largest),
        since_unix=since_unix,
        include_all=bool(args.all),
        include_dupes=bool(args.dupes),
    )

    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(report, indent=2, sort_keys=False) + "\n", encoding="utf-8")

    if args.dupes:
        for w in report.get("hash_warnings") or []:
            print(f"warning: {w}", file=sys.stderr)

    if args.text and not args.json:
        sys.stdout.write(render_text(report))
    else:
        json.dump(report, sys.stdout, indent=2, sort_keys=False)
        sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main_cli())
