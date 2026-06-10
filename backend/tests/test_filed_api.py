"""
Backend regression tests for the Filed Education Due Diligence API.

Covers:
- GET /api/  (root branding)
- POST /api/insights  (Claude Sonnet 4.5 via emergentintegrations)
  * Happy path with 2 colleges
  * Happy path with 3 colleges
  * Empty payload validation
  * Neutral-analyst tone: forbidden words must not appear
"""

import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dossier-check-1.preview.emergentagent.com").rstrip("/")

# Forbidden accusatory terms (case-insensitive whole-word match)
FORBIDDEN_TERMS = ["fake", "misleading", "scam", "inflated"]


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _sample_college(short, name, outcome, roi, sal, plc, hs, tr, cost, fr, ctype):
    return {
        "short": short,
        "name": name,
        "outcomeScore": outcome,
        "roiRating": roi,
        "medianSalary": sal,
        "placementRate": plc,
        "higherStudies": hs,
        "transparency": tr,
        "cost": cost,
        "facultyRatio": fr,
        "type": ctype,
    }


SAMPLE_TWO = [
    _sample_college("IITB", "IIT Bombay", 92, "AAA", 2100000, 92, 18, "HIGH", 900000, "1:9", "Public"),
    _sample_college("VIT", "VIT Vellore", 78, "A", 850000, 85, 22, "MEDIUM", 1600000, "1:15", "Private"),
]

SAMPLE_THREE = SAMPLE_TWO + [
    _sample_college("BITS", "BITS Pilani", 86, "AA", 1500000, 90, 20, "HIGH", 1700000, "1:12", "Private"),
]


# ---------- Root ----------
class TestRoot:
    def test_root_returns_product_branding(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        data = r.json()
        assert data.get("product") == "Filed"
        assert "tagline" in data and isinstance(data["tagline"], str)


# ---------- Insights ----------
class TestInsights:
    def test_insights_two_colleges_happy_path(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/insights", json={"colleges": SAMPLE_TWO}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "insights" in data
        assert isinstance(data["insights"], list)
        assert 1 <= len(data["insights"]) <= 5
        for s in data["insights"]:
            assert isinstance(s, str)
            assert len(s.strip()) > 0

    def test_insights_three_colleges_happy_path(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/insights", json={"colleges": SAMPLE_THREE}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert 1 <= len(data["insights"]) <= 5

    def test_insights_empty_colleges_returns_400(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/insights", json={"colleges": []}, timeout=30)
        assert r.status_code == 400

    def test_insights_tone_no_forbidden_words(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/insights", json={"colleges": SAMPLE_THREE}, timeout=60)
        assert r.status_code == 200
        joined = " ".join(r.json()["insights"]).lower()
        for word in FORBIDDEN_TERMS:
            # word boundary match to avoid substring false positives (e.g. inflated inside "deflated")
            assert not re.search(rf"\b{word}\b", joined), f"Forbidden term '{word}' found in insights: {joined}"

    def test_insights_missing_field_returns_422(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/insights", json={}, timeout=15)
        assert r.status_code == 422
