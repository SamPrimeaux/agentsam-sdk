#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Dict, List

from common import package_jsons, load_package_name, repo_rel, walk_files, write_json


TARGET_NAMES = [
    "agentsam-brand",
    "agentsam-assets-core",
    "agentsam-content",
    "agentsam-content-studio",
    "agentsam-workbench",
    "agentsam-sections",
    "agentsam-browser-surface",
    "agentsam-shell-kit",
    "agentsam-nav",
    "agentsam-scoring",
    "agentsam-contracts",
    "agentsam-work-graph",
    "media-kit",
]

UI_TERMS = {
    "gallery": re.compile(r"\b(gallery|masonry|grid)\b", re.I),
    "inspector": re.compile(r"\b(inspector|drawer|side.?panel)\b", re.I),
    "selection": re.compile(r"\b(selection|selectedItems|multi.?select)\b", re.I),
    "drag_reorder": re.compile(r"\b(drag|drop|sortable|reorder)\b", re.I),
    "media_preview": re.compile(r"\b(preview|thumbnail|object-fit|focal)\b", re.I),
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--out", default=".agentsam/brandops/repo-audit.json")
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    packages: List[Dict] = []

    for pj in package_jsons(repo):
        name = load_package_name(pj)
        rel = repo_rel(pj.parent, repo)
        packages.append({"name": name, "path": rel})

    target_hits = {}
    for target in TARGET_NAMES:
        target_hits[target] = [
            p for p in packages
            if target in (p["name"] or "") or target in p["path"]
        ]

    interesting_roots = [
        repo / "apps" / "ecommerce-cms-agentsam",
        repo / "packages",
        repo / "apps" / "local-studio",
    ]
    ui_evidence = {k: [] for k in UI_TERMS}

    allowed_ext = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".css", ".html", ".md"}
    for root in interesting_roots:
        if not root.exists():
            continue
        for path in walk_files(root):
            if path.suffix.lower() not in allowed_ext:
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            for key, rx in UI_TERMS.items():
                if rx.search(text):
                    ui_evidence[key].append(repo_rel(path, repo))

    for key in ui_evidence:
        ui_evidence[key] = sorted(set(ui_evidence[key]))[:120]

    nested_media_kit = repo / "apps" / "ecommerce-cms-agentsam" / "shared" / "media-kit"

    report = {
        "repo": str(repo),
        "package_count": len(packages),
        "target_package_hits": target_hits,
        "nested_media_kit": {
            "path": repo_rel(nested_media_kit, repo),
            "exists": nested_media_kit.exists(),
            "package_json_exists": (nested_media_kit / "package.json").exists(),
        },
        "ui_evidence": ui_evidence,
        "decision_guardrails": [
            "Do not create a competing media package if shared/media-kit is real and sufficient.",
            "Do not create a new collection-surface package until existing UI primitives are audited.",
            "Reuse inspector/gallery/selection mechanics where already implemented.",
        ],
    }

    out = repo / args.out if not Path(args.out).is_absolute() else Path(args.out)
    write_json(out, report)

    print(f"repo: {repo}")
    print(f"packages: {len(packages)}")
    print(f"nested media-kit: {'YES' if nested_media_kit.exists() else 'NO'}")
    for target in TARGET_NAMES:
        print(f"{target}: {len(target_hits[target])} hit(s)")
    print(f"wrote: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
