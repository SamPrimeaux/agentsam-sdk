"""Upload crawl optimized images + page JSON to R2 via wrangler (threaded)."""

from __future__ import annotations

import concurrent.futures
import json
import subprocess
import time
from pathlib import Path

from .config import IMMUTABLE_CACHE, MUTABLE_CACHE
from .crawl import CrawlResult


def wrangler_put(
    repo_root: Path,
    bucket: str,
    key: str,
    file_path: Path,
    content_type: str,
    cache_control: str,
    *,
    wrangler_config: str | None = None,
) -> None:
    cmd = [
        "npx", "wrangler", "r2", "object", "put", f"{bucket}/{key}",
        "--file", str(file_path),
        "--content-type", content_type,
        "--cache-control", cache_control,
        "--remote",
    ]
    if wrangler_config:
        cmd += ["-c", wrangler_config]
    result = subprocess.run(cmd, cwd=str(repo_root), capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"wrangler put failed for {key}: {result.stderr.strip()[:500]}")


def upload_crawl_result(
    result: CrawlResult,
    repo_root: Path,
    bucket: str,
    *,
    key_prefix: str | None = None,
    wrangler_config: str | None = None,
    upload_workers: int = 6,
) -> dict:
    """Upload images + page JSON. Per-item failures are collected, not fatal alone."""
    prefix = f"{key_prefix.strip('/')}/" if key_prefix else ""
    summary: dict = {"uploaded": 0, "failed": []}
    asset_manifest = {
        "bucket": bucket,
        "generated_at_unix": int(time.time()),
        "images": [],
        "pages": [],
    }

    jobs: list[tuple[str, Path, str, str, dict | None, dict | None]] = []

    for image in result.images:
        if not image.ok or not image.optimized_path:
            continue
        key = f"{prefix}images/{image.asset_name}"
        meta = {
            "original_url": image.url,
            "r2_key": key,
            "asset_url": f"/assets/{key}",
            "section": image.section,
            "aspect": image.aspect,
            "bytes": image.bytes,
            "sha256": image.sha256,
        }
        jobs.append((
            key,
            Path(image.optimized_path),
            image.content_type or "application/octet-stream",
            IMMUTABLE_CACHE,
            meta,
            None,
        ))

    for page in result.pages:
        json_path = Path(page.json_path)
        key = f"{prefix}pages/{json_path.stem}.json"
        meta = {
            "url": page.url,
            "title": page.title,
            "r2_key": key,
            "asset_url": f"/assets/{key}",
        }
        jobs.append((
            key,
            json_path,
            "application/json; charset=utf-8",
            MUTABLE_CACHE,
            None,
            meta,
        ))

    def _one(job):
        key, path, ctype, cache, img_meta, page_meta = job
        wrangler_put(
            repo_root, bucket, key, path, ctype, cache,
            wrangler_config=wrangler_config,
        )
        return key, img_meta, page_meta

    with concurrent.futures.ThreadPoolExecutor(max_workers=upload_workers) as pool:
        futures = [pool.submit(_one, job) for job in jobs]
        for future in concurrent.futures.as_completed(futures):
            try:
                key, img_meta, page_meta = future.result()
                summary["uploaded"] += 1
                if img_meta:
                    asset_manifest["images"].append(img_meta)
                if page_meta:
                    asset_manifest["pages"].append(page_meta)
            except Exception as exc:  # noqa: BLE001
                summary["failed"].append({"error": str(exc)})

    if result.pages:
        manifest_path = Path(result.pages[0].json_path).parent.parent / "asset-manifest.json"
    else:
        manifest_path = repo_root / "asset-manifest.json"
    manifest_path.write_text(json.dumps(asset_manifest, indent=2), encoding="utf-8")
    try:
        wrangler_put(
            repo_root,
            bucket,
            f"{prefix}_meta/asset-manifest.json",
            manifest_path,
            "application/json; charset=utf-8",
            MUTABLE_CACHE,
            wrangler_config=wrangler_config,
        )
    except Exception as exc:  # noqa: BLE001
        summary["failed"].append({"key": "_meta/asset-manifest.json", "error": str(exc)})

    summary["manifest_path"] = str(manifest_path)
    return summary
