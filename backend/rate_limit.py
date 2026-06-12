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
    """Best-effort client IP, honoring a single X-Forwarded-For hop."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
