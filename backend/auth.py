"""
Admin authentication — email + password with JWT (Bearer token).

Single seeded admin account (from ADMIN_EMAIL / ADMIN_PASSWORD in .env).
Tokens are short-lived JWTs sent via the Authorization: Bearer header.
All /api/admin/* routes are protected by middleware in server.py.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_HOURS = 12


def _secret() -> str:
    return os.environ["JWT_SECRET"]


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


def bearer_from_header(authorization: str) -> Optional[str]:
    if authorization and authorization.startswith("Bearer "):
        return authorization[7:]
    return None


# ---------------- Admin seeding + login ----------------
async def seed_admin(db) -> None:
    """Idempotent: create the admin if missing; sync password if it changed in .env."""
    email = os.environ["ADMIN_EMAIL"].lower()
    password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": email})
    if existing is None:
        await db.users.insert_one({
            "email": email,
            "password_hash": hash_password(password),
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    elif not verify_password(password, existing.get("password_hash", "")):
        await db.users.update_one(
            {"email": email}, {"$set": {"password_hash": hash_password(password)}})


async def authenticate(db, email: str, password: str) -> Optional[dict]:
    user = await db.users.find_one({"email": (email or "").lower()})
    if not user or not verify_password(password, user.get("password_hash", "")):
        return None
    return {"email": user["email"], "name": user.get("name", "Admin"), "role": user.get("role", "admin")}
