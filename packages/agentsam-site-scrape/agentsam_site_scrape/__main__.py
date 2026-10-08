"""Interactive entrypoint.

    python -m agentsam_site_scrape https://example.com --repo-root /path/to/client/worker
"""

from __future__ import annotations

import argparse
import json
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
    parser.add_argument(
        "--json",
        action="store_true",
        help="Non-interactive page crawl; print the canonical site.scrape receipt as JSON on stdout",
    )
    parser.add_argument("--account-id", help="IAM account ID for private crawl evidence")
    parser.add_argument("--project-id", help="Project ID for private crawl evidence")
    parser.add_argument("--archive-dir", help="Write durable, immutable local crawl evidence to this directory")
    parser.add_argument("--archive-bucket", help="Private crawl-evidence R2 bucket (not WEBSITE_ASSETS)")
    parser.add_argument("--upload-archive", action="store_true", help="Explicitly upload staged private evidence to R2")
    parser.add_argument("--capture-assets", action="store_true", help="In --json mode, download page images into private evidence (requires --archive-dir)")
    parser.add_argument("--publish-assets", action="store_true", help="Explicitly publish approved images/pages into WEBSITE_ASSETS")
    parser.add_argument("--verify-archive", metavar="PATH", help="Verify local evidence checksums without crawling or uploading")
    parser.add_argument("--resume-archive", metavar="PATH", help="Verify and explicitly upload a previously staged archive without recrawling")
    args = parser.parse_args(argv)
    if not args.verify_archive and not args.resume_archive and (not 1 <= args.max_pages <= 5000 or args.delay < 0):
        parser.error("--max-pages must be 1..5000 and --delay must be nonnegative")
    if args.verify_archive and args.resume_archive:
        parser.error("--verify-archive and --resume-archive cannot be combined")
    if args.resume_archive and not (args.upload_archive and args.repo_root):
        parser.error("--resume-archive requires --upload-archive and --repo-root")
    if args.upload_archive and not (args.repo_root and (args.resume_archive or args.archive_dir)):
        parser.error("--upload-archive requires --repo-root and --archive-dir (or --resume-archive)")
    if args.archive_dir and not (args.account_id and args.project_id):
        parser.error("--archive-dir requires --account-id and --project-id")
    if args.archive_bucket and not (args.archive_dir or args.resume_archive):
        parser.error("--archive-bucket requires --archive-dir or --resume-archive")
    if args.bucket and not args.publish_assets:
        parser.error("--bucket requires --publish-assets; use --archive-bucket for private evidence")
    if args.publish_assets and not args.repo_root:
        parser.error("--publish-assets requires --repo-root for the site's configured WEBSITE_ASSETS binding")
    if args.json and args.publish_assets:
        parser.error("--publish-assets is a separate reviewed promotion, unavailable in --json mode")
    if args.capture_assets and (not args.json or not args.archive_dir):
        parser.error("--capture-assets requires --json and --archive-dir")
    if args.capture_assets and not args.no_optimize and not args.allow_unoptimized and not sips_available():
        parser.error("--capture-assets requires macOS sips, --no-optimize, or --allow-unoptimized")
    if args.verify_archive or args.resume_archive:
        from .evidence import verify_evidence, upload_evidence
        try:
            root = Path(args.verify_archive or args.resume_archive)
            manifest = verify_evidence(root)
            if args.resume_archive:
                from .storage import resolve_evidence_bucket
                choice = resolve_evidence_bucket(Path(args.repo_root), selected_bucket=args.archive_bucket,
                                                 wrangler_config=args.wrangler_config)
                uploaded = upload_evidence(root, bucket=choice["bucket"],
                                           repo_root=Path(args.repo_root),
                                           wrangler_config=args.wrangler_config)
                print(f"Evidence uploaded: {uploaded['bucket']}/{uploaded['manifest_key']}", file=sys.stderr)
            print(json.dumps({"verified": True, "run_id": manifest["run_id"],
                              "account_id": manifest["account_id"],
                              "project_id": manifest["project_id"],
                              "object_count": len(manifest["objects"]),
                              "prefix": manifest["prefix"]}, indent=2))
            return 0
        except Exception as exc:
            print(f"Evidence verification/upload failed: {exc}", file=sys.stderr)
            return 1
    if args.json:
        from .jsonrun import run_json

        return run_json(args)

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
        bucket, key_prefix = (
            _select_placement(seed_url, args.yes, repo_root, args.wrangler_config, args.bucket)
            if args.publish_assets else (None, "")
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

    if args.archive_dir:
        from .evidence import stage_evidence, upload_evidence
        from .contract import build_result
        import time
        now = time.time()
        receipt = build_result(crawl_result, started_at=now, completed_at=now,
                               scope={"sameSite": True, "maxPages": args.max_pages},
                               policy={"respectRobots": not args.ignore_robots, "hostDelayMs": int(args.delay * 1000)},
                               capture={"metadata": True, "text": False, "html": False,
                                        "assets": not args.no_images})
        try:
            stage = stage_evidence(crawl_result, receipt, account_id=args.account_id,
                                   project_id=args.project_id, archive_dir=Path(args.archive_dir))
            print(f"Private evidence staged: {stage['root']}")
            if args.upload_archive:
                from .storage import resolve_evidence_bucket
                choice = resolve_evidence_bucket(repo_root, selected_bucket=args.archive_bucket,
                                                 wrangler_config=args.wrangler_config)
                uploaded = upload_evidence(stage['root'], bucket=choice["bucket"],
                                           repo_root=repo_root, wrangler_config=args.wrangler_config)
                print(f"Private evidence uploaded: {uploaded['bucket']}/{uploaded['manifest_key']}")
        except Exception as exc:
            print(f"Evidence archive failed: {exc}", file=sys.stderr)
            return 1

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
