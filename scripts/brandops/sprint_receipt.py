#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

from common import read_json, write_json


def run(repo: Path, *cmd: str):
    p = subprocess.run(
        list(cmd),
        cwd=str(repo),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return {
        "command": " ".join(cmd),
        "exit_code": p.returncode,
        "stdout": p.stdout.strip(),
        "stderr": p.stderr.strip(),
    }


def exists(path: Path):
    return {"path": str(path), "exists": path.exists()}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--brandops-dir", default=".agentsam/brandops")
    ap.add_argument("--out", default=".agentsam/brandops/sprint-receipt.json")
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    bdir = repo / args.brandops_dir

    checks = {
        "git_status": run(repo, "git", "status", "--short"),
        "git_branch": run(repo, "git", "branch", "--show-current"),
        "repo_audit": exists(bdir / "repo-audit.json"),
        "media_inventory": exists(bdir / "media-inventory.json"),
        "media_sqlite": exists(bdir / "media.sqlite"),
        "derivative_plan": exists(bdir / "derivative-plan.json"),
        "materialized_manifest": exists(bdir / "materialized-derivatives.json"),
    }

    status = {
        "repo_audit": checks["repo_audit"]["exists"],
        "media_inventory": checks["media_inventory"]["exists"],
        "derivative_plan": checks["derivative_plan"]["exists"],
        "real_derivative_manifest": checks["materialized_manifest"]["exists"],
    }

    blockers = []
    if not status["real_derivative_manifest"]:
        blockers.append(
            "No materialized-derivatives.json yet: derivative planning exists, "
            "but the app transform path has not proven physical output."
        )

    receipt = {
        "schema": "agentsam.sprint-receipt.v1",
        "repo": str(repo),
        "phase": "media-truth-v1",
        "checks": checks,
        "status": status,
        "blockers": blockers,
        "release_claim": (
            "NOT READY" if blockers else "READY FOR MEDIA-TRUTH ACCEPTANCE REVIEW"
        ),
        "next": [
            "Wire app delivery URLs to actual thumbnail/grid derivatives.",
            "Materialize real prepared variants through the product transform provider.",
            "Generate materialized-derivatives.json from app outputs.",
            "Run verify_media_truth.py against that manifest.",
        ],
    }

    out = repo / args.out if not Path(args.out).is_absolute() else Path(args.out)
    write_json(out, receipt)

    print(receipt["release_claim"])
    for b in blockers:
        print(f"BLOCKER: {b}")
    print(f"wrote: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
