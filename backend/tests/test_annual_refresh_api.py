"""Live API tests for the Annual NIRF Refresh workflow.

Covers:
- POST /api/admin/nirf/refresh  (job creation)
- GET  /api/admin/nirf/refresh/jobs/{job_id}  (polling -> Completed, 7 stages done)
- GET  /api/admin/nirf/years   (historical preservation: 2024 & 2026)
- GET  /api/admin/nirf/derived-metrics?year=2024  (2024 untouched)
- GET  /api/admin/nirf/raw-data/{doc_id} (prior versions unchanged)
- GET  /api/admin/nirf/changes (15 rows + summary + per-metric delta/direction)
- GET  /api/admin/nirf/trends?metric={median_salary,placement_rate,faculty_count}
- GET  /api/admin/nirf/trends invalid metric -> 400
- Re-run idempotency (no duplicate change rows)
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"

CATEGORY = "Engineering"
YEAR = 2026
PREV = 2024


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _poll_job(api, job_id, timeout=60):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        r = api.get(f"{BASE_URL}/api/admin/nirf/refresh/jobs/{job_id}", timeout=15)
        assert r.status_code == 200, r.text
        last = r.json()
        if last.get("status") in ("Completed", "Failed", "Error"):
            return last
        time.sleep(2)
    raise AssertionError(f"job {job_id} did not finish in {timeout}s; last={last}")


# ---------- Stage 1: refresh job kicks off + finishes ----------
def test_refresh_completes_with_7_stages(api):
    payload = {"year": YEAR, "category": CATEGORY, "limit": 25, "simulate": True}
    r = api.post(f"{BASE_URL}/api/admin/nirf/refresh", json=payload, timeout=30)
    assert r.status_code in (200, 201, 202), r.text
    body = r.json()
    assert "job_id" in body and isinstance(body["job_id"], str)
    job = _poll_job(api, body["job_id"], timeout=90)
    assert job["status"] == "Completed", job
    stages = job.get("stages") or []
    assert len(stages) == 7, f"expected 7 stages, got {len(stages)}"
    for s in stages:
        assert s.get("status") == "done", f"stage not done: {s}"
    assert "data_origin" in job
    stats = job.get("stats") or {}
    assert "institutions" in stats
    assert "downloaded" in stats
    assert stats.get("previous_year") == PREV
    assert "changes_tracked" in stats


# ---------- Historical preservation ----------
def test_years_contains_both_years(api):
    r = api.get(f"{BASE_URL}/api/admin/nirf/years", params={"category": CATEGORY}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    years = body.get("years") if isinstance(body, dict) else body
    assert isinstance(years, list)
    assert PREV in years and YEAR in years, f"years={years}"


def test_2024_derived_metrics_untouched(api):
    r = api.get(
        f"{BASE_URL}/api/admin/nirf/derived-metrics",
        params={"year": PREV, "category": CATEGORY},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    rows = body.get("derived_metrics") or body.get("records") or body
    assert isinstance(rows, list)
    assert len(rows) == 15, f"expected 15 2024 derived rows, got {len(rows)}"


def _rows(j):
    return j.get("derived_metrics") or j.get("records") or j


def test_2026_creates_new_documents(api):
    r1 = api.get(
        f"{BASE_URL}/api/admin/nirf/derived-metrics",
        params={"year": PREV, "category": CATEGORY}, timeout=20,
    )
    r2 = api.get(
        f"{BASE_URL}/api/admin/nirf/derived-metrics",
        params={"year": YEAR, "category": CATEGORY}, timeout=20,
    )
    assert r1.status_code == 200 and r2.status_code == 200
    rows1 = _rows(r1.json())
    rows2 = _rows(r2.json())
    ids1 = {x.get("document_id") for x in rows1 if x.get("document_id")}
    ids2 = {x.get("document_id") for x in rows2 if x.get("document_id")}
    assert ids2, "no document_id in 2026 derived records"
    # 2026 documents must not reuse 2024 document_ids
    assert ids1.isdisjoint(ids2), f"2026 overlaps 2024 docs: {ids1 & ids2}"


def test_raw_data_prior_versions_preserved(api):
    r = api.get(
        f"{BASE_URL}/api/admin/nirf/derived-metrics",
        params={"year": PREV, "category": CATEGORY}, timeout=20,
    )
    rows = _rows(r.json())
    doc_id = next((x["document_id"] for x in rows if x.get("document_id")), None)
    if not doc_id:
        pytest.skip("No 2024 document_id available")
    rr = api.get(f"{BASE_URL}/api/admin/nirf/raw-data/{doc_id}", timeout=20)
    assert rr.status_code == 200, rr.text
    body = rr.json()
    # Validate the doc actually corresponds to 2024
    yr = body.get("year") or body.get("nirf_year") or (body.get("record", {}) if isinstance(body, dict) else {}).get("year")
    if yr is not None:
        assert int(yr) == PREV


# ---------- Changes endpoint ----------
def test_changes_endpoint_shape(api):
    r = api.get(
        f"{BASE_URL}/api/admin/nirf/changes",
        params={"year": YEAR, "category": CATEGORY}, timeout=20,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "changes" in body and "summary" in body
    assert isinstance(body["changes"], list)
    assert len(body["changes"]) == 15, f"expected 15 change rows, got {len(body['changes'])}"
    s = body["summary"]
    assert s.get("previous_year") == PREV
    for k in ("institutions", "avg_salary_pct", "avg_placement_delta_pp", "avg_faculty_pct", "data_origin"):
        assert k in s, f"missing summary key {k}"
    # per-row shape
    row = body["changes"][0]
    ch = row.get("changes") or {}
    for metric in ("median_salary", "placement_rate", "faculty_count"):
        m = ch.get(metric)
        assert m is not None, f"missing metric {metric}"
        for f in ("current", "previous", "delta", "pct_change", "direction"):
            assert f in m, f"{metric} missing {f}"
        assert m["direction"] in ("up", "down", "flat", "na")


# ---------- Trends endpoint ----------
@pytest.mark.parametrize("metric", ["median_salary", "placement_rate", "faculty_count"])
def test_trends_per_metric(api, metric):
    r = api.get(
        f"{BASE_URL}/api/admin/nirf/trends",
        params={"category": CATEGORY, "metric": metric}, timeout=20,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "years" in body and "average" in body and "series" in body
    assert PREV in body["years"] and YEAR in body["years"]
    assert isinstance(body["average"], list) and len(body["average"]) >= 2
    avg_point = body["average"][0]
    assert "year" in avg_point and "value" in avg_point
    assert isinstance(body["series"], list) and len(body["series"]) >= 1
    s = body["series"][0]
    assert "institute_id" in s and "college_name" in s and "points" in s
    assert isinstance(s["points"], list) and len(s["points"]) >= 1
    pt = s["points"][0]
    assert "year" in pt and "value" in pt


def test_trends_invalid_metric(api):
    r = api.get(
        f"{BASE_URL}/api/admin/nirf/trends",
        params={"category": CATEGORY, "metric": "bogus_metric"}, timeout=15,
    )
    assert r.status_code == 400, f"expected 400 for invalid metric, got {r.status_code}: {r.text}"


# ---------- Idempotency: re-run refresh keeps changes count == 15 ----------
def test_rerun_refresh_is_idempotent(api):
    payload = {"year": YEAR, "category": CATEGORY, "limit": 25, "simulate": True}
    r = api.post(f"{BASE_URL}/api/admin/nirf/refresh", json=payload, timeout=30)
    assert r.status_code in (200, 201, 202)
    job = _poll_job(api, r.json()["job_id"], timeout=90)
    assert job["status"] == "Completed"
    r2 = api.get(
        f"{BASE_URL}/api/admin/nirf/changes",
        params={"year": YEAR, "category": CATEGORY}, timeout=20,
    )
    assert r2.status_code == 200
    assert len(r2.json()["changes"]) == 15
