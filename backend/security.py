"""
Security middleware stack for Filed.

Provides, in a single importable module:
  1. SecurityHeadersMiddleware  — HSTS, CSP, X-Frame-Options, Referrer-Policy, etc.
  2. RequestSizeLimitMiddleware — reject oversized request bodies before they are parsed.
  3. TimeoutMiddleware          — abort requests that exceed the configured wall-clock limit.
  4. BotShieldMiddleware        — block known bad User-Agents; log suspicious access.
  5. AntiScrapingMiddleware     — per-route stricter rate caps + bulk-access pattern detection.
  6. HoneypotMiddleware         — log and block access to trap endpoints.

All middleware is pure Python / Starlette — no new packages required beyond what is already
installed.  Wire them in server.py via app.add_middleware() in outermost-first order.
"""
from __future__ import annotations

import logging
import time
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from rate_limit import limiter, client_ip

logger = logging.getLogger("filed.security")

# ---------------------------------------------------------------------------
# 1.  Security Headers
# ---------------------------------------------------------------------------
_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline'; "   # CRA inlines scripts; tighten when switching to Vite
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; "
    "font-src 'self'; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'"
)

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
    "Cache-Control": "no-store",               # API responses must not be cached by proxies
    "Content-Security-Policy": _CSP,
}

_HSTS = "max-age=63072000; includeSubDomains; preload"   # 2-year HSTS


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach security headers to every response and redirect HTTP→HTTPS in production."""

    def __init__(self, app, is_production: bool = False):
        super().__init__(app)
        self._is_production = is_production

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Hard redirect HTTP→HTTPS when behind a TLS-terminating proxy.
        if self._is_production:
            proto = request.headers.get("x-forwarded-proto", "https")
            if proto == "http":
                url = request.url.replace(scheme="https")
                return Response(status_code=301, headers={"Location": str(url)})

        response = await call_next(request)
        for key, val in SECURITY_HEADERS.items():
            response.headers[key] = val
        if self._is_production:
            response.headers["Strict-Transport-Security"] = _HSTS
        # Remove headers that reveal implementation details.
        if "server" in response.headers:
            del response.headers["server"]
        if "x-powered-by" in response.headers:
            del response.headers["x-powered-by"]
        return response


# ---------------------------------------------------------------------------
# 2.  Request Body Size Limit
# ---------------------------------------------------------------------------
class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject request bodies larger than max_bytes before any parsing occurs."""

    def __init__(self, app, max_bytes: int = 1024 * 64):   # 64 KB default
        super().__init__(app)
        self._max = max_bytes

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        cl = request.headers.get("content-length")
        if cl is not None:
            try:
                declared = int(cl)
            except (ValueError, TypeError):
                return JSONResponse(status_code=400, content={"detail": "Invalid Content-Length."})
            if declared > self._max:
                return JSONResponse(status_code=413, content={"detail": "Request body too large."})
        # NOTE: chunked requests omit Content-Length. The authoritative body cap
        # MUST also be enforced at nginx (client_max_body_size) — see deploy/nginx.conf.
        return await call_next(request)


# ---------------------------------------------------------------------------
# 3.  Request Timeout
# ---------------------------------------------------------------------------
import asyncio


class TimeoutMiddleware(BaseHTTPMiddleware):
    """Kill requests that exceed the configured timeout (default 30 s)."""

    def __init__(self, app, timeout_seconds: int = 30):
        super().__init__(app)
        self._timeout = timeout_seconds

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        try:
            return await asyncio.wait_for(call_next(request), timeout=self._timeout)
        except asyncio.TimeoutError:
            logger.warning("Request timeout: %s %s from %s",
                           request.method, request.url.path, client_ip(request))
            return JSONResponse(
                status_code=504,
                content={"detail": "Request timed out."},
            )


# ---------------------------------------------------------------------------
# 4.  Bot Shield
# ---------------------------------------------------------------------------
_BAD_UA_FRAGMENTS = [
    # Known scraping frameworks / headless browsers when used as raw UA
    "python-requests", "go-http-client", "java/", "curl/", "wget/",
    "scrapy", "mechanize", "libwww-perl",
    # Blank or missing UAs are flagged but given a softer treatment (see below)
]

_ALLOWED_EMPTY_UA_PATHS = {"/api/", "/api"}   # internal health probes are OK


class BotShieldMiddleware(BaseHTTPMiddleware):
    """
    Reject requests from well-known scraping tools.

    Legitimate browsers always send a User-Agent. Missing / blank UAs on API
    routes are blocked unless the path is in the allow-list.  The rule is
    soft-logged for monitoring: adjust to hard-block once you have confirmed
    no false positives from your own services.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        ua = request.headers.get("user-agent", "").lower()
        path = request.url.path

        # Hard block known bad UAs on API routes
        if path.startswith("/api/") and any(frag in ua for frag in _BAD_UA_FRAGMENTS):
            ip = client_ip(request)
            logger.warning("BotShield: blocked %s (UA: %.80s) path=%s", ip, ua, path)
            return JSONResponse(
                status_code=403,
                content={"detail": "Automated access is not permitted."},
            )

        # Log missing UA on non-trivial API routes (don't hard-block yet)
        if path.startswith("/api/") and not ua and path not in _ALLOWED_EMPTY_UA_PATHS:
            logger.info("BotShield: missing UA from %s on %s", client_ip(request), path)

        return await call_next(request)


# ---------------------------------------------------------------------------
# 5.  Anti-Scraping — per-route tighter caps
# ---------------------------------------------------------------------------

# (route_prefix, requests, window_seconds) — checked AFTER the global cap.
_SCRAPE_RULES: list[tuple[str, int, int]] = [
    ("/api/colleges",    20, 60),    # public bulk-data endpoint: 20 req/min per IP
    ("/api/insights",     5, 60),    # LLM endpoint already capped; reinforced here
    ("/api/auth/login",  10, 300),   # brute-force supplement (auth.py has its own)
]


class AntiScrapingMiddleware(BaseHTTPMiddleware):
    """Apply per-route rate caps tighter than the global limit."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.method == "OPTIONS":
            return await call_next(request)
        ip = client_ip(request)
        path = request.url.path
        for prefix, req_limit, window in _SCRAPE_RULES:
            if path.startswith(prefix):
                key = f"route:{prefix}:{ip}"
                if not limiter.check(key, req_limit, window):
                    logger.warning("AntiScraping: rate-limit hit %s on %s", ip, prefix)
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "Too many requests to this endpoint. Please slow down."},
                    )
        return await call_next(request)


# ---------------------------------------------------------------------------
# 6.  Honeypot — traps for common vulnerability scanners
# ---------------------------------------------------------------------------
_HONEYPOT_PATHS = {
    "/wp-admin", "/wp-login.php", "/.env", "/.git/config",
    "/phpinfo.php", "/config.php", "/setup.php", "/install.php",
    "/actuator", "/actuator/health", "/debug", "/console",
    "/.aws/credentials", "/etc/passwd",
}


class HoneypotMiddleware(BaseHTTPMiddleware):
    """
    Return 404 for well-known scanner paths and permanently block the IP
    from the rate-limiter bucket (effectively denies all further requests
    within the window — no external ban list required).
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path.rstrip("/").lower()
        if path in _HONEYPOT_PATHS:
            ip = client_ip(request)
            logger.warning("Honeypot: scanner detected %s → %s", ip, path)
            # Exhaust the global rate-limit bucket for this IP instantly.
            for _ in range(1000):
                limiter.check(f"global:{ip}", 1, 3600)
            return JSONResponse(status_code=404, content={"detail": "Not found."})
        return await call_next(request)
