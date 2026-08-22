"""Interactive entrypoint.

    python -m agentsam_site_scrape https://example.com --repo-root /path/to/client/worker
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import net
from .config import WEBSITE_ASSETS_BINDING
from .crawl import crawl, discover
from .imageops import sips_available
from .pageextract import canonical_host, clean_url
from .r2_upload import upload_crawl_result
from .ssrf import assert_public_http_url
from .wrangler_bucket import resolve_website_assets_bucket


def _slugify_target_name(seed_url: str) -> str:
    host = canonical_host(seed_url)
    slug = host.replace(".", "-").replace("_", "-").lower()
    return slug[:63]


def _prompt(question: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    answer = input(f"{question}{suffix}: ").strip()
    return answer or default


def _select_pages(seed_url: str, nav: list[str], other: list[str], auto_yes: bool) -> list[str]:
    combined = [(u, "nav") for u in nav] + [(u, "other") for u in other]
    if not combined:
        print("  (no additional same-site links found on the seed page)")
        return [seed_url]

    print(f"\nFound {len(nav)} nav link(s) and {len(other)} other same-site link(s):")
    for i, (url, kind) in enumerate(combined, 1):
        print(f"  [{i:2d}] ({kind:5s}) {url}")

    if auto_yes:
        return [seed_url] + [u for u, _ in combined]

    answer = _prompt(
        "\nInclude which pages? Enter = all, 'seed' = just the seed page, "
        "or comma-separated numbers",
        default="",
    )
    if answer.lower() == "seed":
        return [seed_url]
    if not answer:
        return [seed_url] + [u for u, _ in combined]
    try:
        indices = {int(x.strip()) for x in answer.split(",") if x.strip()}
    except ValueError:
        print("  Couldn't parse that -- defaulting to all pages.")
        return [seed_url] + [u for u, _ in combined]
    picked = [combined[i - 1][0] for i in sorted(indices) if 1 <= i <= len(combined)]
    return [seed_url] + picked


def _select_placement(
    seed_url: str,
    auto_yes: bool,
    repo_root: Path | None,
    wrangler_config: str | None,
    explicit_bucket: str | None,
) -> tuple[str | None, str]:
    """Returns (bucket_name_or_None, key_prefix). bucket is None for local-only."""
    if explicit_bucket:
        return explicit_bucket, ""

    if auto_yes:
        if repo_root is None:
            return None, ""
        bucket = resolve_website_assets_bucket(repo_root, wrangler_config=wrangler_config)
        return bucket, ""

    suggested = None
    if repo_root is not None:
        try:
            suggested = resolve_website_assets_bucket(repo_root, wrangler_config=wrangler_config)
        except Exception as exc:  # noqa: BLE001
            print(f"  (could not resolve {WEBSITE_ASSETS_BINDING} yet: {exc})")

    print(
        "\nHow should assets be placed?\n"
        f"  [1] Auto       -- R2 bucket from {WEBSITE_ASSETS_BINDING}"
        + (f" → '{suggested}'" if suggested else " (requires --repo-root)")
        + ", no key prefix\n"
        "  [2] Local only -- organize files locally, skip R2 upload\n"
        "  [3] Custom     -- choose your own bucket name / key prefix"
    )
    choice = _prompt("Choice", default="1" if suggested or repo_root else "2")

    if choice == "2":
        return None, ""
    if choice == "3":
        default_bucket = suggested or _slugify_target_name(seed_url)
        bucket = _prompt("R2 bucket name", default=default_bucket)
        prefix = _prompt("Key prefix (blank for none)", default="")
        return bucket, prefix

    if repo_root is None:
        raise RuntimeError("Auto placement requires --repo-root (client worker repo)")
    bucket = suggested or resolve_website_assets_bucket(repo_root, wrangler_config=wrangler_config)
    return bucket, ""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Interactive site scraper → R2 asset pipeline")
    parser.add_argument("url", nargs="?", help="Seed URL to audit (prompted if omitted)")
    parser.add_argument(
        "--repo-root",
        default=None,
        help="Client worker repo root (for wrangler r2 put + WEBSITE_ASSETS resolution). "
             "Required for R2 upload; optional for local-only.",
    )
    parser.add_argument(
        "--wrangler-config",
        default=None,
        help="Wrangler config path relative to --repo-root (or absolute)",
    )
    parser.add_argument("--bucket", default=None, help="Override R2 bucket name (skip Auto resolve)")
    parser.add_argument("--out", default="./agentsam-site-scrape-corpus", help="Local output directory")
    parser.add_argument("--max-pages", type=int, default=200)
    parser.add_argument("--delay", type=float, default=0.35)
    parser.add_argument("--workers", type=int, default=8, help="Concurrent image downloads")
    parser.add_argument("--upload-workers", type=int, default=6, help="Concurrent wrangler puts")
    parser.add_argument("--no-images", action="store_true")
    parser.add_argument("--no-optimize", action="store_true")
    parser.add_argument(
        "--allow-unoptimized",
        action="store_true",
        help="If sips is missing/fails, copy raw bytes instead of aborting",
    )
    parser.add_argument("--ignore-robots", action="store_true")
    parser.add_argument(
        "--expand-domain",
        action="store_true",
        help="Also crawl same-site links discovered mid-crawl, beyond the confirmed set",
    )
    parser.add_argument("--yes", "-y", action="store_true", help="Skip prompts; take defaults")
    args = parser.parse_args(argv)

    try:
        seed_url = clean_url(args.url) if args.url else clean_url(_prompt("Seed URL to audit"))
        if not seed_url:
            print("No valid URL given.", file=sys.stderr)
            return 1
        assert_public_http_url(seed_url, context="seed")
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    if args.no_optimize is False and not args.allow_unoptimized and not sips_available():
        print(
            "sips not found. Optimization requires macOS sips. "
            "Re-run with --no-optimize or --allow-unoptimized.",
            file=sys.stderr,
        )
        return 1

    print(f"Auditing {seed_url} ...")
    session = net.new_session()
    robots = net.Robots(session)
    result = discover(seed_url, session, robots, args.ignore_robots)
    if result.fetch_error:
        print(f"Discovery failed: {result.fetch_error}", file=sys.stderr)
        return 1
    print(f"Title: {result.title or '(none found)'}")

    confirmed_urls = _select_pages(seed_url, result.nav_candidates, result.other_candidates, args.yes)

    repo_root = Path(args.repo_root).resolve() if args.repo_root else None
    try:
        bucket, key_prefix = _select_placement(
            seed_url, args.yes, repo_root, args.wrangler_config, args.bucket,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"Placement failed: {exc}", file=sys.stderr)
        return 1

    if bucket and repo_root is None:
        print("R2 upload requires --repo-root (client worker repo).", file=sys.stderr)
        return 1

    target = _slugify_target_name(seed_url)
    if bucket is None:
        destination = "(local only, no upload)"
    else:
        destination = f"{bucket}/{key_prefix or '(no prefix)'}"
    print(
        f"\nReady to run:\n"
        f"  target         : {target}\n"
        f"  pages selected : {len(confirmed_urls)}\n"
        f"  expand domain  : {args.expand_domain}\n"
        f"  download images: {not args.no_images}\n"
        f"  optimize       : {not args.no_optimize}\n"
        f"  R2 destination : {destination}"
    )
    if not args.yes:
        input("\nPress Enter to run, or Ctrl-C to cancel...")

    crawl_result = crawl(
        target,
        confirmed_urls,
        Path(args.out),
        expand_domain=args.expand_domain,
        max_pages=args.max_pages,
        delay=args.delay,
        download_images=not args.no_images,
        optimize=not args.no_optimize,
        ignore_robots=args.ignore_robots,
        image_workers=args.workers,
        allow_unoptimized=args.allow_unoptimized,
    )

    ok_images = sum(1 for i in crawl_result.images if i.ok)
    failed_images = [i for i in crawl_result.images if not i.ok]
    print(
        f"\nCrawl done: {len(crawl_result.pages)} pages, "
        f"{ok_images} images processed, {len(failed_images)} image failures, "
        f"{len(crawl_result.errors)} page errors."
    )

    if bucket and repo_root is not None:
        print(f"Uploading to R2 bucket '{bucket}' ...")
        summary = upload_crawl_result(
            crawl_result,
            repo_root,
            bucket,
            key_prefix=key_prefix,
            wrangler_config=args.wrangler_config,
            upload_workers=args.upload_workers,
        )
        print(f"Uploaded {summary['uploaded']} objects, {len(summary['failed'])} failed.")
        for f in summary["failed"]:
            print(f"  - {f}", file=sys.stderr)
        print(f"Manifest: {summary['manifest_path']}")
        print(
            f"\nReminder: client wrangler must bind:\n"
            f'  "r2_buckets": [{{ "binding": "{WEBSITE_ASSETS_BINDING}", "bucket_name": "{bucket}" }}]'
        )

    # Fail loud when nothing useful happened, or when --yes and all images failed.
    if not crawl_result.pages:
        print("No pages crawled.", file=sys.stderr)
        return 1
    if args.yes and crawl_result.images and ok_images == 0:
        print("All image downloads failed under --yes.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
