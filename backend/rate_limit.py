"""
Lightweight in-process, per-key sliding-window rate limiter.

No external dependency (Redis/slowapi) — suitable for a single-process
deployment. For multi-worker deployments, swap the backing store for Redis.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_seconds: int) -> bool:
        """Consume one slot. Return True if the request is allowed, False if rate-limited."""
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            q = self._hits[key]
            while q and q[0] < cutoff:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            return True

    def peek(self, key: str, limit: int, window_seconds: int) -> bool:
        """Return True if the next check() would succeed, WITHOUT consuming a slot."""
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            q = self._hits[key]
            while q and q[0] < cutoff:
                q.popleft()
            return len(q) < limit

    def reset(self, key: str) -> None:
        """Clear all recorded hits for a key (e.g. after a successful login)."""
        with self._lock:
            self._hits.pop(key, None)


limiter = RateLimiter()


def client_ip(request) -> str:
    """
    Resolve the real client IP for rate-limiting / lockout purposes.

    SECURITY: X-Forwarded-For is attacker-controllable. We only honour it when
    the DIRECT socket peer is a configured, trusted reverse proxy (e.g. the local
    nginx). Otherwise we use the socket peer itself. This prevents header-spoofing
    from minting a fresh rate-limit bucket on every request.
    """
    peer = request.client.host if request.client else "unknown"

    # Import here to avoid any import-order coupling; settings is a cheap singleton.
    from config import settings

    if settings.trust_proxy_headers and peer in settings.trusted_proxy_ips:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            # Left-most entry is the originating client when the chain is trusted.
            first = xff.split(",")[0].strip()
            if first:
                return first
    return peer
