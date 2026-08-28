"""agentsam CLI -- stdlib argparse only (no click/typer dep, per project
convention: Python tooling here is stdlib-only).

  agentsam data d1-bloat --quick --format markdown --output-dir /tmp/d1-bloat
  agentsam data agentsam-walk --prefix agentsam_ --output-dir /tmp/walk
  agentsam repository inventory --repo-root .. --output-dir /tmp/scan --format json
  agentsam repository inventory --repo-root .. --format json | jq '.data.totals'
  agentsam repository scan-bloat --root src --min-kb 10 --top 30 --format json
  agentsam repository inspect --repo-root . --json --dupes | jq '.duplicates'
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
        if fmt == "markdown" and result.ok and result.data.get("files") is not None:
            from agentsam_sdk.repository.scan_bloat import human_table

            sys.stdout.write(
                human_table(
                    result.data.get("files") or [],
                    scanned=int(result.data.get("file_count") or 0),
                    total_kb=float(result.data.get("total_kb") or 0),
                    total_tokens=int(result.data.get("total_est_tokens") or 0),
                )
            )


def _cmd_data_d1_bloat(args: argparse.Namespace) -> int:
    from agentsam_sdk.data import d1_bloat

    mode = "full" if args.full else "quick"
    ti = ToolInput(
        mode=mode,
        params={
            "db": args.db, "config": args.config, "repo_root": args.repo_root,
            "prefix": args.prefix, "workers": args.workers, "top": args.top,
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


def _cmd_repository_scan_bloat(args: argparse.Namespace) -> int:
    from agentsam_sdk.repository import scan_bloat

    ti = ToolInput(
        mode="read-only",
        params={
            "root": args.root,
            "top": args.top,
            "min_kb": args.min_kb,
            "ext": args.ext,
            "exclude": args.exclude,
        },
        output_dir=args.output_dir,
    )
    result = scan_bloat.run(ti)
    # Agent capture: --json-envelope prints data payload only (legacy tools/scan_bloat.py)
    if args.json_envelope:
        print(json.dumps(result.data if result.ok else {"ok": False, "error": result.error}, indent=2))
        return 0 if result.ok else 1
    _print_result(result, args.format)
    return 0 if result.ok else 1


def _cmd_repository_inspect(args: argparse.Namespace) -> int:
    from agentsam_sdk.repository import inspect as repo_inspect

    argv: list[str] = []
    if args.repo_root:
        argv.extend(["--repo-root", args.repo_root])
    want_text = bool(args.text) or args.format in ("text", "markdown")
    want_json = bool(args.json) or args.format == "json" or not want_text
    if want_json and not want_text:
        argv.append("--json")
    if want_text and not want_json:
        argv.append("--text")
    if want_text and want_json:
        # Explicit both → JSON wins (machine default) unless only --text
        argv.append("--json")
    if args.dupes:
        argv.append("--dupes")
    if args.all:
        argv.append("--all")
    if args.since:
        argv.extend(["--since", args.since])
    if args.recent is not None:
        argv.extend(["--recent", str(args.recent)])
    if args.largest is not None:
        argv.extend(["--largest", str(args.largest)])
    if args.out:
        argv.extend(["--out", args.out])
    return repo_inspect.main_cli(argv)


def _cmd_tui(args: argparse.Namespace) -> int:
    from agentsam_sdk.tui.demo import main as tui_main

    argv = ["--scene", args.scene, "--ticks", str(args.ticks)]
    if args.check:
        argv.append("--check")
    if args.force_color:
        argv.append("--force-color")
    return tui_main(argv)


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="agentsam", description="agentsam_sdk CLI")
    sub = ap.add_subparsers(dest="group", required=True)

    tui = sub.add_parser("tui", help="optional Rich terminal UI / live CLI renderables")
    tui.add_argument(
        "--scene",
        choices=("all", "card", "progress", "dashboard", "events", "sprite", "logs", "ship"),
        default="all",
    )
    tui.add_argument("--ticks", type=int, default=48)
    tui.add_argument("--check", action="store_true", help="render quickly for smoke/CI")
    tui.add_argument("--force-color", action="store_true")
    tui.set_defaults(func=_cmd_tui)

    data = sub.add_parser("data", help="D1 data audits")
    data_sub = data.add_subparsers(dest="cmd", required=True)

    bloat = data_sub.add_parser(
        "d1-bloat",
        help="database-scoped D1 audit (--quick=counts, --full=text sizes)",
    )
    bloat.add_argument("--db", help="D1 database name (else AGENTSAM_D1_DB_NAME)")
    bloat.add_argument("--config", help="wrangler config path (else AGENTSAM_WRANGLER_CONFIG)")
    bloat.add_argument("--repo-root", help="repo root wrangler runs from")
    bloat.add_argument("--quick", action="store_true", default=True,
                       help="All tables: COUNT(*) only (default)")
    bloat.add_argument("--full", action="store_true",
                       help="All tables: row counts + text/JSON LENGTH estimates")
    bloat.add_argument("--prefix", help="Only tables whose name starts with this prefix")
    bloat.add_argument("--workers", type=int, default=6)
    bloat.add_argument("--top", type=int, default=40)
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

    sb = repo_sub.add_parser(
        "scan-bloat",
        help="largest runtime source files (KB/lines/est. tokens)",
    )
    sb.add_argument("--root", default=".", help="directory to scan (default: cwd)")
    sb.add_argument("--top", type=int, default=30)
    sb.add_argument("--min-kb", type=float, default=0)
    sb.add_argument(
        "--ext",
        default=".js,.ts,.jsx,.tsx,.mjs,.cjs",
        help="comma-separated extensions",
    )
    sb.add_argument("--exclude", default="", help="extra dir names to exclude")
    sb.add_argument("--output-dir")
    sb.add_argument("--format", choices=["json", "markdown"], default="markdown")
    sb.add_argument(
        "--json-envelope",
        action="store_true",
        help="print ToolResult.data JSON only (agent/terminal capture)",
    )
    sb.set_defaults(func=_cmd_repository_scan_bloat)

    insp = repo_sub.add_parser(
        "inspect",
        help="file walk: sizes + dates (+ optional --dupes SHA-256 groups)",
    )
    insp.add_argument("--repo-root", default=None)
    insp.add_argument("--format", choices=["json", "markdown", "text"], default="json")
    insp.add_argument("--json", action="store_true")
    insp.add_argument("--text", action="store_true")
    insp.add_argument("--dupes", action="store_true")
    insp.add_argument("--all", action="store_true")
    insp.add_argument("--since", default=None)
    insp.add_argument("--recent", type=int, default=50)
    insp.add_argument("--largest", type=int, default=30)
    insp.add_argument("--out", default=None)
    insp.set_defaults(func=_cmd_repository_inspect)

    return ap


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
