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

        self.emergent_llm_key = os.environ.get("EMERGENT_LLM_KEY", "")

        # CORS: comma-separated allowlist. "*" is allowed only in dev.
        raw_cors = os.environ.get("CORS_ORIGINS", "").strip()
        self.cors_origins = [o.strip() for o in raw_cors.split(",") if o.strip()]
        self.is_production = os.environ.get("ENVIRONMENT", "development").lower() == "production"

        # Input caps for the public insights endpoint.
        self.insights_max_colleges = int(os.environ.get("INSIGHTS_MAX_COLLEGES", "8"))
        self.insights_max_field_len = int(os.environ.get("INSIGHTS_MAX_FIELD_LEN", "120"))

        # Simple per-IP rate limiting (requests per window-seconds).
        self.rate_limit_requests = int(os.environ.get("RATE_LIMIT_REQUESTS", "30"))
        self.rate_limit_window_seconds = int(os.environ.get("RATE_LIMIT_WINDOW_SECONDS", "60"))
        # Tighter limit for the expensive LLM endpoint.
        self.insights_rate_limit_requests = int(os.environ.get("INSIGHTS_RATE_LIMIT_REQUESTS", "5"))
        self.insights_rate_limit_window_seconds = int(os.environ.get("INSIGHTS_RATE_LIMIT_WINDOW_SECONDS", "60"))

    def effective_cors_origins(self) -> list[str]:
        if self.cors_origins:
            return self.cors_origins
        # No explicit allowlist configured.
        if self.is_production:
            # Fail closed in production rather than echoing every origin.
            return []
        return ["*"]


settings = Settings()
