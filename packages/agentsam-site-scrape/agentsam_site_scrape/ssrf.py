"""SSRF deny-list for seed URLs and post-redirect final URLs.

Interactive typing is low risk; `--yes` and any future API trigger are not.
Block loopback, RFC1918, link-local, and cloud metadata endpoints.
"""

from __future__ import annotations

import ipaddress
from urllib.parse import urlparse

from .config import SSRF_BLOCKED_HOSTS, SSRF_BLOCKED_PREFIXES


def _is_blocked_ip(host: str) -> bool:
    try:
        ip = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        return False
    return bool(
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def assert_public_http_url(url: str, *, context: str = "url") -> str:
    """Raise ValueError if `url` is not a public http(s) target."""
    raw = (url or "").strip()
    if not raw:
        raise ValueError(f"{context}: empty")
    p = urlparse(raw)
    if p.scheme not in ("http", "https"):
        raise ValueError(f"{context}: scheme must be http or https")
    host = (p.hostname or "").lower()
    if not host:
        raise ValueError(f"{context}: missing host")
    if host in SSRF_BLOCKED_HOSTS or host.endswith(".localhost"):
        raise ValueError(f"{context}: blocked host {host}")
    if _is_blocked_ip(host):
        raise ValueError(f"{context}: blocked address {host}")
    for prefix in SSRF_BLOCKED_PREFIXES:
        if host.startswith(prefix):
            raise ValueError(f"{context}: blocked address prefix {host}")
    # 172.16.0.0/12 as dotted host string (when not parsed as IP above)
    if host.startswith("172."):
        try:
            second = int(host.split(".")[1])
            if 16 <= second <= 31:
                raise ValueError(f"{context}: blocked address {host}")
        except (IndexError, ValueError) as exc:
            if "blocked address" in str(exc):
                raise
    return raw
