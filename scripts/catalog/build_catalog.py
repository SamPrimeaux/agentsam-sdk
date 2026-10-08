#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path

REQUIRED = {
    "schema", "id", "name", "version", "catalog_status", "class", "status",
    "languages", "execution_domains", "purpose", "install", "use_when",
    "avoid_when", "commands", "topics", "registry"
}


def dump(x):
    return json.dumps(x, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--require-classified", action="store_true")
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    manifests = sorted({*(repo / "packages").glob("*/agentsam.package.json"), repo / "apps/local-studio/shared/agentsam/agentsam.package.json", repo / "packages/connectors/cfoa/agentsam.package.json"})
    packages, seen, errors = [], {}, []

    for p in manifests:
        try:
            obj = json.loads(p.read_text())
        except Exception as e:
            errors.append(f"{p}: invalid JSON: {e}")
            continue
        missing = REQUIRED - obj.keys()
        if missing:
            errors.append(f"{p}: missing {sorted(missing)}")
        pid = obj.get("id")
        if pid in seen:
            errors.append(f"duplicate id {pid}: {seen[pid]} and {p}")
        seen[pid] = p
        if args.require_classified and obj.get("catalog_status") != "classified":
            errors.append(f"{p}: package is not classified")
        packages.append(obj)

    if errors:
        print("Catalog validation failed:")
        for e in errors:
            print(" -", e)
        return 2

    outdir = repo / "packages/catalog/generated"
    outdir.mkdir(parents=True, exist_ok=True)
    data = {
        "schema": "agentsam.packages-index.v1",
        "count": len(packages),
        "packages": sorted(packages, key=lambda x: x["id"])
    }
    content = dump(data)
    target = outdir / "packages.json"
    changed = not target.exists() or target.read_text() != content

    if args.check and changed:
        print("Catalog drift detected: packages/catalog/generated/packages.json")
        return 3
    if not args.check:
        target.write_text(content)

    digest = hashlib.sha256(content.encode()).hexdigest()
    counts = {}
    for x in packages:
        counts[x.get("catalog_status", "missing")] = counts.get(x.get("catalog_status", "missing"), 0) + 1
    print(f"packages={len(packages)} status={counts} sha256={digest[:16]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
