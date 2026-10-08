#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent


def call(*args: str) -> None:
    print()
    print("==>", " ".join(args))
    p = subprocess.run(args)
    if p.returncode != 0:
        raise SystemExit(p.returncode)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--out", default=".agentsam/brandops")
    ap.add_argument(
        "--workspace-manifest",
        help=(
            "Optional operator/user-supplied JSON manifest for fixture seeding. "
            "No default brands are embedded."
        ),
    )
    ap.add_argument(
        "--workspace-out",
        help="Optional output directory for workspace fixtures.",
    )
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    out = Path(args.out)
    if not out.is_absolute():
        out = repo / out
    out.mkdir(parents=True, exist_ok=True)

    py = sys.executable

    call(
        py, str(HERE / "repo_audit.py"),
        "--repo", str(repo),
        "--out", str(out / "repo-audit.json"),
    )

    call(
        py, str(HERE / "media_inventory.py"),
        "--repo", str(repo),
        "--out", str(out / "media-inventory.json"),
        "--sqlite", str(out / "media.sqlite"),
    )

    call(
        py, str(HERE / "derivative_plan.py"),
        "--inventory", str(out / "media-inventory.json"),
        "--out", str(out / "derivative-plan.json"),
    )

    if args.workspace_manifest:
        workspace_out = (
            Path(args.workspace_out)
            if args.workspace_out
            else out / "workspace-fixtures"
        )
        call(
            py, str(HERE / "seed_brand_workspaces.py"),
            "--manifest", str(Path(args.workspace_manifest).resolve()),
            "--out", str(workspace_out),
        )
    else:
        print()
        print("Workspace seeding skipped: no --workspace-manifest supplied.")

    call(
        py, str(HERE / "sprint_receipt.py"),
        "--repo", str(repo),
        "--brandops-dir", str(out.relative_to(repo)),
        "--out", str(out / "sprint-receipt.json"),
    )

    print()
    print("BrandOps evidence pass complete.")
    print(f"Output: {out}")
    print("No brand/customer/operator identities are embedded by default.")
    print("This intentionally does NOT claim physical derivatives exist yet.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
