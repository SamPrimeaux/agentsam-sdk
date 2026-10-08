"""HTTP layer: retrying requests session + robots.txt gate + thread-local sessions."""

from __future__ import annotations

import random
import threading
import time
from urllib.parse import urlparse, urljoin

from .ssrf import assert_public_http_url
from urllib.robotparser import RobotFileParser

import requests

from .config import MAX_RETRIES, REQUEST_TIMEOUT, RETRY_BACKOFF_BASE, USER_AGENT

RETRYABLE_STATUS = {429, 500, 502, 503, 504}

_thread_local = threading.local()


def new_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"})
    return session


def thread_session() -> requests.Session:
    """Per-thread Session — requests.Session is not thread-safe."""
    session = getattr(_thread_local, "session", None)
    if session is None:
        session = new_session()
        _thread_local.session = session
    return session


def _sleep_backoff(attempt: int) -> None:
    delay = RETRY_BACKOFF_BASE * (2 ** attempt) + random.uniform(0, 0.25)
    time.sleep(delay)


def get_with_retry(
    session: requests.Session,
    url: str,
    *,
    stream: bool = False,
    max_retries: int = MAX_RETRIES,
) -> requests.Response:
    """GET with exponential backoff on timeouts/connection errors and 429/5xx."""
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            current = assert_public_http_url(url, context="request")
            visited = set()
            for redirect_number in range(11):
                if current in visited:
                    raise ValueError("redirect_loop")
                visited.add(current)
                # Requests MUST NOT follow redirects automatically: validate each next hop
                # *before* any network request is made to that destination.
                response = session.get(current, timeout=REQUEST_TIMEOUT, allow_redirects=False, stream=stream)
                if response.status_code not in (301, 302, 303, 307, 308):
                    break
                location = response.headers.get("location")
                if not location:
                    break
                try:
                    next_url = assert_public_http_url(urljoin(current, location), context="redirect")
                finally:
                    response.close()
                current = next_url
            else:
                raise ValueError("too_many_redirects")
        except (requests.ConnectionError, requests.Timeout) as exc:
            last_exc = exc
            if attempt < max_retries:
                _sleep_backoff(attempt)
                continue
            raise
        if response.status_code in RETRYABLE_STATUS and attempt < max_retries:
            # Drain/close before retry — especially important for stream=True.
            try:
                response.close()
            except Exception:  # noqa: BLE001
                pass
            retry_after = response.headers.get("retry-after")
            if retry_after and retry_after.isdigit():
                time.sleep(min(int(retry_after), 30))
            else:
                _sleep_backoff(attempt)
            continue
        return response
    assert last_exc is not None
    raise last_exc


class Robots:
    """Per-host robots.txt cache (pages + images — each host gets its own lookup)."""

    def __init__(self, session: requests.Session):
        self.session = session
        self.cache: dict[str, RobotFileParser | None] = {}
        self._lock = threading.Lock()

    def allowed(self, url: str) -> bool:
        p = urlparse(url)
        root = f"{p.scheme}://{p.netloc}"
        with self._lock:
            if root not in self.cache:
                rp = RobotFileParser()
                try:
                    response = get_with_retry(self.session, root + "/robots.txt", max_retries=0)
                    if response.ok:
                        rp.parse(response.text.splitlines())
                        self.cache[root] = rp
                    else:
                        self.cache[root] = None
                except requests.RequestException:
                    self.cache[root] = None
            rp = self.cache[root]
        return True if rp is None else rp.can_fetch(USER_AGENT, url)
