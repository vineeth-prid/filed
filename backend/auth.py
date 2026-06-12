"""
Admin authentication — email + password with JWT (Bearer token).

Single seeded admin account (from ADMIN_EMAIL / ADMIN_PASSWORD in .env).
Tokens are short-lived JWTs sent via the Authorization: Bearer header.
All /api/admin/* routes are protected by middleware in server.py.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt

from config import settings
from rate_limit import RateLimiter
from encryption import encrypt as enc_field, decrypt as dec_field

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_HOURS = 12

# Separate limiter for brute-force login protection — tracks failures only.
_login_limiter = RateLimiter()


def _secret() -> str:
    return settings.jwt_secret


# ---------------- Password hashing ----------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ---------------- JWT ----------------
def create_access_token(email: str, role: str = "admin") -> str:
    payload = {
        "sub": email,
        "role": role,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except jwt.PyJWTError:
        return None


def is_admin_token(token: str) -> bool:
    """A valid, non-expired access token whose role claim is 'admin'."""
    payload = decode_token(token)
    return bool(payload and payload.get("role") == "admin")


def bearer_from_header(authorization: str) -> Optional[str]:
    if authorization and authorization.startswith("Bearer "):
        return authorization[7:]
    return None


# ---------------- Admin seeding + login ----------------
async def seed_admin(db) -> None:
    """Idempotent: create the admin if missing; sync password if it changed in .env."""
    email = settings.admin_email.lower()
    password = settings.admin_password
    # Email stored encrypted; query by encrypted value.
    stored_email = enc_field(email)
    existing = await db.users.find_one({"email": stored_email})
    # Backwards-compat: also check plaintext email (migration path).
    if existing is None:
        existing = await db.users.find_one({"email": email})
        if existing:
            # Upgrade plaintext → encrypted in place.
            await db.users.update_one(
                {"email": email}, {"$set": {"email": stored_email}}
            )
    if existing is None:
        await db.users.insert_one({
            "email": stored_email,
            "password_hash": hash_password(password),
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    elif not verify_password(password, existing.get("password_hash", "")):
        await db.users.update_one(
            {"email": stored_email}, {"$set": {"password_hash": hash_password(password)}})


def is_login_locked(ip: str, email: str) -> bool:
    """True if this IP or email account is currently locked out (no slot consumed)."""
    max_a = settings.login_max_attempts
    win   = settings.login_lockout_seconds
    return not _login_limiter.peek(f"login_ip:{ip}", max_a, win) \
        or not _login_limiter.peek(f"login_em:{email}", max_a, win)


def record_login_failure(ip: str, email: str) -> None:
    """Consume a slot in both the IP and email failure buckets."""
    _login_limiter.check(f"login_ip:{ip}",    settings.login_max_attempts, settings.login_lockout_seconds)
    _login_limiter.check(f"login_em:{email}", settings.login_max_attempts, settings.login_lockout_seconds)


def clear_login_failures(ip: str, email: str) -> None:
    """Wipe failure history on successful login."""
    _login_limiter.reset(f"login_ip:{ip}")
    _login_limiter.reset(f"login_em:{email}")


async def authenticate(db, email: str, password: str, ip: str = "unknown") -> Optional[dict]:
    """Return the user dict on success, None on failure.  Enforces brute-force lockout."""
    email = (email or "").lower()
    if is_login_locked(ip, email):
        return None  # locked — caller raises 429
    # Try encrypted email first, fall back to plaintext (migration path).
    user = await db.users.find_one({"email": enc_field(email)})
    if user is None:
        user = await db.users.find_one({"email": email})
    if not user or not verify_password(password, user.get("password_hash", "")):
        record_login_failure(ip, email)
        return None
    clear_login_failures(ip, email)
    return {
        "email": dec_field(user["email"]),
        "name": user.get("name", "Admin"),
        "role": user.get("role", "admin"),
    }
