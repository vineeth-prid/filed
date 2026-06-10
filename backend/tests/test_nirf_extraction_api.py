"""End-to-end API tests for the NIRF PDF Extraction Engine."""
import os
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend env file
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except FileNotFoundError:
        pass

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- Schema ---------------------------------------------------------
def test_schema(session):
    r = session.get(f"{API}/admin/nirf/extract/schema", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "fields" in data and "groups" in data
    assert len(data["fields"]) == 20
    assert len(data["groups"]) == 6


# --- Extraction job lifecycle --------------------------------------
@pytest.fixture(scope="module")
def completed_job(session):
    r = session.post(f"{API}/admin/nirf/extract",
                     json={"year": 2024, "category": "Engineering"}, timeout=30)
    assert r.status_code == 200, r.text
    job_id = r.json()["job_id"]
    assert job_id

    # Poll until completed (cap ~5 minutes)
    deadline = time.time() + 360
    last = None
    while time.time() < deadline:
        jr = session.get(f"{API}/admin/nirf/extract/jobs/{job_id}", timeout=20)
        assert jr.status_code == 200, jr.text
        last = jr.json()
        if last["status"] in ("Completed", "Failed"):
            break
        time.sleep(3)
    assert last and last["status"] == "Completed", f"job did not complete: {last}"
    return last


def test_job_completes_all_pdfs(completed_job):
    stats = completed_job.get("stats", {})
    assert stats.get("total", 0) >= 15
    assert stats.get("extracted") == stats.get("total"), f"stats: {stats}"


# --- List + summary -------------------------------------------------
@pytest.fixture(scope="module")
def extractions(session, completed_job):
    r = session.get(f"{API}/admin/nirf/extractions",
                    params={"year": 2024, "category": "Engineering"}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "extractions" in data and "summary" in data
    assert len(data["extractions"]) >= 15
    return data


def test_summary_keys(extractions):
    s = extractions["summary"]
    for k in ("total", "High", "Medium", "Low", "Reviewed"):
        assert k in s
    assert s["total"] == len(extractions["extractions"])


def test_each_record_shape(extractions):
    for rec in extractions["extractions"]:
        for k in ("overall_confidence", "coverage", "confidence_band", "fields"):
            assert k in rec, f"missing {k} in {rec.get('institute_id')}"
        assert rec["confidence_band"] in ("High", "Medium", "Low")
        assert len(rec["fields"]) == 20
        for fkey, f in rec["fields"].items():
            assert set(("value", "source_page", "confidence", "method")).issubset(f.keys())


# --- Detail get ------------------------------------------------------
def test_get_by_id_and_document_id(session, extractions):
    rec = extractions["extractions"][0]
    r1 = session.get(f"{API}/admin/nirf/extractions/{rec['id']}", timeout=20)
    assert r1.status_code == 200
    assert r1.json()["id"] == rec["id"]

    # Also works when passed a document_id
    r2 = session.get(f"{API}/admin/nirf/extractions/{rec['document_id']}", timeout=20)
    assert r2.status_code == 200
    assert r2.json()["id"] == rec["id"]


def test_get_unknown_404(session):
    r = session.get(f"{API}/admin/nirf/extractions/does-not-exist", timeout=20)
    assert r.status_code == 404


# --- Single re-extract ----------------------------------------------
def test_single_reextract(session, extractions):
    rec = extractions["extractions"][0]
    r = session.post(f"{API}/admin/nirf/documents/{rec['document_id']}/extract", timeout=120)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "Extracted"
    assert body["document_id"] == rec["document_id"]


# --- Manual correction ----------------------------------------------
def test_manual_correction_and_preservation(session, extractions):
    rec = extractions["extractions"][0]
    before_conf = rec["overall_confidence"]
    before_cov = rec["coverage"]

    # Apply correction to patents_filed (expected null pre-correction)
    r = session.patch(f"{API}/admin/nirf/extractions/{rec['id']}/field",
                      json={"field": "patents_filed", "value": 42}, timeout=20)
    assert r.status_code == 200, r.text
    updated = r.json()

    f = updated["fields"]["patents_filed"]
    assert f["value"] == 42
    assert f["confidence"] == 1.0
    assert f["method"] == "manual"
    assert f["corrected"] is True
    assert updated["status"] == "Reviewed"
    assert updated["overall_confidence"] >= before_conf
    assert updated["coverage"] >= before_cov

    # Re-extract and ensure correction preserved
    r2 = session.post(f"{API}/admin/nirf/documents/{rec['document_id']}/extract", timeout=120)
    assert r2.status_code == 200
    f2 = r2.json()["fields"]["patents_filed"]
    assert f2["value"] == 42
    assert f2["corrected"] is True
    assert f2["method"] == "manual"


def test_correction_unknown_field(session, extractions):
    rec = extractions["extractions"][0]
    r = session.patch(f"{API}/admin/nirf/extractions/{rec['id']}/field",
                      json={"field": "bogus_field", "value": 1}, timeout=20)
    assert r.status_code == 400
