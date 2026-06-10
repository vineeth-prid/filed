"""Regression tests for the College Data Normalization Service."""
from nirf_normalizer import compute_derived_metrics, metric_catalog


def _f(value, page=1, conf=0.9):
    return {"value": value, "source_page": page, "confidence": conf, "method": "pdfplumber"}


def base_fields():
    return {
        "total_students": _f(6578, 1, 0.87),
        "faculty_count": _f(468, 3, 0.97),
        "ug_graduated": _f(1114, 1, 0.88),
        "ug_placed": _f(831, 1, 0.88),
        "ug_higher_studies": _f(83, 1, 0.88),
        "pg_graduated": _f(120, 2, 0.88),
        "pg_placed": _f(91, 2, 0.88),
        "pg_higher_studies": _f(0, 2, 0.88),
        "research_funding": _f(99797117, 3, 0.9),
    }


def test_catalog_has_all_metrics():
    cat = metric_catalog()
    keys = {m["key"] for m in cat}
    expected = {
        "placement_rate_ug", "placement_rate_pg", "placement_rate_overall",
        "higher_studies_rate_ug", "higher_studies_rate_pg", "higher_studies_rate_overall",
        "outcome_rate_ug", "outcome_rate_pg", "outcome_rate_overall",
        "faculty_ratio", "research_per_faculty",
    }
    assert expected.issubset(keys)


def test_placement_rate():
    m = compute_derived_metrics(base_fields())
    assert m["placement_rate_ug"]["value"] == round(831 / 1114, 4)
    assert m["placement_rate_pg"]["value"] == round(91 / 120, 4)
    assert m["placement_rate_overall"]["value"] == round((831 + 91) / (1114 + 120), 4)


def test_outcome_and_higher_studies():
    m = compute_derived_metrics(base_fields())
    assert m["higher_studies_rate_ug"]["value"] == round(83 / 1114, 4)
    assert m["outcome_rate_ug"]["value"] == round((831 + 83) / 1114, 4)
    assert m["outcome_rate_overall"]["value"] == round((831 + 91 + 83 + 0) / (1114 + 120), 4)


def test_faculty_and_research():
    m = compute_derived_metrics(base_fields())
    assert m["faculty_ratio"]["value"] == round(6578 / 468, 4)
    assert m["research_per_faculty"]["value"] == round(99797117 / 468, 4)


def test_traceability_inputs_carry_source_page():
    m = compute_derived_metrics(base_fields())
    fr = m["faculty_ratio"]
    fields_used = {i["field"]: i for i in fr["inputs"]}
    assert fields_used["total_students"]["source_page"] == 1
    assert fields_used["faculty_count"]["source_page"] == 3
    assert "Total Students / Faculty" in fr["formula"]


def test_division_by_zero_and_missing():
    fields = base_fields()
    fields["faculty_count"] = _f(0)
    m = compute_derived_metrics(fields)
    assert m["faculty_ratio"]["status"] == "division_by_zero"
    assert m["faculty_ratio"]["value"] is None

    fields2 = base_fields()
    fields2["pg_graduated"] = _f(None)
    m2 = compute_derived_metrics(fields2)
    assert m2["placement_rate_pg"]["status"] == "insufficient_data"


def test_confidence_is_min_of_inputs():
    m = compute_derived_metrics(base_fields())
    # faculty_ratio inputs conf 0.87 (students) and 0.97 (faculty) -> min 0.87
    assert m["faculty_ratio"]["confidence"] == 0.87
