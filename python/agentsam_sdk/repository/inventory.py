"""agentsam_sdk.repository.inventory — repo file counts + sizes by category.

Port of the battle-tested scanner (formerly scripts/repo-size-inventory.py on
main). Read-only. No secrets, no D1.

JSON is jq-friendly. Examples (host `jq` required for the pipe examples):

  agentsam repository inventory --repo-root .. --format json \\
    | jq '.data.categories[] | select(.id==\"docs\")'

  agentsam repository inventory --repo-root .. --output-dir /tmp/inv --format json
  jq '.totals' /tmp/inv/repository-inventory.json
"""
from __future__ import annotations

import json
import os
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from agentsam_sdk.runtime.contract import ToolInput, ToolResult, write_receipt, start_timer

TOOL_NAME = "repository.inventory"

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
        "build",
    }
)

# First path segment → category id
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
    ("agentsam_sdk_pkg", ("agentsam-sdk", "agentsam_sdk")),
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
    "agentsam_sdk_pkg": "agentsam-sdk package",
    "root_misc": "Repo root files",
    "other": "Other paths",
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
    ext_counts: Counter = Counter()
    ext_bytes: dict[str, int] = defaultdict(int)
    top_level: Counter = Counter()
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

        top = rel.parts[0] if rel.parts else "."
        top_level[top] += 1

        ext = path.suffix.lower() or "(none)"
        ext_counts[ext] += 1
        if by_ext:
            ext_bytes[ext] += size

        if size >= min_bytes:
            largest.append((size, str(rel).replace("\\", "/"), cat))

    largest.sort(key=lambda t: t[0], reverse=True)
    top_files = [
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
        "tool": TOOL_NAME,
        "repo_root": str(root),
        "file_total": file_total,
        "totals": {
            "file_count": file_total,
            "bytes": byte_total,
            "human": human_bytes(byte_total),
            "categories": len(categories),
        },
        "skipped_dir_names": sorted(skip_names),
        "categories": categories,
        "largest_files": top_files,
        # Backward-compatible stub fields (counts only)
        "by_extension": dict(ext_counts.most_common(40)),
        "by_top_level_dir": dict(top_level.most_common(40)),
    }
    if by_ext:
        out["by_extension_detail"] = [
            {
                "ext": k,
                "file_count": ext_counts[k],
                "bytes": ext_bytes[k],
                "human": human_bytes(ext_bytes[k]),
            }
            for k in sorted(ext_bytes, key=lambda e: ext_bytes[e], reverse=True)
        ]
    return out


def _markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Repository inventory",
        "",
        f"- **repo_root:** `{report['repo_root']}`",
        f"- **files:** {report['file_total']:,}",
        f"- **bytes:** {report['totals']['human']} ({report['totals']['bytes']:,})",
        "",
        "## By category",
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
    lines += ["", "## By extension (top)", "", "| Ext | Count |", "|-----|-------|"]
    for e, c in list(report.get("by_extension", {}).items())[:30]:
        lines.append(f"| `{e}` | {c} |")
    return "\n".join(lines) + "\n"


def run(tool_input: ToolInput) -> ToolResult:
    started = start_timer()
    p = tool_input.params
    repo_root = Path(p.get("repo_root", ".")).expanduser().resolve()
    output_dir = tool_input.output_path()

    if not repo_root.exists():
        result = ToolResult(
            ok=False,
            tool=TOOL_NAME,
            mode=tool_input.mode,
            request_id=tool_input.request_id,
            started_at=started,
            finished_at=start_timer(),
            summary=f"repo_root does not exist: {repo_root}",
            error="repo_root_not_found",
        )
        write_receipt(result, output_dir)
        return result

    skip = set(p.get("skip_dir_names") or DEFAULT_SKIP_DIR_NAMES)
    if p.get("include_node_modules"):
        skip.discard("node_modules")
    if p.get("include_venvs"):
        skip.discard(".venv")
        skip.discard("venv")
        skip.discard(".venv_agentsam")
    if p.get("include_git"):
        skip.discard(".git")
    if p.get("include_dist"):
        skip.discard("dist")
        skip.discard(".wrangler")
        skip.discard("build")

    report = scan(
        repo_root,
        skip_names=frozenset(skip),
        top_n=int(p.get("top", 20)),
        min_bytes=int(p.get("min_bytes", 0)),
        follow_symlinks=bool(p.get("follow_symlinks", False)),
        by_ext=bool(p.get("by_ext", True)),
    )

    artifacts: list[str] = []
    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)
        json_path = output_dir / "repository-inventory.json"
        md_path = output_dir / "repository-inventory.md"
        json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        md_path.write_text(_markdown(report), encoding="utf-8")
        artifacts = [str(json_path), str(md_path)]

    result = ToolResult(
        ok=True,
        tool=TOOL_NAME,
        mode=tool_input.mode,
        request_id=tool_input.request_id,
        started_at=started,
        finished_at=start_timer(),
        summary=(
            f"{report['file_total']} files · {report['totals']['human']} "
            f"under {repo_root}"
        ),
        data=report,
        artifacts=artifacts,
    )
    write_receipt(result, output_dir)
    return result
