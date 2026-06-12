"""
Centralized configuration + validation.

Reads environment variables once, validates required ones, and exposes
typed settings. Importing this module fails fast with a clear message if a
required variable is missing — instead of a raw KeyError deep in a handler.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

_REQUIRED = ["MONGO_URL", "DB_NAME", "JWT_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD"]


def _require(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        raise RuntimeError(
            f"Required environment variable '{name}' is missing or empty. "
            f"Set it in backend/.env before starting the server."
        )
    return val


def _missing() -> list[str]:
    return [n for n in _REQUIRED if not os.environ.get(n)]


class Settings:
    def __init__(self) -> None:
        missing = _missing()
        if missing:
            raise RuntimeError(
                "Missing required environment variables: "
                + ", ".join(missing)
                + ". Set them in backend/.env before starting the server."
            )
        self.mongo_url = _require("MONGO_URL")
        self.db_name = _require("DB_NAME")
        self.jwt_secret = _require("JWT_SECRET")
        self._is_prod_early = os.environ.get("ENVIRONMENT", "development").lower() == "production"
        if self._is_prod_early and len(self.jwt_secret) < 32:
            raise RuntimeError(
                "JWT_SECRET must be at least 32 characters in production "
                "(HS256 HMAC key strength)."
            )
        self.admin_email = _require("ADMIN_EMAIL")
        self.admin_password = _require("ADMIN_PASSWORD")

        # ---- Ollama (local LLM) ----
        self.ollama_base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
        self.ollama_model    = os.environ.get("OLLAMA_MODEL", "llama3.2")
        self.ollama_timeout  = int(os.environ.get("OLLAMA_TIMEOUT", "120"))

        # ---- CORS ----
        raw_cors = os.environ.get("CORS_ORIGINS", "").strip()
        self.cors_origins = [o.strip() for o in raw_cors.split(",") if o.strip()]
        self.is_production = os.environ.get("ENVIRONMENT", "development").lower() == "production"

        # ---- Input caps for the public insights endpoint ----
        self.insights_max_colleges = int(os.environ.get("INSIGHTS_MAX_COLLEGES", "8"))
        self.insights_max_field_len = int(os.environ.get("INSIGHTS_MAX_FIELD_LEN", "120"))

        # ---- Global per-IP rate limiting ----
        self.rate_limit_requests        = int(os.environ.get("RATE_LIMIT_REQUESTS", "60"))
        self.rate_limit_window_seconds  = int(os.environ.get("RATE_LIMIT_WINDOW_SECONDS", "60"))
        self.insights_rate_limit_requests       = int(os.environ.get("INSIGHTS_RATE_LIMIT_REQUESTS", "5"))
        self.insights_rate_limit_window_seconds = int(os.environ.get("INSIGHTS_RATE_LIMIT_WINDOW_SECONDS", "60"))

        # ---- Brute-force login protection ----
        self.login_max_attempts      = int(os.environ.get("LOGIN_MAX_ATTEMPTS", "5"))
        self.login_lockout_seconds   = int(os.environ.get("LOGIN_LOCKOUT_SECONDS", "900"))  # 15 min

        # ---- Request safety ----
        self.max_request_body_bytes = int(os.environ.get("MAX_REQUEST_BODY_BYTES", str(64 * 1024)))  # 64 KB
        self.request_timeout_seconds = int(os.environ.get("REQUEST_TIMEOUT_SECONDS", "30"))
        # LLM requests are allowed longer (model inference can take time).
        self.llm_timeout_seconds = int(os.environ.get("LLM_TIMEOUT_SECONDS", "150"))

        # ---- Proxy trust (critical for correct client-IP attribution) ----
        # X-Forwarded-For is only honoured when the DIRECT peer (the socket the
        # request actually arrived on) is a trusted reverse proxy.  This stops
        # attackers from spoofing the header to evade per-IP rate limits and
        # brute-force lockout.  Default: trust only the local nginx on loopback.
        self.trust_proxy_headers = os.environ.get("TRUST_PROXY_HEADERS", "true").lower() == "true"
        raw_proxies = os.environ.get("TRUSTED_PROXY_IPS", "127.0.0.1,::1").strip()
        self.trusted_proxy_ips = {p.strip() for p in raw_proxies.split(",") if p.strip()}

    @property
    def cors_allow_all(self) -> bool:
        """True when no explicit allowlist is configured (wildcard mode)."""
        return not bool(self.cors_origins) and not self.is_production

    def effective_cors_origins(self) -> list[str]:
        if self.cors_origins:
            return self.cors_origins
        # No explicit allowlist configured.
        if self.is_production:
            # Fail closed in production rather than echoing every origin.
            return []
        # Wildcard dev mode — signal the caller to use allow_origin_regex instead
        # so Starlette's allow_credentials+wildcard restriction is not triggered.
        return ["*"]


settings = Settings()
