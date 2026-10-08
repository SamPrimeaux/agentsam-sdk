#!/usr/bin/env python3
"""Draft all package manifests from evidence without inventing missing facts."""

from __future__ import annotations

import argparse, json
from pathlib import Path


def load(path):
    return json.loads(path.read_text())


def language_list(ev):
    langs = list(ev.get("source_languages", {}).keys())
    # prefer dominant languages but keep factual presence
    return langs[:8]


def factual_class(name: str, ev: dict):
    # Conservative structural classification only.
    short = name.removeprefix("@inneranimalmedia/")
    if short.startswith("theme-"):
        return "theme"
    if ev["registry"]["kind"] == "cargo":
        return "developer-tool" if ev["registry"].get("bin") is not None or "rapid-rust" in short else "rust-crate"
    if short.endswith("-ui"):
        return "ui-package"
    if "theme" in short:
        return "theme"
    return "package"


def install_records(ev):
    r = ev["registry"]
    if r["kind"] == "npm":
        if r.get("private"):
            return []
        name = r.get("name")
        return [{"type": "npm", "package": name, "command": f"npm install {name}"}] if name else []
    if r["kind"] == "cargo":
        if r.get("publish") is False:
            return []
        name = r.get("name")
        return [{"type": "cargo", "package": name, "command": f"cargo install {name}"}] if name else []
    return []


def purpose_from_evidence(ev):
    r = ev["registry"]
    if r.get("description"):
        return r["description"], "package-manifest-description"
    summary = (ev.get("readme") or {}).get("summary")
    if summary:
        return summary, "readme-first-paragraph"
    return "", None


def manifest_for(ev):
    r = ev["registry"]
    name = r.get("name")
    short = name.removeprefix("@inneranimalmedia/") if name else Path(ev["directory"]).name
    purpose, purpose_source = purpose_from_evidence(ev)

    review = []
    if not purpose:
        review.append("purpose")
    review += [
        "status",
        "execution_domains",
        "use_when",
        "avoid_when",
        "topics",
    ]

    return {
        "schema": "agentsam.package.v1",
        "id": short.replace("/", "-"),
        "name": name or short,
        "version": r.get("version"),
        "catalog_status": "needs-review",
        "class": factual_class(name or short, ev),
        "status": "unknown",
        "languages": language_list(ev),
        "execution_domains": [],
        "purpose": purpose,
        "install": install_records(ev),
        "use_when": [],
        "avoid_when": [],
        "commands": [],
        "topics": [],
        "registry": {
            "kind": r["kind"],
            "name": name,
            "public_claim": (
                not r.get("private", False)
                if r["kind"] == "npm"
                else r.get("publish", True) is not False
            ),
        },
        "evidence": {
            "directory": ev["directory"],
            "purpose_source": purpose_source,
            "readme": (ev.get("readme") or {}).get("path"),
        },
        "review_required": sorted(set(review)),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    evdir = repo / "packages" / "catalog" / "evidence"
    if not evdir.exists():
        raise SystemExit("No evidence directory. Run collect_package_evidence.py first.")

    rows = []
    for ep in sorted(evdir.glob("*.json")):
        ev = load(ep)
        mf = manifest_for(ev)
        package_dir = repo / ev["directory"]
        dest = package_dir / "agentsam.package.json"
        exists = dest.exists()
        rows.append((mf, dest, exists))

    print(f"Draft candidates: {len(rows)}")
    for mf, dest, exists in rows:
        action = "KEEP" if exists else ("WRITE" if args.write else "WOULD WRITE")
        print(f"{action:11} {mf['id']:36} review={','.join(mf['review_required']) or 'none'}")
        if args.write and not exists:
            dest.write_text(json.dumps(mf, indent=2, sort_keys=True) + "\n")

    if not args.write:
        print("\nDry-run only. Re-run with --write to create missing draft manifests.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
