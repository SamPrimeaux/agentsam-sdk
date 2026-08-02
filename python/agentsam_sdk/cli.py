"""agentsam CLI -- stdlib argparse only (no click/typer dep, per project
convention: Python tooling here is stdlib-only).

  agentsam data d1-bloat --quick --format markdown --output-dir /tmp/d1-bloat
  agentsam data agentsam-walk --prefix agentsam_ --output-dir /tmp/walk
  agentsam repository inventory --repo-root .. --output-dir /tmp/scan --format json
  agentsam repository inventory --repo-root .. --format json | jq '.data.totals'
"""
from __future__ import annotations

import argparse
import json
import sys

from agentsam_sdk.runtime.contract import ToolInput, ToolResult


def _print_result(result: ToolResult, fmt: str) -> None:
    if fmt == "json":
        print(json.dumps(result.to_dict(), indent=2, default=str))
    else:
        status = "OK" if result.ok else "FAIL"
        print(f"[{status}] {result.tool} ({result.mode}) — {result.summary}", file=sys.stderr)
        if result.error:
            print(f"  error: {result.error}", file=sys.stderr)
        for a in result.artifacts:
            print(f"  wrote: {a}", file=sys.stderr)
        # When markdown artifacts were written, surface path; else dump summary data keys
        if fmt == "markdown" and result.ok and result.data.get("categories"):
            # stdout stays quiet when artifacts exist; callers use the .md file
            if not result.artifacts:
                from agentsam_sdk.repository.inventory import _markdown

                sys.stdout.write(_markdown(result.data))


def _cmd_data_d1_bloat(args: argparse.Namespace) -> int:
    from agentsam_sdk.data import d1_bloat

    mode = "full" if args.full else "quick"
    ti = ToolInput(
        mode=mode,
        params={
            "db": args.db, "config": args.config, "repo_root": args.repo_root,
            "prefix": args.prefix, "workers": args.workers,
            "count_only": args.count_only, "top": args.top,
        },
        output_dir=args.output_dir,
    )
    result = d1_bloat.run(ti)
    _print_result(result, args.format)
    return 0 if result.ok else 1


def _cmd_data_agentsam_walk(args: argparse.Namespace) -> int:
    from agentsam_sdk.data import agentsam_walk

    ti = ToolInput(
        mode="default",
        params={"db": args.db, "config": args.config, "repo_root": args.repo_root, "prefix": args.prefix},
        output_dir=args.output_dir,
    )
    result = agentsam_walk.run(ti)
    _print_result(result, args.format)
    return 0 if result.ok else 1


def _cmd_repository_inventory(args: argparse.Namespace) -> int:
    from agentsam_sdk.repository import inventory

    ti = ToolInput(
        mode="read-only",
        params={
            "repo_root": args.repo_root,
            "top": args.top,
            "min_bytes": args.min_bytes,
            "by_ext": args.by_ext,
            "include_node_modules": args.include_node_modules,
            "include_venvs": args.include_venvs,
            "include_git": args.include_git,
            "include_dist": args.include_dist,
            "follow_symlinks": args.follow_symlinks,
        },
        output_dir=args.output_dir,
    )
    result = inventory.run(ti)
    _print_result(result, args.format)
    return 0 if result.ok else 1


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="agentsam", description="agentsam_sdk CLI")
    sub = ap.add_subparsers(dest="group", required=True)

    data = sub.add_parser("data", help="D1 data audits")
    data_sub = data.add_subparsers(dest="cmd", required=True)

    bloat = data_sub.add_parser("d1-bloat", help="find largest/text-heavy D1 tables")
    bloat.add_argument("--db", help="D1 database name (else AGENTSAM_D1_DB_NAME)")
    bloat.add_argument("--config", help="wrangler config path (else AGENTSAM_WRANGLER_CONFIG)")
    bloat.add_argument("--repo-root", help="repo root wrangler runs from")
    bloat.add_argument("--quick", action="store_true", default=True)
    bloat.add_argument("--full", action="store_true")
    bloat.add_argument("--prefix")
    bloat.add_argument("--workers", type=int, default=6)
    bloat.add_argument("--top", type=int, default=40)
    bloat.add_argument("--count-only", action="store_true")
    bloat.add_argument("--output-dir")
    bloat.add_argument("--format", choices=["json", "markdown"], default="markdown")
    bloat.set_defaults(func=_cmd_data_d1_bloat)

    walk = data_sub.add_parser("agentsam-walk", help="walk agentsam_* tables")
    walk.add_argument("--db")
    walk.add_argument("--config")
    walk.add_argument("--repo-root")
    walk.add_argument("--prefix", default="agentsam_")
    walk.add_argument("--output-dir")
    walk.add_argument("--format", choices=["json", "markdown"], default="markdown")
    walk.set_defaults(func=_cmd_data_agentsam_walk)

    repo = sub.add_parser("repository", help="repository-level audits")
    repo_sub = repo.add_subparsers(dest="cmd", required=True)
    inv = repo_sub.add_parser(
        "inventory",
        help="file counts + sizes by logical category (jq-friendly JSON)",
    )
    inv.add_argument("--repo-root", default=".")
    inv.add_argument("--output-dir")
    inv.add_argument("--format", choices=["json", "markdown"], default="json")
    inv.add_argument("--top", type=int, default=20, help="N largest files (0 to omit)")
    inv.add_argument("--min-bytes", type=int, default=0)
    inv.add_argument(
        "--by-ext",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Include by_extension_detail with byte rollups (default: on)",
    )
    inv.add_argument("--include-node-modules", action="store_true")
    inv.add_argument("--include-venvs", action="store_true")
    inv.add_argument("--include-git", action="store_true")
    inv.add_argument("--include-dist", action="store_true")
    inv.add_argument("--follow-symlinks", action="store_true")
    inv.set_defaults(func=_cmd_repository_inventory)

    return ap


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
