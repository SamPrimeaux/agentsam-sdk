"""Heuristic section classification + aspect-ratio naming."""

from __future__ import annotations

import math
import threading
from dataclasses import dataclass
from fractions import Fraction

from .config import ASPECT_RATIO_MAX_ERROR, ASPECT_RATIOS

# Order matters: first match wins. Logo/nav checked before hero/gallery
# since a logo often sits inside a <header> that would otherwise also match.
SECTION_TOKEN_SETS: list[tuple[str, frozenset[str]]] = [
    ("logo", frozenset({"logo", "brand", "brandmark", "sitelogo"})),
    ("nav", frozenset({"nav", "navbar", "menu", "navigation", "headernav"})),
    ("hero", frozenset({"hero", "banner", "masthead", "jumbotron"})),
    ("gallery", frozenset({"gallery", "portfolio", "project", "carousel", "slider"})),
    ("footer", frozenset({"footer"})),
]


def classify_section(ancestor_context: str, image_title_hint: str = "") -> str:
    hint = (image_title_hint or "").lower()
    if "css-background" in hint:
        return "background"
    tokens = set((ancestor_context or "").lower().replace("_", "-").split())
    # Also split hyphenated class pieces already flattened into context.
    for section, keywords in SECTION_TOKEN_SETS:
        if tokens & keywords:
            return section
        # Substring fallback for compound tokens like "site-logo" already split,
        # and for discovery-style "nav" inside longer joined strings.
        joined = f" {ancestor_context} {hint} ".lower()
        if any(f" {kw} " in joined or f"-{kw}-" in joined or f"-{kw} " in joined for kw in keywords):
            return section
    return "content"


def aspect_label(width: int, height: int) -> str:
    """Nearest common aspect-ratio label, or raw reduced WxH slug."""
    if width <= 0 or height <= 0:
        return "unknown"
    ratio = width / height
    best_label, best_error = None, math.inf
    for label, target in ASPECT_RATIOS.items():
        error = abs(ratio - target) / target
        if error < best_error:
            best_label, best_error = label, error
    if best_label is not None and best_error <= ASPECT_RATIO_MAX_ERROR:
        return best_label
    frac = Fraction(width, height).limit_denominator(32)
    return f"{frac.numerator}x{frac.denominator}"


@dataclass
class AssetName:
    page_slug: str
    section: str
    aspect: str
    index: int  # 1-based within (page_slug, section, aspect); >1 appends -02 etc.

    def stem(self) -> str:
        base = f"{self.page_slug}-{self.section}-{self.aspect}"
        return base if self.index == 1 else f"{base}-{self.index:02d}"


class AssetNamer:
    """Thread-safe per-crawl namer for (page_slug, section, aspect) stems."""

    def __init__(self) -> None:
        self._counts: dict[tuple[str, str, str], int] = {}
        self._lock = threading.Lock()

    def next(self, page_slug: str, section: str, aspect: str) -> AssetName:
        key = (page_slug, section, aspect)
        with self._lock:
            self._counts[key] = self._counts.get(key, 0) + 1
            index = self._counts[key]
        return AssetName(page_slug=page_slug, section=section, aspect=aspect, index=index)
