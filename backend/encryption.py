"""
Field-level encryption for sensitive values stored in MongoDB.

Uses Fernet (AES-128-CBC + HMAC-SHA256) from the `cryptography` package.
Encrypted values are stored as URL-safe base64 strings prefixed with "enc:".
Unencrypted values stored before encryption was enabled are read through
transparently (backwards-compatible).

Key management:
  - Derive a Fernet key from DB_ENCRYPTION_KEY in .env
  - If not set, encryption/decryption is a no-op (values stored in plain text).
    Set the key before going to production.

Generate a key:
    python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Set in backend/.env:
    DB_ENCRYPTION_KEY=<base64-encoded 32-byte key from above>
"""
from __future__ import annotations

import base64
import logging
import os

logger = logging.getLogger("filed.encryption")

_PREFIX = "enc:"

try:
    from cryptography.fernet import Fernet, InvalidToken
    _HAS_CRYPTO = True
except ImportError:                          # should never happen — listed in requirements
    _HAS_CRYPTO = False
    logger.warning("cryptography package not installed — field encryption disabled")


def _fernet() -> "Fernet | None":
    raw_key = os.environ.get("DB_ENCRYPTION_KEY", "").strip()
    if not raw_key or not _HAS_CRYPTO:
        return None
    try:
        return Fernet(raw_key.encode())
    except Exception as exc:
        logger.error("Invalid DB_ENCRYPTION_KEY: %s — encryption disabled", exc)
        return None


def encrypt(value: str) -> str:
    """Encrypt a string for storage. Returns the value unchanged if no key is set."""
    if not value:
        return value
    f = _fernet()
    if f is None:
        return value
    return _PREFIX + f.encrypt(value.encode("utf-8")).decode("ascii")


def decrypt(value: str) -> str:
    """Decrypt a stored value. Handles both encrypted and plaintext (migration-safe)."""
    if not value:
        return value
    if not value.startswith(_PREFIX):
        return value     # stored before encryption was enabled
    f = _fernet()
    if f is None:
        return value[len(_PREFIX):]   # key not configured; return raw ciphertext (log it)
    try:
        return f.decrypt(value[len(_PREFIX):].encode("ascii")).decode("utf-8")
    except (InvalidToken, Exception) as exc:
        logger.error("Failed to decrypt field: %s", exc)
        return ""        # fail safe — never crash on bad ciphertext
