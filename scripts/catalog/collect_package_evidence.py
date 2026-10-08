#!/usr/bin/env python3
"""Collect deterministic evidence about every package.

This does not classify product strategy. It gathers facts an agent/human can review.
"""

from __future__ import annotations

import argparse, json, re
try:
    import tomllib
except ModuleNotFoundError:
    raise SystemExit("Catalog evidence tooling requires Python 3.11+; try python3.14 or python3.12.")
from collections import Counter
from pathlib import Path

TEXT_EXTS = {
    ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript", ".jsx": "javascript",
    ".rs": "rust", ".go": "go", ".py": "python",
    ".swift": "swift", ".kt": "kotlin", ".java": "java"
}
SKIP_DIRS = {"node_modules", "dist", "build", "target", ".git", ".next", "coverage"}


def load_json(path):
    return json.loads(path.read_text())


def load_toml(path):
    return tomllib.loads(path.read_text())


def first_readme(package: Path):
    for name in ("README.md", "readme.md", "README.MD"):
        p = package / name
        if p.exists():
            return p
    return None


def readme_summary(path: Path | None, repo: Path):
    if not path:
        return {"path": None, "title": None, "summary": None, "headings": []}
    text = path.read_text(errors="replace")
    lines = [x.rstrip() for x in text.splitlines()]
    title = next((re.sub(r"^#\s*", "", x).strip() for x in lines if x.startswith("# ")), None)
    headings = [re.sub(r"^#{1,6}\s*", "", x).strip() for x in lines if re.match(r"^#{1,6}\s+", x)][:20]

    paragraphs, buf = [], []
    for line in lines:
        if line.startswith("#") or line.startswith("```"):
            if buf:
                paragraphs.append(" ".join(buf).strip())
                buf = []
            continue
        if not line.strip():
            if buf:
                paragraphs.append(" ".join(buf).strip())
                buf = []
            continue
        if not line.lstrip().startswith(("-", "*", ">", "|")):
            buf.append(line.strip())
    if buf:
        paragraphs.append(" ".join(buf).strip())

    summary = next((p for p in paragraphs if len(p) >= 30), None)
    if summary and len(summary) > 600:
        summary = summary[:597] + "..."
    return {"path": path.relative_to(repo).as_posix(), "title": title, "summary": summary, "headings": headings}


def source_languages(package: Path):
    counts = Counter()
    files_seen = 0
    for p in package.rglob("*"):
        if not p.is_file():
            continue
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        lang = TEXT_EXTS.get(p.suffix.lower())
        if lang:
            counts[lang] += 1
            files_seen += 1
        if files_seen > 3000:
            break
    return dict(counts.most_common())


def flatten_exports(exports):
    out = []
    if isinstance(exports, str):
        out.append(exports)
    elif isinstance(exports, list):
        for x in exports:
            out.extend(flatten_exports(x))
    elif isinstance(exports, dict):
        for k, v in exports.items():
            if k.startswith("."):
                out.append(k)
            out.extend(flatten_exports(v))
    return sorted(set(out))[:200]


def evidence_for(package: Path, repo: Path):
    npm = package / "package.json"
    cargo = package / "Cargo.toml"
    readme = first_readme(package)

    ev = {
        "schema": "agentsam.package-evidence.v1",
        "directory": str(package.relative_to(repo)),
        "readme": readme_summary(readme, repo),
        "source_languages": source_languages(package),
    }

    if npm.exists():
        p = load_json(npm)
        deps = {}
        for field in ("dependencies", "peerDependencies", "optionalDependencies"):
            deps[field] = sorted((p.get(field) or {}).keys())
        ev["registry"] = {
            "kind": "npm",
            "name": p.get("name"),
            "version": p.get("version"),
            "description": p.get("description"),
            "private": bool(p.get("private", False)),
            "bin": p.get("bin"),
            "main": p.get("main"),
            "module": p.get("module"),
            "types": p.get("types"),
            "exports": flatten_exports(p.get("exports")),
            "scripts": sorted((p.get("scripts") or {}).keys()),
            "dependencies": deps,
        }
    elif cargo.exists():
        p = load_toml(cargo)
        pkg = p.get("package", {})
        ev["registry"] = {
            "kind": "cargo",
            "name": pkg.get("name"),
            "version": pkg.get("version"),
            "description": pkg.get("description"),
            "publish": pkg.get("publish", True),
            "repository": pkg.get("repository"),
            "homepage": pkg.get("homepage"),
            "keywords": pkg.get("keywords", []),
            "categories": pkg.get("categories", []),
            "bin": p.get("bin"),
        }
        ev["cargo_dependencies"] = sorted((p.get("dependencies") or {}).keys())

    return ev


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--out")
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    base = repo / "packages"
    out = Path(args.out).resolve() if args.out else repo / "packages" / "catalog" / "evidence"
    out.mkdir(parents=True, exist_ok=True)

    count = 0
    for package in sorted(x for x in base.iterdir() if x.is_dir()):
        if package.name == "catalog":
            continue
        if not (package / "package.json").exists() and not (package / "Cargo.toml").exists():
            continue
        ev = evidence_for(package, repo)
        name = ev["registry"].get("name") or package.name
        slug = name.removeprefix("@inneranimalmedia/").replace("/", "-")
        path = out / f"{slug}.json"
        path.write_text(json.dumps(ev, indent=2, sort_keys=True) + "\n")
        count += 1
        print(f"evidence {slug} -> {path.relative_to(repo) if repo in path.parents else path}")

    print(f"\nCollected evidence for {count} packages.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
