"""Runtime-neutral site.scrape result contract (schema_version 1).

Pure stdlib. Mirrors protocol/capabilities/site-scrape-result.schema.json so every
runtime (this Python CLI, Worker adapter) emits the same receipt shape.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

SCHEMA_VERSION = 1
CAPABILITY = "site.scrape"
RUNTIME = "python-local"

STATUS_COMPLETED = "completed"
STATUS_PARTIAL = "partial"
STATUS_FAILED = "failed"

# Input fields from site-scrape-input.schema.json that the Python runtime cannot honor yet.
_UNSUPPORTED_INPUTS = ("scope.maxDepth", "policy.timeoutMs", "capture.html", "capture.text", "scope.allowedOrigins")


def classify_error(error: str) -> str:
    """Map a crawler error string to the shared kind vocabulary."""
    if error == "blocked_by_robots":
        return "blocked"
    if error == "redirect_left_site":
        return "skipped"
    return "failed"


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def build_result(
    crawl_result,
    *,
    started_at: float,
    completed_at: float,
    scope: dict,
    policy: dict,
    capture: dict,
) -> dict:
    """Build the canonical receipt from a CrawlResult (duck-typed)."""
    pages = [
        {"url": p.url, "title": p.title or "", "image_count": int(p.image_count)}
        for p in crawl_result.pages
    ]
    errors = [
        {
            "url": str(e.get("url", "")),
            "kind": classify_error(str(e.get("error", ""))),
            "error": str(e.get("error", "")),
        }
        for e in crawl_result.errors
    ]
    image_errors = [
        {"url": i.url, "kind": "failed", "error": str(i.error or "image_processing_failed")}
        for i in crawl_result.images if not i.ok
    ] if capture.get("assets") else []
    counts = {
        "pages_visited": int(getattr(crawl_result, "pages_visited", 0) or (len(pages) + len(errors))),
        "pages_fetched": len(pages),
        "pages_blocked": sum(1 for e in errors if e["kind"] == "blocked"),
        "pages_skipped": sum(1 for e in errors if e["kind"] == "skipped"),
        "pages_failed": sum(1 for e in errors if e["kind"] == "failed"),
    }
    if capture.get("assets"):
        counts["images_fetched"] = sum(1 for i in crawl_result.images if i.ok)
        counts["images_failed"] = len(image_errors)
    if not pages:
        status = STATUS_FAILED
    elif errors or image_errors:
        status = STATUS_PARTIAL
    else:
        status = STATUS_COMPLETED

    seeds = list(crawl_result.seed_urls)
    run_id = "scrp_" + hashlib.sha256(
        (json.dumps(sorted(seeds)) + f"|{started_at!r}").encode("utf-8")
    ).hexdigest()[:24]
    content_hash = "sha256:" + hashlib.sha256(
        json.dumps(sorted((p["url"], p["title"]) for p in pages)).encode("utf-8")
    ).hexdigest()

    return {
        "schema_version": SCHEMA_VERSION,
        "capability": CAPABILITY,
        "run_id": run_id,
        "status": status,
        "runtime": RUNTIME,
        "started_at": _iso(started_at),
        "completed_at": _iso(completed_at),
        "content_hash": content_hash,
        "seed_urls": seeds,
        "counts": counts,
        "applied": {
            "scope": scope,
            "policy": policy,
            "capture": capture,
            "ignored": list(_UNSUPPORTED_INPUTS),
        },
        "pages": pages,
        "errors": errors + image_errors,
    }
