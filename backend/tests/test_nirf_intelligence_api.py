"""Live API regression tests for the College Intelligence Engine."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://data-intake-hub-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

YEAR = 2024
CATEGORY = "Engineering"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# -------- Catalog --------
def test_catalog_returns_four_scores(session):
    r = session.get(f"{API}/admin/nirf/intelligence/catalog", timeout=30)
    assert r.status_code == 200
    body = r.json()
    # may be list or {scores:[...]}
    items = body if isinstance(body, list) else body.get("scores") or body.get("catalog") or body.get("items")
    assert items is not None and len(items) == 4
    keys = {s.get("key") for s in items}
    assert keys == {"career_success", "value_for_money", "academic_strength", "transparency"}
    for s in items:
        assert s.get("label")
        assert "inputs" in s or "components" in s
        assert "method" in s


# -------- Batch compute job --------
def _ensure_intelligence_data(session):
    """Trigger a compute job and wait for completion. Returns final job dict."""
    r = session.post(f"{API}/admin/nirf/intelligence", json={"year": YEAR, "category": CATEGORY}, timeout=30)
    assert r.status_code == 200, r.text
    job_id = r.json().get("job_id") or r.json().get("id")
    assert job_id
    final = None
    for _ in range(60):
        jr = session.get(f"{API}/admin/nirf/intelligence/jobs/{job_id}", timeout=15)
        assert jr.status_code == 200
        final = jr.json()
        if final.get("status") in ("Completed", "Failed", "completed", "failed"):
            break
        time.sleep(1.5)
    assert final is not None
    assert final.get("status", "").lower() == "completed", f"job did not complete: {final}"
    return final


def test_batch_compute_intelligence_completes(session):
    final = _ensure_intelligence_data(session)
    stats = final.get("stats", {})
    assert stats.get("scored") == stats.get("total")
    assert stats.get("total") == 15


# -------- List endpoint --------
def test_list_intelligence_returns_records_with_full_structure(session):
    _ensure_intelligence_data(session)
    r = session.get(f"{API}/admin/nirf/intelligence", params={"year": YEAR, "category": CATEGORY}, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 15
    rows = body["intelligence"]
    assert len(rows) == 15
    rec = rows[0]
    for k in ("scores", "overall_index", "overall_grade", "fees", "fees_source", "cohort_size"):
        assert k in rec, f"missing top-level key {k}"
    for sk in ("career_success", "value_for_money", "academic_strength", "transparency"):
        assert sk in rec["scores"], f"missing score {sk}"
        s = rec["scores"][sk]
        for sf in ("value", "grade", "confidence", "weight_basis", "method", "components"):
            assert sf in s, f"score {sk} missing field {sf}"
        if s["value"] is not None:
            assert 0 <= s["value"] <= 100
        assert len(s["components"]) >= 1
        for c in s["components"]:
            assert {"label", "raw_value", "normalized_score", "weight", "contribution", "source", "direction"} <= set(c.keys())


# -------- Detail endpoint --------
def test_detail_endpoint_full_breakdown(session):
    _ensure_intelligence_data(session)
    rows = session.get(f"{API}/admin/nirf/intelligence", params={"year": YEAR, "category": CATEGORY}, timeout=30).json()["intelligence"]
    doc_id = rows[0]["document_id"]
    r = session.get(f"{API}/admin/nirf/intelligence/{doc_id}", timeout=30)
    assert r.status_code == 200
    rec = r.json()
    assert rec["document_id"] == doc_id
    for sk in ("career_success", "value_for_money", "academic_strength", "transparency"):
        assert sk in rec["scores"]
        assert len(rec["scores"][sk]["components"]) >= 1


# -------- Patents exclusion + transparency --------
def test_academic_strength_patents_excluded_and_weight_renormalized(session):
    _ensure_intelligence_data(session)
    rows = session.get(f"{API}/admin/nirf/intelligence", params={"year": YEAR, "category": CATEGORY}, timeout=30).json()["intelligence"]
    rec = rows[0]
    acad = rec["scores"]["academic_strength"]
    patents = next((c for c in acad["components"] if c["label"].lower().startswith("patent")), None)
    assert patents is not None
    assert patents.get("available") is False
    assert patents.get("note")
    assert abs(acad["weight_basis"] - 0.8) < 1e-6
    assert acad["value"] is None or 0 <= acad["value"] <= 100


def test_transparency_score_absolute(session):
    _ensure_intelligence_data(session)
    rows = session.get(f"{API}/admin/nirf/intelligence", params={"year": YEAR, "category": CATEGORY}, timeout=30).json()["intelligence"]
    rec = rows[0]
    trans = rec["scores"]["transparency"]
    assert trans["confidence"] == 1.0
    assert 0 <= trans["value"] <= 100


# -------- Fees update + VFM recompute --------
def test_fees_update_changes_vfm(session):
    _ensure_intelligence_data(session)
    rows = session.get(f"{API}/admin/nirf/intelligence", params={"year": YEAR, "category": CATEGORY}, timeout=30).json()["intelligence"]
    # Pick a record that's NOT IIT Kanpur (which has a leftover 100000 override).
    target = next((r for r in rows if r["document_id"] != "IR-E-I-1075"), rows[0])
    doc_id = target["document_id"]
    original_fees = target["fees"]
    original_vfm = target["scores"]["value_for_money"]["value"]

    try:
        # First set HIGH fees
        high = 500000
        r1 = session.put(f"{API}/admin/nirf/fees/{doc_id}", json={"fees": high, "source": "TEST high fee"}, timeout=30)
        assert r1.status_code == 200, r1.text
        rec_high = r1.json()
        assert rec_high["fees"] == high
        assert "TEST high fee" in rec_high["fees_source"]
        vfm_high = rec_high["scores"]["value_for_money"]["value"]

        # Then LOW fees
        low = 50000
        r2 = session.put(f"{API}/admin/nirf/fees/{doc_id}", json={"fees": low, "source": "TEST low fee"}, timeout=30)
        assert r2.status_code == 200, r2.text
        rec_low = r2.json()
        assert rec_low["fees"] == low
        vfm_low = rec_low["scores"]["value_for_money"]["value"]

        assert vfm_low > vfm_high, f"Expected lower fees to yield higher VFM: low={vfm_low} high={vfm_high}"
    finally:
        # restore
        session.put(f"{API}/admin/nirf/fees/{doc_id}", json={"fees": original_fees, "source": target.get("fees_source") or "restore"}, timeout=30)


# -------- Single-doc recompute --------
def test_single_doc_recompute(session):
    _ensure_intelligence_data(session)
    rows = session.get(f"{API}/admin/nirf/intelligence", params={"year": YEAR, "category": CATEGORY}, timeout=30).json()["intelligence"]
    doc_id = rows[0]["document_id"]
    r = session.post(f"{API}/admin/nirf/documents/{doc_id}/intelligence", timeout=30)
    assert r.status_code == 200, r.text
    rec = r.json()
    assert "scores" in rec
    for sk in ("career_success", "value_for_money", "academic_strength", "transparency"):
        assert sk in rec["scores"]
