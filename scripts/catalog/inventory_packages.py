#!/usr/bin/env python3
from __future__ import annotations

import argparse, json
try:
    import tomllib
except ModuleNotFoundError:
    raise SystemExit("Catalog evidence tooling requires Python 3.11+; try python3.14 or python3.12.")
from pathlib import Path


def read_json(path: Path):
    return json.loads(path.read_text())


def read_toml(path: Path):
    return tomllib.loads(path.read_text())


def detect(path: Path):
    npm = path / "package.json"
    cargo = path / "Cargo.toml"
    result = {
        "path": str(path),
        "manifest_path": str(path / "agentsam.package.json"),
        "has_agentsam_manifest": (path / "agentsam.package.json").exists(),
    }
    if npm.exists():
        p = read_json(npm)
        result |= {
            "kind": "npm",
            "name": p.get("name"),
            "version": p.get("version"),
            "description": p.get("description"),
            "private": bool(p.get("private", False)),
        }
        return result
    if cargo.exists():
        p = read_toml(cargo).get("package", {})
        if p:
            result |= {
                "kind": "cargo",
                "name": p.get("name"),
                "version": p.get("version"),
                "description": p.get("description"),
                "publish": p.get("publish", True),
            }
            return result
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    base = repo / "packages"
    rows = []
    for p in sorted(x for x in base.iterdir() if x.is_dir()):
        item = detect(p)
        if item:
            item["path"] = str(p.relative_to(repo))
            item["manifest_path"] = str((p / "agentsam.package.json").relative_to(repo))
            rows.append(item)

    out = {
        "package_count": len(rows),
        "classified": sum(1 for x in rows if x["has_agentsam_manifest"]),
        "missing_manifest": sum(1 for x in rows if not x["has_agentsam_manifest"]),
        "packages": rows,
    }

    if args.json:
        print(json.dumps(out, indent=2))
    else:
        print(f"Packages: {out['package_count']}")
        print(f"With agentsam.package.json: {out['classified']}")
        print(f"Missing manifests: {out['missing_manifest']}")
        for row in rows:
            m = "✓" if row["has_agentsam_manifest"] else "·"
            print(f"{m} {row.get('name') or row['path']} [{row['kind']}]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
