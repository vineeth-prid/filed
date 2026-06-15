"""
Live API regression tests for the College Data Normalization Service.

Covers:
  - Metric catalog (11 metrics, structure)
  - Batch normalize job lifecycle
  - Derived metrics list + detail + traceability (inputs[].field/value/source_page)
  - Math correctness (placement_rate_overall, faculty_ratio, research_per_faculty)
  - IMMUTABILITY: re-normalize with no change -> no new version
  - IMMUTABILITY: after a manual correction, a NEW version is created while
                  the OLD version's value is preserved.
  - Single-doc normalize endpoint
  - Division-by-zero / missing-input handling
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://data-intake-hub-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

YEAR = 2024
CATEGORY = "Engineering"

EXPECTED_KEYS = {
    "placement_rate_ug", "placement_rate_pg", "placement_rate_overall",
    "higher_studies_rate_ug", "higher_studies_rate_pg", "higher_studies_rate_overall",
    "outcome_rate_ug", "outcome_rate_pg", "outcome_rate_overall",
    "faculty_ratio", "research_per_faculty",
}


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _wait_job(client, job_id, timeout=120):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        r = client.get(f"{API}/admin/nirf/normalize/jobs/{job_id}", timeout=30)
        assert r.status_code == 200
        last = r.json()
        if last.get("status") in {"Completed", "Failed"}:
            return last
        time.sleep(1.2)
    pytest.fail(f"Normalize job {job_id} timed out. Last status={last}")


# ---------------- Catalog ----------------
def test_catalog_returns_11_metrics(client):
    r = client.get(f"{API}/admin/nirf/metrics/catalog", timeout=30)
    assert r.status_code == 200
    body = r.json()
    metrics = body.get("metrics") or body  # accept either shape
    if isinstance(metrics, dict) and "metrics" in metrics:
        metrics = metrics["metrics"]
    # Accept list directly OR under 'metrics'
    if isinstance(body, list):
        metrics = body
    assert isinstance(metrics, list), f"Catalog not list: {body!r}"
    assert len(metrics) == 11
    keys = {m["key"] for m in metrics}
    assert keys == EXPECTED_KEYS
    for m in metrics:
        assert {"key", "label", "group", "formula", "kind"}.issubset(m.keys())


# ---------------- Batch normalize ----------------
@pytest.fixture(scope="module")
def normalized(client):
    r = client.post(f"{API}/admin/nirf/normalize", json={"year": YEAR, "category": CATEGORY}, timeout=30)
    assert r.status_code in (200, 201)
    job_id = r.json().get("job_id")
    assert job_id
    job = _wait_job(client, job_id)
    assert job["status"] == "Completed", job
    stats = job.get("stats") or {}
    assert stats.get("total", 0) >= 1
    assert stats.get("normalized") == stats.get("total")
    return job


def test_batch_normalize_completed(normalized):
    assert normalized["status"] == "Completed"


# ---------------- Derived metrics list ----------------
def test_derived_metrics_list_shape_and_traceability(client, normalized):
    r = client.get(f"{API}/admin/nirf/derived-metrics", params={"year": YEAR, "category": CATEGORY}, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert "derived_metrics" in body and "count" in body
    rows = body["derived_metrics"]
    assert body["count"] == len(rows)
    assert len(rows) >= 1
    rec = rows[0]
    assert set(rec["metrics"].keys()) == EXPECTED_KEYS
    sample = rec["metrics"]["faculty_ratio"]
    for f in ("value", "status", "confidence", "formula", "kind", "inputs"):
        assert f in sample, f"missing field {f} in metric"
    for inp in sample["inputs"]:
        assert "field" in inp and "value" in inp and "source_page" in inp


# ---------------- Derived metrics detail ----------------
def test_derived_metrics_detail(client, normalized):
    rows = client.get(f"{API}/admin/nirf/derived-metrics",
                      params={"year": YEAR, "category": CATEGORY}, timeout=30).json()["derived_metrics"]
    doc_id = rows[0]["document_id"]
    r = client.get(f"{API}/admin/nirf/derived-metrics/{doc_id}", timeout=30)
    assert r.status_code == 200
    rec = r.json()
    assert rec["document_id"] == doc_id
    assert "raw_data_id" in rec and "raw_data_version" in rec
    assert isinstance(rec["raw_data_version"], int)


# ---------------- Math correctness ----------------
def test_math_correctness(client, normalized):
    rows = client.get(f"{API}/admin/nirf/derived-metrics",
                      params={"year": YEAR, "category": CATEGORY}, timeout=30).json()["derived_metrics"]
    # Find a record where all required inputs are present
    for rec in rows:
        m = rec["metrics"]
        pr = m["placement_rate_overall"]
        fr = m["faculty_ratio"]
        rpf = m["research_per_faculty"]
        if pr["status"] != "ok" or fr["status"] != "ok" or rpf["status"] != "ok":
            continue

        def find(metric, field):
            for i in metric["inputs"]:
                if i["field"] == field:
                    return float(i["value"])
            return None

        ug_p = find(pr, "ug_placed")
        pg_p = find(pr, "pg_placed")
        ug_g = find(pr, "ug_graduated")
        pg_g = find(pr, "pg_graduated")
        ts = find(fr, "total_students")
        fc = find(fr, "faculty_count")
        rf = find(rpf, "research_funding")
        assert pr["value"] == round((ug_p + pg_p) / (ug_g + pg_g), 4)
        assert fr["value"] == round(ts / fc, 4)
        assert rpf["value"] == round(rf / fc, 4)
        return
    pytest.skip("No fully-ok record to validate math")


# ---------------- Single-doc normalize ----------------
def test_single_doc_normalize_returns_raw_and_derived(client, normalized):
    rows = client.get(f"{API}/admin/nirf/derived-metrics",
                      params={"year": YEAR, "category": CATEGORY}, timeout=30).json()["derived_metrics"]
    doc_id = rows[0]["document_id"]
    r = client.post(f"{API}/admin/nirf/documents/{doc_id}/normalize", timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert "raw_data" in body and "derived" in body
    assert body["raw_data"]["document_id"] == doc_id
    assert set(body["derived"]["metrics"].keys()) == EXPECTED_KEYS


# ---------------- Raw data versioning ----------------
def test_raw_data_versions_endpoint(client, normalized):
    rows = client.get(f"{API}/admin/nirf/derived-metrics",
                      params={"year": YEAR, "category": CATEGORY}, timeout=30).json()["derived_metrics"]
    doc_id = rows[0]["document_id"]
    r = client.get(f"{API}/admin/nirf/raw-data/{doc_id}", timeout=30)
    assert r.status_code == 200
    body = r.json()
    # Accept either {versions:[...]} or list
    versions = body.get("versions") if isinstance(body, dict) else body
    if versions is None and isinstance(body, dict):
        versions = body.get("raw_data") or body.get("snapshots") or []
    assert isinstance(versions, list) and len(versions) >= 1
    for v in versions:
        assert "version" in v and "fields" in v


# ---------------- IMMUTABILITY: no change -> no new version ----------------
def test_immutability_no_change_no_new_version(client, normalized):
    rows = client.get(f"{API}/admin/nirf/derived-metrics",
                      params={"year": YEAR, "category": CATEGORY}, timeout=30).json()["derived_metrics"]
    doc_id = rows[0]["document_id"]

    def version_count():
        body = client.get(f"{API}/admin/nirf/raw-data/{doc_id}", timeout=30).json()
        versions = body.get("versions") if isinstance(body, dict) else body
        if versions is None and isinstance(body, dict):
            versions = body.get("raw_data") or body.get("snapshots") or []
        return len(versions), versions

    before, _ = version_count()
    r = client.post(f"{API}/admin/nirf/documents/{doc_id}/normalize", timeout=30)
    assert r.status_code == 200
    after, _ = version_count()
    assert after == before, f"version_count changed without any field change: {before} -> {after}"


# ---------------- IMMUTABILITY: correction creates a NEW version; old preserved ----------------
def test_immutability_correction_creates_new_version_old_preserved(client, normalized):
    # Pick a record where faculty_count is present
    rows = client.get(f"{API}/admin/nirf/derived-metrics",
                      params={"year": YEAR, "category": CATEGORY}, timeout=30).json()["derived_metrics"]
    target = None
    for rec in rows:
        fc_inputs = [i for i in rec["metrics"]["faculty_ratio"]["inputs"] if i["field"] == "faculty_count"]
        if fc_inputs and fc_inputs[0]["value"] is not None:
            target = rec
            break
    assert target, "No record with faculty_count to test correction"
    doc_id = target["document_id"]

    # Get extraction_id
    ext_r = client.get(f"{API}/admin/nirf/extractions/{doc_id}", timeout=30)
    assert ext_r.status_code == 200
    extraction = ext_r.json()
    extraction_id = extraction["id"]
    original_fc = extraction["fields"]["faculty_count"]["value"]

    # Snapshot versions before
    def get_versions():
        body = client.get(f"{API}/admin/nirf/raw-data/{doc_id}", timeout=30).json()
        versions = body.get("versions") if isinstance(body, dict) else body
        if versions is None and isinstance(body, dict):
            versions = body.get("raw_data") or body.get("snapshots") or []
        return sorted(versions, key=lambda v: v["version"])

    before = get_versions()
    before_count = len(before)
    new_val = (float(original_fc) if original_fc else 100) + 7  # ensure different

    # Apply a manual correction
    patch = client.patch(
        f"{API}/admin/nirf/extractions/{extraction_id}/field",
        json={"field": "faculty_count", "value": new_val},
        timeout=30,
    )
    assert patch.status_code == 200, patch.text

    # Re-normalize the doc
    r = client.post(f"{API}/admin/nirf/documents/{doc_id}/normalize", timeout=30)
    assert r.status_code == 200

    after = get_versions()
    assert len(after) == before_count + 1, f"expected new version after correction; got {len(after)} (was {before_count})"

    # IMMUTABILITY: the latest pre-correction version (which was the source of
    # `original_fc`) must STILL hold `original_fc` after re-normalize. Older
    # historical versions may legitimately hold different values (they were
    # snapshotted at earlier points in time — that's the whole point of
    # versioning) and are NOT asserted here.
    last_before = before[-1]
    preserved_fc = (last_before.get("fields") or {}).get("faculty_count", {}).get("value")
    assert preserved_fc == original_fc, (
        f"PRE-correction latest version v{last_before['version']} faculty_count "
        f"was overwritten: expected {original_fc!r}, found {preserved_fc!r}"
    )
    # Sanity: the new latest version is strictly greater than the previous latest.
    assert after[-1]["version"] > last_before["version"]
    # And every pre-existing version row (by id/version) is still present unchanged
    before_by_v = {v["version"]: (v.get("fields") or {}).get("faculty_count", {}).get("value") for v in before}
    for v in after[:-1]:  # all but the newly created one
        assert (v.get("fields") or {}).get("faculty_count", {}).get("value") == before_by_v.get(v["version"]), (
            f"Existing version v{v['version']} was mutated during re-normalize"
        )

    # And latest version has the new value
    latest_fc = after[-1]["fields"]["faculty_count"]["value"]
    assert float(latest_fc) == float(new_val)

    # Cleanup: restore original value so next iterations stay clean
    if original_fc is not None:
        client.patch(
            f"{API}/admin/nirf/extractions/{extraction_id}/field",
            json={"field": "faculty_count", "value": original_fc},
            timeout=30,
        )
        client.post(f"{API}/admin/nirf/documents/{doc_id}/normalize", timeout=30)


# ---------------- Division-by-zero / missing data handling ----------------
def test_missing_or_zero_handled_without_crash(client, normalized):
    # We won't force a divide-by-zero on real data; just confirm every record
    # responds successfully and any non-ok metric has value None.
    rows = client.get(f"{API}/admin/nirf/derived-metrics",
                      params={"year": YEAR, "category": CATEGORY}, timeout=30).json()["derived_metrics"]
    for rec in rows:
        for key, m in rec["metrics"].items():
            if m["status"] != "ok":
                assert m["value"] is None, f"{rec['document_id']}.{key} status={m['status']} but value={m['value']}"
                assert m["status"] in {"insufficient_data", "division_by_zero"}
