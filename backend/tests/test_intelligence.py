"""Regression tests for the College Intelligence Engine."""
from intelligence_engine import (
    compute_scores, _build_cohort_ranges, score_catalog, indicative_fees, _grade,
)


def _f(value, page=1, conf=0.9):
    return {"value": value, "source_page": page, "confidence": conf, "method": "pdfplumber"}


def _metric(value, conf=0.88):
    return {"value": value, "confidence": conf}


def make_record(name, placement, salary, hs, fr, rpf, fees, coverage_full=True):
    fields = {
        "ug_median_salary": _f(salary, 1),
        "pg_median_salary": _f(salary - 100000, 2),
        "patents_filed": _f(None, None, 0.0),
        "patents_granted": _f(None, None, 0.0),
    }
    # pad with some populated + some unsourced fields to exercise transparency
    for k in ["college_name", "total_students", "faculty_count"]:
        fields[k] = _f(123, 1)
    fields["state"] = {"value": "TN", "source_page": None, "confidence": 0.85, "method": "ranking_metadata"}
    metrics = {
        "placement_rate_overall": _metric(placement),
        "higher_studies_rate_overall": _metric(hs),
        "faculty_ratio": _metric(fr),
        "research_per_faculty": _metric(rpf),
    }
    return {
        "document_id": name, "institute_id": name, "year": 2024, "category": "Engineering",
        "college_name": name, "fields": fields, "metrics": metrics,
        "fees": fees, "fees_source": "test",
    }


def cohort():
    return [
        make_record("A", 0.90, 2000000, 0.20, 10.0, 5000000, 200000),
        make_record("B", 0.70, 1000000, 0.10, 20.0, 1000000, 400000),
        make_record("C", 0.50, 600000, 0.05, 30.0, 200000, 100000),
    ]


def test_catalog_has_four_scores():
    cat = score_catalog()
    keys = {s["key"] for s in cat}
    assert keys == {"career_success", "value_for_money", "academic_strength", "transparency"}


def test_scores_in_range_and_graded():
    recs = cohort()
    ranges = _build_cohort_ranges(recs)
    out = compute_scores(recs[0], ranges)
    for k in ["career_success", "value_for_money", "academic_strength", "transparency"]:
        s = out["scores"][k]
        assert s["value"] is None or 0 <= s["value"] <= 100
        assert s["grade"] in {"AAA", "AA", "A", "BBB", "BB", "B", "C", "NR"}
        assert len(s["components"]) >= 2


def test_top_institution_scores_highest_on_career():
    recs = cohort()
    ranges = _build_cohort_ranges(recs)
    a = compute_scores(recs[0], ranges)["scores"]["career_success"]["value"]
    c = compute_scores(recs[2], ranges)["scores"]["career_success"]["value"]
    assert a > c  # best placement+salary should outscore the weakest


def test_lower_fees_improve_value_for_money():
    recs = cohort()
    ranges = _build_cohort_ranges(recs)
    cheap = make_record("CHEAP", 0.70, 1500000, 0.12, 18.0, 1500000, 80000)
    pricey = make_record("PRICEY", 0.70, 1500000, 0.12, 18.0, 1500000, 500000)
    extended = recs + [cheap, pricey]
    ranges2 = _build_cohort_ranges(extended)
    v_cheap = compute_scores(cheap, ranges2)["scores"]["value_for_money"]["value"]
    v_pricey = compute_scores(pricey, ranges2)["scores"]["value_for_money"]["value"]
    assert v_cheap > v_pricey


def test_patents_excluded_renormalizes_weights():
    recs = cohort()
    ranges = _build_cohort_ranges(recs)
    acad = compute_scores(recs[0], ranges)["scores"]["academic_strength"]
    patents = next(c for c in acad["components"] if c["label"] == "Patents")
    assert patents["available"] is False
    assert patents["note"]
    # weight basis is the sum of available weights (0.35 + 0.45 = 0.8)
    assert abs(acad["weight_basis"] - 0.8) < 1e-6


def test_every_component_is_explainable():
    recs = cohort()
    ranges = _build_cohort_ranges(recs)
    out = compute_scores(recs[0], ranges)
    for s in out["scores"].values():
        for c in s["components"]:
            assert {"label", "raw_value", "normalized_score", "weight", "contribution", "source", "direction"} <= set(c.keys())


def test_indicative_fees_by_type():
    assert indicative_fees("Indian Institute of Technology Madras")[0] == 230000
    assert indicative_fees("National Institute of Technology Trichy")[0] == 165000
    assert _grade(90) == "AAA" and _grade(10) == "C"
