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
            download_images=False,
            optimize=False,
            ignore_robots=args.ignore_robots,
        )

    receipt = build_result(
        result,
        started_at=started,
        completed_at=time.time(),
        scope={"sameSite": True, "maxPages": args.max_pages},
        policy={"respectRobots": not args.ignore_robots, "hostDelayMs": int(args.delay * 1000)},
        capture={"metadata": True, "text": False, "html": False, "assets": False},
    )
    json.dump(receipt, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0 if receipt["status"] != "failed" else 1
