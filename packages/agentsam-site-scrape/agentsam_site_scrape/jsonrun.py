"""Non-interactive `--json` run: discover -> crawl (pages only) -> canonical receipt on stdout.

All logging goes to stderr so stdout is exactly one JSON document.
"""

from __future__ import annotations

import json
import sys
import tempfile
import time
from pathlib import Path

from . import net
from .contract import build_result
from .crawl import CrawlResult, crawl, discover
from .pageextract import clean_url
from .ssrf import assert_public_http_url
from .__main__ import _slugify_target_name


def run_json(args) -> int:
    try:
        if not args.url:
            print("--json requires a seed URL.", file=sys.stderr)
            return 2
        seed_url = clean_url(args.url)
        assert_public_http_url(seed_url, context="seed")
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    if not 1 <= args.max_pages <= 5000 or args.delay < 0:
        print("--max-pages must be 1..5000 and --delay must be nonnegative", file=sys.stderr)
        return 2

    started = time.time()
    session = net.new_session()
    robots = net.Robots(session)
    found = discover(seed_url, session, robots, args.ignore_robots)
    if found.fetch_error:
        print(f"Discovery failed: {found.fetch_error}", file=sys.stderr)
        result = CrawlResult(target=_slugify_target_name(seed_url), seed_urls=[seed_url],
                             errors=[{"url": seed_url, "error": found.fetch_error}], pages_visited=1)
        receipt = build_result(result, started_at=started, completed_at=time.time(),
                               scope={"sameSite": True, "maxPages": args.max_pages},
                               policy={"respectRobots": not args.ignore_robots, "hostDelayMs": int(args.delay * 1000)},
                               capture={"metadata": True, "text": False, "html": False, "assets": False})
        if getattr(args, "archive_dir", None):
            from .evidence import stage_evidence, upload_evidence
            try:
                staged = stage_evidence(result, receipt, account_id=args.account_id,
                                        project_id=args.project_id,
                                        archive_dir=Path(args.archive_dir))
                print(f"Failed crawl evidence staged: {staged['root']}", file=sys.stderr)
                receipt["storage"] = {"status": "staged", "prefix": staged["prefix"]}
                if getattr(args, "upload_archive", False):
                    from .storage import resolve_evidence_bucket
                    choice = resolve_evidence_bucket(Path(args.repo_root), selected_bucket=args.archive_bucket,
                                                     wrangler_config=getattr(args, "wrangler_config", None))
                    uploaded = upload_evidence(staged["root"], bucket=choice["bucket"],
                                               repo_root=Path(args.repo_root),
                                               wrangler_config=getattr(args, "wrangler_config", None))
                    receipt["storage"] = {"status": "uploaded", "prefix": staged["prefix"],
                                          "bucket": uploaded["bucket"]}
                    print(f"Private evidence uploaded: {uploaded['bucket']}/{uploaded['manifest_key']}", file=sys.stderr)
            except Exception as exc:
                receipt["storage"] = {"status": "failed", "error": str(exc)}
                print(f"Evidence archive failed: {exc}", file=sys.stderr)
        json.dump(receipt, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        return 1

    seeds, seen = [], set()
    for u in [seed_url, *found.nav_candidates, *found.other_candidates]:
        if u not in seen:
            seen.add(u)
            seeds.append(u)

    with tempfile.TemporaryDirectory(prefix="agentsam-site-scrape-") as tmp:
        result = crawl(
            _slugify_target_name(seed_url),
            seeds,
            Path(tmp),
            expand_domain=args.expand_domain,
            max_pages=args.max_pages,
            delay=args.delay,
            download_images=getattr(args, "capture_assets", False),
            optimize=not getattr(args, "no_optimize", False),
            image_workers=getattr(args, "workers", 8),
            allow_unoptimized=getattr(args, "allow_unoptimized", False),
            ignore_robots=args.ignore_robots,
        )

        receipt = build_result(
            result,
            started_at=started,
            completed_at=time.time(),
            scope={"sameSite": True, "maxPages": args.max_pages},
            policy={"respectRobots": not args.ignore_robots, "hostDelayMs": int(args.delay * 1000)},
            capture={"metadata": True, "text": False, "html": False,
                         "assets": getattr(args, "capture_assets", False)},
        )
        if getattr(args, "archive_dir", None):
            from .evidence import stage_evidence, upload_evidence
            try:
                staged = stage_evidence(result, receipt, account_id=args.account_id,
                                        project_id=args.project_id,
                                        archive_dir=Path(args.archive_dir))
                receipt["storage"] = {"status": "staged", "prefix": staged["prefix"]}
                print(f"Private evidence staged: {staged['root']}", file=sys.stderr)
                if getattr(args, "upload_archive", False):
                    from .storage import resolve_evidence_bucket
                    choice = resolve_evidence_bucket(Path(args.repo_root), selected_bucket=args.archive_bucket,
                                                     wrangler_config=getattr(args, "wrangler_config", None))
                    uploaded = upload_evidence(staged["root"], bucket=choice["bucket"],
                                               repo_root=Path(args.repo_root),
                                               wrangler_config=getattr(args, "wrangler_config", None))
                    receipt["storage"] = {"status": "uploaded", "prefix": staged["prefix"],
                                          "bucket": uploaded["bucket"]}
                    print(f"Private evidence uploaded: {uploaded['bucket']}/{uploaded['manifest_key']}", file=sys.stderr)
            except Exception as exc:
                receipt["storage"] = {"status": "failed", "error": str(exc)}
                print(f"Evidence archive failed: {exc}", file=sys.stderr)
        json.dump(receipt, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 1 if receipt["status"] == "failed" or receipt.get("storage", {}).get("status") == "failed" else 0
