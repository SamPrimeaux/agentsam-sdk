#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path
from typing import Iterable, List, Set


DEFAULT_FORBIDDEN_PATH_PATTERNS = [
    r"(^|/)\.agentsam(/|$)",
    r"\.sqlite(?:3)?$",
    r"\.db$",
    r"brandops/(?:media-inventory|derivative-plan|sprint-receipt)\.json$",
    r"workspace-fixtures/",
    r"fixtures/brands/",
    r"donor",
    r"archive-source",
]

DEFAULT_FORBIDDEN_CONTENT_PATTERNS = [
    r"/Users/[^/\s]+/",
    r"/Volumes/[^/\s]+/",
    r"file:///",
]


def load_extra_terms(path: Path | None) -> List[str]:
    if not path:
        return []
    values = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            values.append(line)
    return values


def npm_pack_listing(package_dir: Path) -> List[str]:
    p = subprocess.run(
        ["npm", "pack", "--dry-run", "--json"],
        cwd=str(package_dir),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if p.returncode != 0:
        raise SystemExit(
            "npm pack --dry-run failed:\n"
            + p.stderr.strip()
        )

    data = json.loads(p.stdout)
    if not data:
        raise SystemExit("npm pack returned no package data.")

    files = data[0].get("files", [])
    return [str(x.get("path", "")) for x in files if x.get("path")]


def scan_file_content(package_dir: Path, rel_paths: Iterable[str], extra_terms: List[str]):
    failures = []
    content_rx = [re.compile(p) for p in DEFAULT_FORBIDDEN_CONTENT_PATTERNS]

    for rel in rel_paths:
        path = package_dir / rel
        if not path.is_file():
            continue
        if path.suffix.lower() in {
            ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif",
            ".ico", ".icns", ".woff", ".woff2", ".ttf", ".otf",
            ".zip", ".gz", ".tar", ".pdf", ".mp4", ".mov", ".webm",
        }:
            continue

        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        for rx in content_rx:
            if rx.search(text):
                failures.append(f"forbidden local path content in {rel}: {rx.pattern}")

        for term in extra_terms:
            if term in text:
                failures.append(f"private forbidden term found in {rel}: {term!r}")

    return failures


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Fail if npm pack would include local/operator/build-state material."
    )
    ap.add_argument("--package-dir", required=True)
    ap.add_argument(
        "--forbid-file",
        help="Optional local text file containing extra forbidden strings, one per line.",
    )
    args = ap.parse_args()

    package_dir = Path(args.package_dir).resolve()
    extra_terms = load_extra_terms(
        Path(args.forbid_file).resolve() if args.forbid_file else None
    )

    packed = npm_pack_listing(package_dir)
    path_rx = [re.compile(p, re.I) for p in DEFAULT_FORBIDDEN_PATH_PATTERNS]

    failures: List[str] = []
    for rel in packed:
        for rx in path_rx:
            if rx.search(rel):
                failures.append(f"forbidden packed path: {rel} ({rx.pattern})")

    failures.extend(scan_file_content(package_dir, packed, extra_terms))

    if failures:
        print("FAIL: npm package would leak local/operator material")
        for failure in sorted(set(failures)):
            print(" -", failure)
        return 1

    print("PASS: npm pack leak guard")
    print(f"packed files checked: {len(packed)}")
    if extra_terms:
        print(f"private forbidden terms checked: {len(extra_terms)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
