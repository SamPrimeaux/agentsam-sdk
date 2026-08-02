"""
agentsam_sdk.repository.inventory — repo file counts + sizes by category.

Read-only. No secrets, no D1. Safe on any checkout.

Examples:
  python3 -m agentsam_sdk.repository.inventory
  python3 -m agentsam_sdk.repository.inventory --json
  python3 -m agentsam_sdk.repository.inventory --root /path/to/repo --top 25
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from agentsam_sdk.runtime.contract import ToolInput, ToolResult, make_receipt

TOOL_ID = "agentsam_sdk.repository.inventory"

DEFAULT_SKIP_DIR_NAMES = frozenset(
    {
        ".git",
        "node_modules",
        ".wrangler",
        "dist",
        "coverage",
        "__pycache__",
        ".venv",
        "venv",
        ".venv_agentsam",
        ".turbo",
        ".next",
        ".cache",
        ".scratch",
    }
)

# Top-level (or first path segment) → category id
CATEGORY_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("worker_src", ("src",)),
    ("dashboard", ("dashboard",)),
    ("migrations", ("migrations",)),
    ("docs", ("docs",)),
    ("plans", ("plans",)),
    ("scripts", ("scripts",)),
    ("tests", ("tests", "test", "e2e")),
    ("services", ("services",)),
    ("supabase", ("supabase",)),
    ("product_manifests", ("product-manifests",)),
    ("static_assets", ("static", "public", "assets")),
    ("artifacts", ("artifacts", ".scratch")),
    ("vendor", ("vendor",)),
    ("tools", ("tools",)),
    ("local_venvs", (".venv_agentsam", ".venv", "venv")),
    ("cms", ("cms-editor", "studio-cms")),
    ("config_cursor", (".cursor", ".agents", ".claude", ".codex", ".githooks")),
    ("ci", (".github",)),
]

CATEGORY_LABELS = {
    "worker_src": "Worker src/",
    "dashboard": "Dashboard SPA",
    "migrations": "D1 migrations",
    "docs": "Docs",
    "plans": "Plans",
    "scripts": "Scripts",
    "tests": "Tests",
    "services": "Services / satellites",
    "supabase": "Supabase",
    "product_manifests": "Product manifests",
    "static_assets": "Static / public assets",
    "artifacts": "Artifacts / scratch dumps",
    "vendor": "Vendor copies",
    "tools": "Tools / offline utilities",
    "local_venvs": "Local Python venvs",
    "cms": "CMS editor packages",
    "config_cursor": "Cursor / agent config",
    "ci": "CI (.github)",
    "root_misc": "Repo root files",
    "other": "Other paths",
    "skipped": "Skipped dirs (counted only if --count-skipped)",
}


@dataclass
class Bucket:
    id: str
    label: str
    file_count: int = 0
    bytes: int = 0
    top_files: list[dict] = field(default_factory=list)

    def add(self, size: int) -> None:
        self.file_count += 1
        self.bytes += size


def human_bytes(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    units = ["KiB", "MiB", "GiB", "TiB"]
    x = float(n)
    for u in units:
        x /= 1024.0
        if x < 1024.0:
            return f"{x:.2f} {u}"
    return f"{x:.2f} PiB"


def find_repo_root(explicit: str | None) -> Path:
    if explicit:
        p = Path(explicit).expanduser().resolve()
        if not p.is_dir():
            raise SystemExit(f"--root not a directory: {p}")
        return p
    cwd = Path.cwd().resolve()
    for candidate in (cwd, *cwd.parents):
        if (candidate / ".git").exists() and (candidate / "package.json").exists():
            return candidate
        if (candidate / ".git").exists() and candidate.name in (
            "inneranimalmedia",
            "agentsam-sdk",
        ):
            return candidate
    return cwd


def categorize(rel: Path) -> str:
    parts = rel.parts
    if not parts:
        return "root_misc"
    first = parts[0]
    for cat_id, prefixes in CATEGORY_RULES:
        if first in prefixes:
            return cat_id
    if len(parts) == 1:
        return "root_misc"
    return "other"


def should_skip_dir(name: str, skip_names: frozenset[str]) -> bool:
    return name in skip_names or name.endswith(".bak")


def iter_files(
    root: Path,
    skip_names: frozenset[str],
    follow_symlinks: bool,
) -> Iterable[tuple[Path, int]]:
    for dirpath, dirnames, filenames in os.walk(
        root, topdown=True, followlinks=follow_symlinks
    ):
        dirnames[:] = [d for d in dirnames if not should_skip_dir(d, skip_names)]
        base = Path(dirpath)
        for name in filenames:
            if name.endswith(".bak") or name.endswith(".pyc"):
                continue
            path = base / name
            try:
                if path.is_symlink() and not follow_symlinks:
                    continue
                st = path.stat()
            except (OSError, ValueError):
                continue
            if not path.is_file():
                continue
            yield path, int(st.st_size)


def scan(
    root: Path,
    *,
    skip_names: frozenset[str],
    top_n: int,
    min_bytes: int,
    follow_symlinks: bool,
    by_ext: bool,
) -> dict[str, Any]:
    buckets: dict[str, Bucket] = {}
    ext_counts: dict[str, dict[str, int]] = defaultdict(
        lambda: {"file_count": 0, "bytes": 0}
    )
    largest: list[tuple[int, str, str]] = []

    def bucket(cat_id: str) -> Bucket:
        if cat_id not in buckets:
            buckets[cat_id] = Bucket(
                id=cat_id, label=CATEGORY_LABELS.get(cat_id, cat_id)
            )
        return buckets[cat_id]

    file_total = 0
    byte_total = 0

    for path, size in iter_files(root, skip_names, follow_symlinks):
        try:
            rel = path.relative_to(root)
        except ValueError:
            continue
        cat = categorize(rel)
        bucket(cat).add(size)
        file_total += 1
        byte_total += size

        if by_ext:
            ext = path.suffix.lower() or "(none)"
            ext_counts[ext]["file_count"] += 1
            ext_counts[ext]["bytes"] += size

        if size >= min_bytes:
            largest.append((size, str(rel).replace("\\", "/"), cat))

    largest.sort(key=lambda t: t[0], reverse=True)
    top = [
        {"path": p, "bytes": s, "human": human_bytes(s), "category": c}
        for s, p, c in largest[: max(0, top_n)]
    ]

    cats = sorted(buckets.values(), key=lambda b: b.bytes, reverse=True)
    categories = [
        {
            "id": b.id,
            "label": b.label,
            "file_count": b.file_count,
            "bytes": b.bytes,
            "human": human_bytes(b.bytes),
            "pct_bytes": round(100.0 * b.bytes / byte_total, 2) if byte_total else 0.0,
        }
        for b in cats
    ]

    out: dict[str, Any] = {
        "ok": True,
        "tool": TOOL_ID,
        "root": str(root),
        "totals": {
            "file_count": file_total,
            "bytes": byte_total,
            "human": human_bytes(byte_total),
            "categories": len(categories),
        },
        "skipped_dir_names": sorted(skip_names),
        "categories": categories,
        "largest_files": top,
    }
    if by_ext:
        exts = [
            {
                "ext": k,
                "file_count": v["file_count"],
                "bytes": v["bytes"],
                "human": human_bytes(v["bytes"]),
            }
            for k, v in sorted(
                ext_counts.items(), key=lambda kv: kv[1]["bytes"], reverse=True
            )
        ]
        out["by_extension"] = exts
    return out


def run_inventory(inp: ToolInput | None = None, **kwargs: Any) -> ToolResult:
    """Contract entry: ToolInput → ToolResult (read-only)."""
    started = int(time.time())
    if inp is None:
        inp = ToolInput(
            mode=kwargs.pop("mode", "read-only"),
            repo_root=kwargs.pop("repo_root", None),
            output_format=kwargs.pop("output_format", "json"),
            params=kwargs.pop("params", None) or kwargs,
        )
    else:
        # merge leftover kwargs into params for convenience
        if kwargs:
            merged = dict(inp.params)
            merged.update(kwargs)
            inp.params = merged

    try:
        inp.assert_read_only()
    except ValueError as e:
        finished = int(time.time())
        return ToolResult(
            ok=False,
            tool=TOOL_ID,
            error=str(e),
            receipt=make_receipt(
                tool=TOOL_ID, started_unix=started, finished_unix=finished, mode=inp.mode
            ),
        )

    params = inp.params
    skip = set(params.get("skip_dir_names") or DEFAULT_SKIP_DIR_NAMES)
    if params.get("include_node_modules"):
        skip.discard("node_modules")
    if params.get("include_venvs"):
        skip.discard(".venv")
        skip.discard("venv")
        skip.discard(".venv_agentsam")
    if params.get("include_git"):
        skip.discard(".git")
    if params.get("include_dist"):
        skip.discard("dist")
        skip.discard(".wrangler")

    root = find_repo_root(inp.repo_root or params.get("root"))
    report = scan(
        root,
        skip_names=frozenset(skip),
        top_n=int(params.get("top", 20)),
        min_bytes=int(params.get("min_bytes", 0)),
        follow_symlinks=bool(params.get("follow_symlinks", False)),
        by_ext=bool(params.get("by_ext", False)),
    )
    finished = int(time.time())
    receipt = make_receipt(
        tool=TOOL_ID,
        started_unix=started,
        finished_unix=finished,
        mode=inp.mode,
        extra={"root": str(root), "file_count": report["totals"]["file_count"]},
    )
    report["receipt"] = receipt
    return ToolResult(ok=True, tool=TOOL_ID, data=report, receipt=receipt)


def print_table(report: dict[str, Any]) -> None:
    t = report["totals"]
    print(f"Root: {report['root']}")
    print(
        f"Totals: {t['file_count']:,} files · {t['human']} "
        f"({t['bytes']:,} bytes) · {t['categories']} categories"
    )
    print(f"Skipped dir names: {', '.join(report['skipped_dir_names'])}")
    print()
    print(f"{'Category':<28} {'Files':>8} {'Size':>12} {'%':>7}")
    print("-" * 58)
    for c in report["categories"]:
        print(
            f"{c['label']:<28} {c['file_count']:>8,} {c['human']:>12} {c['pct_bytes']:>6.1f}%"
        )
    if report.get("largest_files"):
        print()
        print(f"Largest files (top {len(report['largest_files'])}):")
        for f in report["largest_files"]:
            print(f"  {f['human']:>10}  [{f['category']}]  {f['path']}")
    if report.get("by_extension"):
        print()
        print("By extension (top 20):")
        for e in report["by_extension"][:20]:
            print(f"  {e['ext']:<12} {e['file_count']:>8,}  {e['human']:>12}")


def report_to_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Repo inventory (`{TOOL_ID}`)",
        "",
        f"- **Root:** `{report['root']}`",
        f"- **Totals:** {report['totals']['file_count']:,} files · {report['totals']['human']}",
        "",
        "| Category | Files | Size | % |",
        "|---|---:|---:|---:|",
    ]
    for c in report["categories"]:
        lines.append(
            f"| {c['label']} | {c['file_count']:,} | {c['human']} | {c['pct_bytes']:.1f}% |"
        )
    if report.get("largest_files"):
        lines += ["", "## Largest files", ""]
        for f in report["largest_files"]:
            lines.append(f"- `{f['path']}` — {f['human']} (`{f['category']}`)")
    return "\n".join(lines) + "\n"


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=f"{TOOL_ID} — file counts + sizes by logical category."
    )
    p.add_argument("--root", help="Repo root (default: detect from cwd / git)")
    p.add_argument("--json", action="store_true", help="Emit JSON (pipe to jq)")
    p.add_argument(
        "--markdown",
        action="store_true",
        help="Emit markdown table",
    )
    p.add_argument("--top", type=int, default=20, help="N largest files (0 to omit)")
    p.add_argument(
        "--min-bytes",
        type=int,
        default=0,
        help="Only consider files >= N bytes for largest list",
    )
    p.add_argument("--by-ext", action="store_true", help="Also roll up by extension")
    p.add_argument(
        "--include-node-modules",
        action="store_true",
        help="Do not skip node_modules",
    )
    p.add_argument(
        "--include-venvs",
        action="store_true",
        help="Do not skip .venv / .venv_agentsam / venv",
    )
    p.add_argument("--include-git", action="store_true", help="Do not skip .git")
    p.add_argument(
        "--include-dist",
        action="store_true",
        help="Do not skip dist / .wrangler",
    )
    p.add_argument(
        "--follow-symlinks",
        action="store_true",
        help="Follow symlinks when walking",
    )
    p.add_argument(
        "--with-receipt",
        action="store_true",
        help="Include ToolResult receipt wrapper in JSON output",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)
    result = run_inventory(
        ToolInput(
            mode="read-only",
            repo_root=args.root,
            output_format="json"
            if args.json
            else ("markdown" if args.markdown else "table"),
            params={
                "top": args.top,
                "min_bytes": args.min_bytes,
                "by_ext": args.by_ext,
                "include_node_modules": args.include_node_modules,
                "include_venvs": args.include_venvs,
                "include_git": args.include_git,
                "include_dist": args.include_dist,
                "follow_symlinks": args.follow_symlinks,
            },
        )
    )
    if not result.ok:
        print(result.error or "inventory failed", file=sys.stderr)
        return 1

    report = result.data
    if args.json:
        payload = result.to_dict() if args.with_receipt else report
        json.dump(payload, sys.stdout, indent=2)
        sys.stdout.write("\n")
    elif args.markdown:
        sys.stdout.write(report_to_markdown(report))
    else:
        print_table(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
