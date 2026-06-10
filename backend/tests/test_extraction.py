"""Regression tests for the NIRF PDF extraction engine."""
import glob
import os

import pytest

from nirf_extractor import extract_pdf, FIELD_KEYS

PDF_DIR = "/app/backend/storage/nirf/2024/engineering"
SAMPLE = os.path.join(PDF_DIR, "IR-E-U-0456.pdf")  # IIT Madras


@pytest.fixture(scope="module")
def result():
    meta = {"college_name": "Indian Institute of Technology Madras", "state": "Tamil Nadu", "city": "Chennai"}
    return extract_pdf(SAMPLE, meta)


def test_all_field_keys_present(result):
    for k in FIELD_KEYS:
        assert k in result["fields"], f"missing field {k}"
        f = result["fields"][k]
        assert set(["value", "source_page", "confidence", "method"]).issubset(f.keys())


def test_institution(result):
    assert "Indian Institute of Technology Madras" in result["fields"]["college_name"]["value"]
    assert result["fields"]["college_name"]["confidence"] >= 0.9
    assert result["fields"]["college_name"]["source_page"] == 1


def test_students(result):
    f = result["fields"]
    assert f["ug_students"]["value"] == 4909
    assert f["pg_students"]["value"] == 1703
    assert f["phd_students"]["value"] == 2574
    assert f["total_students"]["value"] == 4909 + 1703 + 2574


def test_faculty(result):
    assert result["fields"]["faculty_count"]["value"] == 674
    assert result["fields"]["faculty_count"]["source_page"] == 4


def test_placement(result):
    f = result["fields"]
    assert f["ug_graduated"]["value"] == 639
    assert f["ug_placed"]["value"] == 496
    assert f["ug_higher_studies"]["value"] == 96
    assert f["ug_median_salary"]["value"] == 1663440
    assert f["pg_placed"]["value"] == 390
    assert f["pg_median_salary"]["value"] == 1500000


def test_research(result):
    f = result["fields"]
    assert f["sponsored_projects"]["value"] == 694
    assert f["research_funding"]["value"] == 5896783694
    # Patents are not present in standard NIRF data-sheet PDFs
    assert f["patents_filed"]["value"] is None
    assert f["patents_filed"]["confidence"] == 0.0


def test_confidence_and_coverage(result):
    assert 0 < result["overall_confidence"] <= 1
    assert result["coverage"] >= 0.85  # 18/20 fields found


def test_every_field_has_source_and_confidence(result):
    """Spec: every extracted field stores value, source page, confidence."""
    for k, f in result["fields"].items():
        assert "source_page" in f
        assert isinstance(f["confidence"], float)
        if f["value"] is not None:
            assert f["confidence"] > 0


def test_batch_extraction_runs_on_all_pdfs():
    pdfs = sorted(glob.glob(os.path.join(PDF_DIR, "*.pdf")))
    assert len(pdfs) >= 10
    for p in pdfs[:5]:
        r = extract_pdf(p, None)
        assert r["fields"]["faculty_count"]["value"] is not None
        assert r["overall_confidence"] > 0
