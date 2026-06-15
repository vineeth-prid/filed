"""Backend tests for admin JWT authentication and route gating."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://data-intake-hub-4.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "vini.roks@gmail.com"
ADMIN_PASSWORD = "Admin!123@"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(session):
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data
    return data["access_token"]


# ---------------- Login ----------------
class TestLogin:
    def test_login_correct_credentials(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("access_token"), str) and len(data["access_token"]) > 20
        assert data.get("token_type") == "bearer"
        assert data["user"]["email"].lower() == ADMIN_EMAIL.lower()
        assert data["user"]["role"] == "admin"

    def test_login_wrong_password(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong-pass"}, timeout=30)
        assert r.status_code == 401

    def test_login_unknown_email(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login", json={"email": "nobody@example.com", "password": "whatever"}, timeout=30)
        assert r.status_code == 401


# ---------------- /auth/me ----------------
class TestAuthMe:
    def test_me_with_valid_token(self, session, admin_token):
        r = session.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["email"].lower() == ADMIN_EMAIL.lower()
        assert data["role"] == "admin"

    def test_me_without_token(self, session):
        r = session.get(f"{BASE_URL}/api/auth/me", timeout=30)
        assert r.status_code == 401

    def test_me_with_garbage_token(self, session):
        r = session.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": "Bearer not-a-jwt"}, timeout=30)
        assert r.status_code == 401


# ---------------- Admin gate ----------------
ADMIN_ENDPOINTS = [
    "/api/admin/nirf/overview",
    "/api/admin/nirf/extractions",
    "/api/admin/nirf/intelligence",
    "/api/admin/nirf/years",
]


class TestAdminGate:
    @pytest.mark.parametrize("endpoint", ADMIN_ENDPOINTS)
    def test_admin_without_token_is_401(self, session, endpoint):
        r = session.get(f"{BASE_URL}{endpoint}", timeout=30)
        assert r.status_code == 401, f"{endpoint} returned {r.status_code}"

    @pytest.mark.parametrize("endpoint", ADMIN_ENDPOINTS)
    def test_admin_with_token_is_200(self, session, admin_token, endpoint):
        r = session.get(f"{BASE_URL}{endpoint}", headers={"Authorization": f"Bearer {admin_token}"}, timeout=60)
        assert r.status_code == 200, f"{endpoint} returned {r.status_code} {r.text[:200]}"

    def test_admin_with_garbage_token_is_401(self, session):
        r = session.get(f"{BASE_URL}/api/admin/nirf/overview",
                        headers={"Authorization": "Bearer garbage.token.here"}, timeout=30)
        assert r.status_code == 401


# ---------------- Public endpoints (no auth) ----------------
class TestPublicEndpoints:
    def test_root_public(self, session):
        r = session.get(f"{BASE_URL}/api/", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data.get("product") == "Filed"

    def test_insights_public(self, session):
        # POST /api/insights should not require auth (it may take time due to LLM)
        r = session.post(
            f"{BASE_URL}/api/insights",
            json={"college_name": "IIT Bombay", "facts": {"nirf_rank": 3}},
            timeout=60,
        )
        # Insights endpoint must NOT be 401 (not gated). Accept 200/422 etc but never 401.
        assert r.status_code != 401, f"Public /api/insights returned 401 (should be public): {r.text[:200]}"
