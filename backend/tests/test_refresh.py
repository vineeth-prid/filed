"""Unit tests for Annual Refresh change-tracking helpers (pure functions)."""
from annual_refresh import _delta, _median_salary, _faculty, _placement, _stages, TRACKED_METRICS


def test_stages_are_seven():
    s = _stages()
    assert len(s) == 7
    assert s[0]["name"] == "Scrape ranking page"
    assert s[6]["name"].startswith("Update database")
    assert all(x["status"] == "pending" for x in s)


def test_tracked_metrics():
    assert TRACKED_METRICS == ["median_salary", "placement_rate", "faculty_count"]


def test_delta_up_down_flat():
    up = _delta(110, 100)
    assert up["delta"] == 10 and up["pct_change"] == 10.0 and up["direction"] == "up"
    down = _delta(90, 100)
    assert down["direction"] == "down" and down["pct_change"] == -10.0
    flat = _delta(100, 100)
    assert flat["direction"] == "flat" and flat["delta"] == 0


def test_delta_percentage_points_for_rates():
    d = _delta(0.78, 0.75, pct_points=True)
    assert d["delta"] == 3.0  # (0.78-0.75)*100 percentage points
    assert d["direction"] == "up"


def test_delta_missing_values():
    d = _delta(None, 100)
    assert d["delta"] is None and d["direction"] == "na"


def test_value_extractors():
    ext = {"fields": {
        "ug_median_salary": {"value": 1500000},
        "pg_median_salary": {"value": 1800000},
        "faculty_count": {"value": 420},
    }}
    assert _median_salary(ext) == 1800000  # max of UG/PG
    assert _faculty(ext) == 420
    dm = {"metrics": {"placement_rate_overall": {"value": 0.82}}}
    assert _placement(dm) == 0.82
    assert _placement(None) is None
