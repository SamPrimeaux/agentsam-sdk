"""Two-phase crawl: discovery pass, then BFS + threaded image pipeline."""

from __future__ import annotations

import concurrent.futures
import hashlib
import json
import mimetypes
import re
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

import requests

from . import net
from .classify import AssetNamer, aspect_label, classify_section
from .config import DEFAULT_OPTIMIZE_PROFILE, MAX_IMAGE_BYTES, OPTIMIZE_PROFILES
from .imageops import optimize_image, read_dimensions, sniff_image_ext
from .pageextract import (
    ImageRef,
    clean_url,
    extract_page,
    likely_html_page,
    page_slug,
    safe_slug,
    same_site,
)
from .ssrf import assert_public_http_url


@dataclass
class DiscoveryResult:
    seed_url: str
    title: str
    nav_candidates: list[str]
    other_candidates: list[str]
    fetch_error: str | None = None


def discover(
    seed_url: str,
    session: requests.Session,
    robots: net.Robots,
    ignore_robots: bool,
) -> DiscoveryResult:
    seed_url = clean_url(seed_url)
    try:
        assert_public_http_url(seed_url, context="seed")
    except ValueError as exc:
        return DiscoveryResult(seed_url, "", [], [], fetch_error=str(exc))
    if not ignore_robots and not robots.allowed(seed_url):
        return DiscoveryResult(seed_url, "", [], [], fetch_error="blocked_by_robots")
    try:
        response = net.get_with_retry(session, seed_url)
        response.raise_for_status()
        final_url = clean_url(response.url)
        assert_public_http_url(final_url, context="redirect")
        if not same_site(seed_url, final_url):
            return DiscoveryResult(seed_url, "", [], [], fetch_error="redirect_left_site")
        if "text/html" not in response.headers.get("content-type", "").lower():
            return DiscoveryResult(seed_url, "", [], [], fetch_error="not_html")
        page = extract_page(response.text, final_url)
    except Exception as exc:  # noqa: BLE001
        return DiscoveryResult(seed_url, "", [], [], fetch_error=f"{type(exc).__name__}: {exc}")

    nav_set, other_set, seen = [], [], set()
    for link in page.links:
        if not same_site(seed_url, link.url) or not likely_html_page(link.url):
            continue
        if link.url in seen:
            continue
        seen.add(link.url)
        tokens = set(link.ancestor_context.split())
        if tokens & {"nav", "navbar", "menu", "header", "navigation"} or any(
            kw in link.ancestor_context for kw in ("nav", "menu", "header")
        ):
            nav_set.append(link.url)
        else:
            other_set.append(link.url)

    return DiscoveryResult(
        seed_url=seed_url, title=page.title,
        nav_candidates=nav_set, other_candidates=other_set,
    )


@dataclass
class PageResult:
    url: str
    title: str
    json_path: str
    image_count: int


@dataclass
class ImageResult:
    url: str
    ok: bool
    page_slug: str
    section: str = ""
    aspect: str = ""
    asset_name: str = ""
    raw_path: str | None = None
    optimized_path: str | None = None
    content_type: str | None = None
    bytes: int | None = None
    sha256: str | None = None
    optimize_status: str | None = None
    error: str | None = None


@dataclass
class CrawlResult:
    target: str
    seed_urls: list[str]
    pages: list[PageResult] = field(default_factory=list)
    images: list[ImageResult] = field(default_factory=list)
    errors: list[dict] = field(default_factory=list)


def _extension_for(content_type: str, url: str, sniffed: str | None = None) -> str:
    if sniffed:
        return sniffed
    mime = (content_type or "").split(";")[0].strip().lower()
    ext = mimetypes.guess_extension(mime) if mime else None
    if ext == ".jpe":
        ext = ".jpg"
    if ext:
        return ext
    suffix = Path(urlparse(url).path).suffix.lower()
    return suffix if re.fullmatch(r"\.[a-z0-9]{2,5}", suffix) else ".bin"


def _download_raw_image(
    robots: net.Robots,
    ignore_robots: bool,
    image: ImageRef,
    page_slug_for_image: str,
    raw_dir: Path,
) -> ImageResult:
    """Parallel-safe download to hash-named raw file (naming happens serially after)."""
    url = image.url
    if not ignore_robots and not robots.allowed(url):
        return ImageResult(url=url, ok=False, page_slug=page_slug_for_image, error="blocked_by_robots")

    session = net.thread_session()
    try:
        response = net.get_with_retry(session, url, stream=True)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "")
        cl = response.headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > MAX_IMAGE_BYTES:
            response.close()
            return ImageResult(
                url=url, ok=False, page_slug=page_slug_for_image,
                error=f"too_large:{cl}",
            )

        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:20]
        raw_dir.mkdir(parents=True, exist_ok=True)
        tmp_path = raw_dir / f"{digest}.part"
        total = 0
        head = b""
        with tmp_path.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=131072):
                if not chunk:
                    continue
                if len(head) < 64:
                    need = 64 - len(head)
                    head += chunk[:need]
                total += len(chunk)
                if total > MAX_IMAGE_BYTES:
                    handle.close()
                    tmp_path.unlink(missing_ok=True)
                    response.close()
                    return ImageResult(
                        url=url, ok=False, page_slug=page_slug_for_image,
                        error="too_large:stream",
                    )
                handle.write(chunk)

        sniffed = sniff_image_ext(head)
        ct_ok = content_type.lower().startswith("image/")
        if not ct_ok and not sniffed:
            tmp_path.unlink(missing_ok=True)
            return ImageResult(
                url=url, ok=False, page_slug=page_slug_for_image,
                error=f"not_image:{content_type or 'empty'}",
            )

        ext = _extension_for(content_type, url, sniffed)
        raw_path = raw_dir / f"{digest}{ext}"
        tmp_path.replace(raw_path)

        return ImageResult(
            url=url,
            ok=True,
            page_slug=page_slug_for_image,
            raw_path=str(raw_path),
            content_type=(content_type.split(";")[0] if ct_ok else f"image/{ext.lstrip('.')}"),
        )
    except Exception as exc:  # noqa: BLE001
        return ImageResult(
            url=url, ok=False, page_slug=page_slug_for_image,
            error=f"{type(exc).__name__}: {exc}",
        )


def _finalize_image(
    downloaded: ImageResult,
    image: ImageRef,
    optimized_dir: Path,
    namer: AssetNamer,
    optimize: bool,
    allow_unoptimized: bool,
) -> ImageResult:
    if not downloaded.ok or not downloaded.raw_path:
        return downloaded

    raw_path = Path(downloaded.raw_path)
    dims = read_dimensions(raw_path)
    width, height = dims if dims else (0, 0)
    section = classify_section(image.ancestor_context, image.title)
    aspect = aspect_label(width, height) if dims else "unknown"
    name = namer.next(downloaded.page_slug, section, aspect)
    ext = raw_path.suffix or ".bin"
    optimized_path = optimized_dir / f"{name.stem()}{ext}"

    try:
        if optimize:
            max_edge, quality = OPTIMIZE_PROFILES.get(section, DEFAULT_OPTIMIZE_PROFILE)
            status = optimize_image(
                raw_path, optimized_path, max_edge, quality,
                allow_unoptimized=allow_unoptimized,
            )
        else:
            optimized_dir.mkdir(parents=True, exist_ok=True)
            optimized_path.write_bytes(raw_path.read_bytes())
            status = "copied:optimize-disabled"
    except RuntimeError as exc:
        return ImageResult(
            url=downloaded.url, ok=False, page_slug=downloaded.page_slug,
            section=section, aspect=aspect, error=str(exc),
        )

    file_bytes = optimized_path.stat().st_size
    sha256 = hashlib.sha256(optimized_path.read_bytes()).hexdigest()
    return ImageResult(
        url=downloaded.url,
        ok=True,
        page_slug=downloaded.page_slug,
        section=section,
        aspect=aspect,
        asset_name=f"{name.stem()}{ext}",
        raw_path=str(raw_path),
        optimized_path=str(optimized_path),
        content_type=downloaded.content_type,
        bytes=file_bytes,
        sha256=sha256,
        optimize_status=status,
    )


def crawl(
    target: str,
    confirmed_urls: list[str],
    out_dir: Path,
    *,
    expand_domain: bool,
    max_pages: int,
    delay: float,
    download_images: bool,
    optimize: bool,
    ignore_robots: bool,
    image_workers: int = 8,
    allow_unoptimized: bool = False,
) -> CrawlResult:
    session = net.new_session()
    robots = net.Robots(session)

    target_dir = out_dir / target
    pages_dir, raw_dir, optimized_dir = target_dir / "pages", target_dir / "_raw", target_dir / "images"
    pages_dir.mkdir(parents=True, exist_ok=True)

    seed_set = [clean_url(u) for u in confirmed_urls]
    for u in seed_set:
        assert_public_http_url(u, context="confirmed_url")

    queue: deque[str] = deque(seed_set)
    queued = set(seed_set)
    visited: set[str] = set()
    pages: list[PageResult] = []
    all_images: dict[str, tuple[ImageRef, str]] = {}
    errors: list[dict] = []

    while queue and len(visited) < max_pages:
        url = queue.popleft()
        if url in visited:
            continue
        visited.add(url)
        if not ignore_robots and not robots.allowed(url):
            errors.append({"url": url, "error": "blocked_by_robots"})
            continue
        try:
            response = net.get_with_retry(session, url)
            response.raise_for_status()
            final_url = clean_url(response.url)
            assert_public_http_url(final_url, context="redirect")
            if not same_site(seed_set[0], final_url):
                errors.append({"url": url, "error": "redirect_left_site"})
                continue
            if "text/html" not in response.headers.get("content-type", "").lower():
                raise ValueError("response is not HTML")
            page = extract_page(response.text, final_url)

            slug = safe_slug(final_url)
            json_path = pages_dir / f"{slug}.json"
            json_path.write_text(
                json.dumps(
                    {"url": page.url, "title": page.title, "meta": page.meta, "content": page.content},
                    indent=2, ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            pages.append(PageResult(
                url=final_url, title=page.title,
                json_path=str(json_path), image_count=len(page.images),
            ))

            p_slug = page_slug(final_url)
            for image in page.images:
                all_images.setdefault(image.url, (image, p_slug))

            if expand_domain:
                for link in page.links:
                    next_url = link.url
                    if (
                        next_url
                        and same_site(seed_set[0], next_url)
                        and likely_html_page(next_url)
                        and next_url not in queued
                        and next_url not in visited
                    ):
                        queued.add(next_url)
                        queue.append(next_url)
        except Exception as exc:  # noqa: BLE001
            errors.append({"url": url, "error": f"{type(exc).__name__}: {exc}"})
        if delay:
            time.sleep(delay)

    images: list[ImageResult] = []
    if download_images and all_images:
        # Phase A: parallel download to hash-named raw files
        downloaded: list[tuple[ImageResult, ImageRef]] = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=image_workers) as pool:
            futures = {
                pool.submit(
                    _download_raw_image, robots, ignore_robots, ref, p_slug, raw_dir,
                ): ref
                for ref, p_slug in all_images.values()
            }
            for future in concurrent.futures.as_completed(futures):
                ref = futures[future]
                result = future.result()
                downloaded.append((result, ref))
                if delay:
                    time.sleep(min(delay, 0.15))

        # Phase B: serial name + optimize (collision-safe, sips fail-loud once)
        namer = AssetNamer()
        for dl, ref in downloaded:
            images.append(_finalize_image(
                dl, ref, optimized_dir, namer, optimize, allow_unoptimized,
            ))

    result = CrawlResult(
        target=target, seed_urls=seed_set, pages=pages, images=images, errors=errors,
    )
    manifest = {
        "target": target,
        "seed_urls": seed_set,
        "pages": [p.__dict__ for p in pages],
        "images": [i.__dict__ for i in images],
        "errors": errors,
        "generated_at_unix": int(time.time()),
    }
    (target_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8",
    )
    return result
