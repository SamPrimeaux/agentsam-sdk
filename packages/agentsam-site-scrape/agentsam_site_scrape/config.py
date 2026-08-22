"""Shared configuration for agentsam-site-scrape.

Kept as one flat module so every other file imports constants from a single
place instead of re-declaring magic numbers/strings.
"""

from __future__ import annotations

USER_AGENT = "AgentSam-Automeaux-CMS/Primetech/v1.0"

REQUEST_TIMEOUT = 30
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 0.75  # seconds; actual wait = base * 2**attempt (+ jitter)
INTER_REQUEST_DELAY = 0.35  # polite fixed delay between requests to one host
MAX_IMAGE_BYTES = 25 * 1024 * 1024  # 25 MiB hard cap per image download

TRACKING_PARAMS = {
    "fbclid", "gclid", "dclid", "msclkid", "utm_source", "utm_medium",
    "utm_campaign", "utm_term", "utm_content", "utm_id",
}

SKIP_SCHEMES = ("mailto:", "tel:", "javascript:", "data:", "#")
SKIP_EXTENSIONS = {
    ".pdf", ".zip", ".mp4", ".mov", ".avi", ".mp3", ".wav", ".doc",
    ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
}

# Common aspect ratios (width / height), matched by nearest relative error.
# Labels use "x" instead of ":" so they're safe in filenames/R2 keys.
ASPECT_RATIOS: dict[str, float] = {
    "21x9": 21 / 9,
    "16x9": 16 / 9,
    "16x10": 16 / 10,
    "3x2": 3 / 2,
    "4x3": 4 / 3,
    "5x4": 5 / 4,
    "1x1": 1.0,
    "4x5": 4 / 5,
    "3x4": 3 / 4,
    "2x3": 2 / 3,
    "10x16": 10 / 16,
    "9x16": 9 / 16,
}
# If the nearest label's relative error exceeds this, fall back to a raw
# "WxH" ratio slug instead of a misleading nearest-match label.
ASPECT_RATIO_MAX_ERROR = 0.12

# Optimization targets by classified section: (max long-edge px, jpeg quality).
# These are starting points, not tuned against real output -- revisit after
# looking at a batch of results.
OPTIMIZE_PROFILES: dict[str, tuple[int, int]] = {
    "hero": (1920, 82),
    "gallery": (1600, 80),
    "background": (1920, 78),
    "logo": (600, 90),
    "nav": (400, 85),
    "footer": (800, 78),
    "content": (1200, 80),
}
DEFAULT_OPTIMIZE_PROFILE = (1200, 80)

# Standardized R2 binding name across every AgentSam-scraped-site worker.
# Bucket name stays per-target/per-client (matches existing account
# convention of one bucket per client) -- this binding NAME is the reusable
# part, so worker code never has to know which bucket it's talking to.
WEBSITE_ASSETS_BINDING = "WEBSITE_ASSETS"

IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
MUTABLE_CACHE = "public, max-age=300, stale-while-revalidate=3600"

# Hosts / address literals rejected for seed URL and post-redirect targets.
SSRF_BLOCKED_HOSTS = {
    "localhost",
    "metadata.google.internal",
}
SSRF_BLOCKED_PREFIXES = (
    "127.",
    "10.",
    "192.168.",
    "169.254.",
    "0.",
)
# 172.16.0.0/12 checked separately in ssrf.py
