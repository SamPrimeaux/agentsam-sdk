"""URL normalization and single-page content/link/image extraction."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

from .config import SKIP_EXTENSIONS, SKIP_SCHEMES, TRACKING_PARAMS
from .htmlparse import Node, parse


def clean_url(url: str, base: str | None = None) -> str:
    if base:
        url = urljoin(base, url)
    url = (url or "").strip()
    if not url or url.startswith(SKIP_SCHEMES):
        return ""
    p = urlparse(url)
    if p.scheme not in ("http", "https"):
        return ""
    query = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
             if k.lower() not in TRACKING_PARAMS]
    p = p._replace(fragment="", query=urlencode(query, doseq=True), netloc=p.netloc.lower())
    return urlunparse(p)


def canonical_host(url: str) -> str:
    host = urlparse(url).netloc.lower()
    return host[4:] if host.startswith("www.") else host


def same_site(a: str, b: str) -> bool:
    return canonical_host(a) == canonical_host(b)


def likely_html_page(url: str) -> bool:
    suffix = Path(urlparse(url).path.lower()).suffix
    return not suffix or suffix not in SKIP_EXTENSIONS


def safe_slug(url: str) -> str:
    p = urlparse(url)
    path = p.path.strip("/") or "home"
    raw = f"{p.netloc}_{path}"
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", raw).strip("-").lower()
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:8]
    return f"{slug[:110]}-{digest}"


def page_slug(url: str) -> str:
    """Short slug for naming, e.g. 'home', 'about-us' — used in image filenames."""
    p = urlparse(url)
    path = p.path.strip("/")
    if not path:
        return "home"
    slug = re.sub(r"[^a-zA-Z0-9-]+", "-", path.replace("/", "-")).strip("-").lower()
    return slug[:60] or hashlib.sha1(url.encode("utf-8")).hexdigest()[:8]


def text_clean(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def unique(items: Iterable[str]) -> list[str]:
    out, seen = [], set()
    for item in items:
        if item and item not in seen:
            seen.add(item)
            out.append(item)
    return out


def parse_srcset(value: str) -> list[str]:
    return [part.strip().split(" ")[0] for part in (value or "").split(",") if part.strip()]


def extract_background_urls(value: str) -> list[str]:
    return [m.strip(" \"'") for m in re.findall(r"url\(([^)]+)\)", value or "", flags=re.I)]


IMAGE_SRC_ATTRS = ("src", "data-src", "data-lazy-src", "data-original", "data-image", "data-bg", "data-background-image")
IMAGE_SRCSET_ATTRS = ("srcset", "data-srcset")


def best_image_urls(node: Node, page_url: str) -> list[str]:
    candidates: list[str] = []
    for attr in IMAGE_SRC_ATTRS:
        value = node.get(attr)
        if value:
            candidates.append(value)
    for attr in IMAGE_SRCSET_ATTRS:
        value = node.get(attr)
        if value:
            candidates.extend(parse_srcset(value))
    style = node.get("style")
    if style:
        candidates.extend(extract_background_urls(style))
    return unique(clean_url(x, page_url) for x in candidates if clean_url(x, page_url))


@dataclass
class ImageRef:
    url: str
    alt: str
    title: str
    ancestor_context: str  # for section classification downstream


@dataclass
class LinkRef:
    url: str
    text: str
    ancestor_context: str


@dataclass
class PageExtract:
    url: str
    title: str
    meta: dict[str, str] = field(default_factory=dict)
    content: list[dict[str, str]] = field(default_factory=list)
    links: list[LinkRef] = field(default_factory=list)
    images: list[ImageRef] = field(default_factory=list)


def extract_page(html: str, page_url: str) -> PageExtract:
    root = parse(html)

    title_node = next(iter(root.find_all("title")), None)
    title = text_clean(title_node.text_content()) if title_node else ""

    meta: dict[str, str] = {}
    for node in root.find_all("meta"):
        key = node.get("name") or node.get("property")
        value = node.get("content")
        if key and value:
            meta[key] = text_clean(value)

    links: list[LinkRef] = []
    for node in root.find_all("a"):
        href = clean_url(node.get("href"), page_url)
        if href:
            links.append(LinkRef(
                url=href,
                text=text_clean(node.text_content()),
                ancestor_context=node.ancestor_context(),
            ))

    by_url: dict[str, ImageRef] = {}
    for node in root.find_all("img", "source"):
        for url in best_image_urls(node, page_url):
            ref = ImageRef(
                url=url,
                alt=text_clean(node.get("alt")),
                title=text_clean(node.get("title")),
                ancestor_context=node.ancestor_context(),
            )
            existing = by_url.get(url)
            if existing is None or (ref.alt and not existing.alt):
                by_url[url] = ref

    for node in root.walk():
        style = node.get("style")
        if not style:
            continue
        for raw in extract_background_urls(style):
            url = clean_url(raw, page_url)
            if url and url not in by_url:
                by_url[url] = ImageRef(
                    url=url, alt="", title="css-background",
                    ancestor_context=node.ancestor_context(),
                )

    for key in ("og:image", "og:image:url", "twitter:image", "twitter:image:src"):
        if meta.get(key):
            url = clean_url(meta[key], page_url)
            if url and url not in by_url:
                by_url[url] = ImageRef(
                    url=url, alt="", title=key, ancestor_context="og-meta hero",
                )

    content: list[dict[str, str]] = []
    for node in root.find_all("h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote", "address"):
        # Prefer full descendant text — nested <span>/<strong> is common on builders.
        text = text_clean(node.text_content() or node.text)
        if text:
            content.append({"type": node.tag, "text": text})

    return PageExtract(
        url=page_url, title=title, meta=meta, content=content,
        links=links, images=list(by_url.values()),
    )
