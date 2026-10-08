#!/usr/bin/env python3
"""Show exactly which package manifest fields still need human/agent judgment."""

from __future__ import annotations
import argparse, json
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    rows = []
    for p in sorted((repo / "packages").glob("*/agentsam.package.json")):
        obj = json.loads(p.read_text())
        required = obj.get("review_required", [])
        if obj.get("catalog_status") != "classified" or required:
            rows.append({
                "id": obj.get("id"),
                "path": str(p.relative_to(repo)),
                "catalog_status": obj.get("catalog_status"),
                "review_required": required,
                "purpose": obj.get("purpose"),
            })

    if args.json:
        print(json.dumps({"count": len(rows), "items": rows}, indent=2))
    else:
        print(f"Package manifests needing review: {len(rows)}\n")
        for r in rows:
            print(r["id"])
            print(f"  file: {r['path']}")
            print(f"  status: {r['catalog_status']}")
            print(f"  review: {', '.join(r['review_required']) or 'classification approval'}")
            if r["purpose"]:
                print(f"  evidence-derived purpose: {r['purpose'][:180]}")
            print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
