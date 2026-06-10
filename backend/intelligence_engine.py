"""
College Intelligence Engine.

Generates four explainable composite scores (0–100) per institution by combining
the normalized derived metrics + raw extracted fields, scored RELATIVE to the
cohort (same year + category) via min–max normalization, then weighted.

Scores:
  Career Success    : Placement Rate, Median Salary, Higher Studies Rate
  Value For Money   : Median Salary (benefit), Fees (cost, inverted)
  Academic Strength : Faculty Ratio (inverted), Research per Faculty, Patents
  Transparency      : Data Availability (coverage), Source Completeness

Every score stores its components so the UI can show "See How This Was Calculated":
each component carries raw value, unit, direction, normalized sub-score, weight,
contribution, source and notes. Missing components are excluded and the remaining
weights are renormalized (noted in the explanation).

Storage: nirf_intelligence_scores (keyed by document_id), nirf_fees (admin overrides).
Raw data is never mutated — this engine only reads derived_metrics + extractions.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger("nirf.intelligence")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ------------------------------------------------------------------
# Fees — not present in NIRF PDFs. Indicative annual tuition (₹) by
# institution type; overridable per-institution by an admin (nirf_fees).
# ------------------------------------------------------------------
def indicative_fees(college_name: str) -> tuple[int, str]:
    n = (college_name or "").lower()
    if "indian institute of technology" in n:
        return 230000, "Indicative — IIT annual tuition"
    if "national institute of technology" in n:
        return 165000, "Indicative — NIT annual tuition"
    if "vellore institute" in n:
        return 198000, "Indicative — private (VIT) annual tuition"
    if "s.r.m" in n or "srm" in n:
        return 250000, "Indicative — private (SRM) annual tuition"
    if "anna university" in n:
        return 50000, "Indicative — state university annual tuition"
    if "jadavpur" in n:
        return 24000, "Indicative — state university annual tuition"
    return 150000, "Indicative — default annual tuition"


# ------------------------------------------------------------------
# Score catalog (drives the UI + explainability)
# ------------------------------------------------------------------
SCORE_CATALOG = [
    {"key": "career_success", "label": "Career Success Score",
     "inputs": ["Placement Rate", "Median Salary", "Higher Studies Rate"],
     "method": "Cohort-relative min–max normalisation (0–100), weighted average"},
    {"key": "value_for_money", "label": "Value For Money Score",
     "inputs": ["Median Salary (benefit)", "Fees (cost, inverted)"],
     "method": "Cohort-relative min–max normalisation (0–100), weighted average"},
    {"key": "academic_strength", "label": "Academic Strength Score",
     "inputs": ["Faculty Ratio (inverted)", "Research per Faculty", "Patents"],
     "method": "Cohort-relative min–max normalisation (0–100), weighted average"},
    {"key": "transparency", "label": "Transparency Score",
     "inputs": ["Data Availability", "Source Completeness"],
     "method": "Absolute scoring from extraction coverage + source provenance"},
]


def score_catalog() -> list[dict]:
    return SCORE_CATALOG


def _grade(value: Optional[float]) -> str:
    if value is None:
        return "NR"
    if value >= 85: return "AAA"
    if value >= 75: return "AA"
    if value >= 65: return "A"
    if value >= 55: return "BBB"
    if value >= 45: return "BB"
    if value >= 35: return "B"
    return "C"


def _norm(x, lo, hi, higher_better=True) -> Optional[float]:
    if x is None or lo is None or hi is None:
        return None
    if hi == lo:
        return 50.0
    t = (x - lo) / (hi - lo)
    if not higher_better:
        t = 1 - t
    return round(max(0.0, min(1.0, t)) * 100, 1)


def _component(label, raw, unit, direction, normalized, weight, source, note=None):
    contribution = round((normalized or 0) * weight, 2)
    return {
        "label": label,
        "raw_value": raw,
        "unit": unit,
        "direction": direction,
        "normalized_score": normalized,
        "weight": weight,
        "contribution": contribution,
        "source": source,
        "note": note,
        "available": normalized is not None,
    }


def _composite(components: list[dict]) -> tuple[Optional[float], float]:
    """Weighted average over AVAILABLE components, renormalising their weights."""
    avail = [c for c in components if c["available"]]
    wsum = sum(c["weight"] for c in avail)
    if not avail or wsum == 0:
        return None, 0.0
    score = sum(c["normalized_score"] * c["weight"] for c in avail) / wsum
    return round(score, 1), round(wsum, 3)


def _median_salary(fields: dict) -> tuple[Optional[int], Optional[int], float]:
    ug = (fields.get("ug_median_salary") or {})
    pg = (fields.get("pg_median_salary") or {})
    cands = [(ug.get("value"), ug.get("source_page"), ug.get("confidence", 0)),
             (pg.get("value"), pg.get("source_page"), pg.get("confidence", 0))]
    cands = [c for c in cands if c[0] is not None]
    if not cands:
        return None, None, 0.0
    best = max(cands, key=lambda c: c[0])
    return best[0], best[1], best[2]


def _patents_total(fields: dict) -> tuple[Optional[int], float]:
    pf = (fields.get("patents_filed") or {}).get("value")
    pg = (fields.get("patents_granted") or {}).get("value")
    if pf is None and pg is None:
        return None, 0.0
    return (pf or 0) + (pg or 0), 0.6


def _coverage_stats(fields: dict) -> tuple[float, float]:
    """(data_availability%, source_completeness%) from extraction fields."""
    total = len(fields) or 1
    with_value = sum(1 for f in fields.values() if f.get("value") not in (None, ""))
    with_source = sum(1 for f in fields.values() if f.get("source_page"))
    return round(with_value / total * 100, 1), round(with_source / total * 100, 1)


def _dm(metrics: dict, key: str):
    m = (metrics or {}).get(key) or {}
    return m.get("value"), m.get("confidence", 0.0)


def compute_scores(record: dict, cohort: dict) -> dict:
    """record = {fields, metrics, fees, fees_source, college_name}.
    cohort = precomputed {axis: (lo, hi)} ranges across the cohort."""
    fields = record["fields"]
    metrics = record["metrics"]
    fees, fees_source = record["fees"], record["fees_source"]

    pr, pr_c = _dm(metrics, "placement_rate_overall")
    hs, hs_c = _dm(metrics, "higher_studies_rate_overall")
    fr, fr_c = _dm(metrics, "faculty_ratio")
    rpf, rpf_c = _dm(metrics, "research_per_faculty")
    sal, sal_pg, sal_c = _median_salary(fields)
    pat, pat_c = _patents_total(fields)

    # ---- Career Success ----
    career_components = [
        _component("Placement Rate", pr, "ratio", "higher is better",
                   _norm(pr, *cohort["placement"]), 0.45, "derived: placement_rate_overall"),
        _component("Median Salary", sal, "₹/yr", "higher is better",
                   _norm(sal, *cohort["salary"]), 0.35, f"raw: median_salary (p{sal_pg})" if sal_pg else "raw: median_salary"),
        _component("Higher Studies Rate", hs, "ratio", "higher is better",
                   _norm(hs, *cohort["higher_studies"]), 0.20, "derived: higher_studies_rate_overall"),
    ]
    career_value, career_w = _composite(career_components)

    # ---- Value For Money ----
    vfm_components = [
        _component("Median Salary", sal, "₹/yr", "higher is better",
                   _norm(sal, *cohort["salary"]), 0.55, "raw: median_salary"),
        _component("Fees", fees, "₹/yr", "lower is better",
                   _norm(fees, *cohort["fees"], higher_better=False), 0.45, fees_source),
    ]
    vfm_value, vfm_w = _composite(vfm_components)

    # ---- Academic Strength ----
    acad_components = [
        _component("Faculty Ratio", fr, "students:faculty", "lower is better",
                   _norm(fr, *cohort["faculty_ratio"], higher_better=False), 0.35, "derived: faculty_ratio"),
        _component("Research per Faculty", rpf, "₹/faculty", "higher is better",
                   _norm(rpf, *cohort["research"]), 0.45, "derived: research_per_faculty"),
        _component("Patents", pat, "count", "higher is better",
                   _norm(pat, *cohort["patents"]) if pat is not None else None, 0.20,
                   "raw: patents_filed + patents_granted",
                   note=None if pat is not None else "Not disclosed in NIRF PDF — excluded; weights renormalised"),
    ]
    acad_value, acad_w = _composite(acad_components)

    # ---- Transparency (absolute) ----
    avail_pct, source_pct = _coverage_stats(fields)
    trans_components = [
        _component("Data Availability", avail_pct, "%", "higher is better",
                   avail_pct, 0.5, "extraction: fields populated / total"),
        _component("Source Completeness", source_pct, "%", "higher is better",
                   source_pct, 0.5, "extraction: fields with a source PDF page / total"),
    ]
    trans_value, trans_w = _composite(trans_components)

    def conf(*cs):
        cs = [c for c in cs if c]
        return round(sum(cs) / len(cs), 2) if cs else 0.0

    scores = {
        "career_success": {
            "label": "Career Success Score", "value": career_value, "grade": _grade(career_value),
            "confidence": conf(pr_c, sal_c, hs_c), "weight_basis": career_w,
            "method": SCORE_CATALOG[0]["method"], "components": career_components,
        },
        "value_for_money": {
            "label": "Value For Money Score", "value": vfm_value, "grade": _grade(vfm_value),
            "confidence": conf(sal_c), "weight_basis": vfm_w,
            "method": SCORE_CATALOG[1]["method"], "components": vfm_components,
        },
        "academic_strength": {
            "label": "Academic Strength Score", "value": acad_value, "grade": _grade(acad_value),
            "confidence": conf(fr_c, rpf_c, pat_c), "weight_basis": acad_w,
            "method": SCORE_CATALOG[2]["method"], "components": acad_components,
        },
        "transparency": {
            "label": "Transparency Score", "value": trans_value, "grade": _grade(trans_value),
            "confidence": 1.0, "weight_basis": trans_w,
            "method": SCORE_CATALOG[3]["method"], "components": trans_components,
        },
    }
    vals = [s["value"] for s in scores.values() if s["value"] is not None]
    overall = round(sum(vals) / len(vals), 1) if vals else None
    return {"scores": scores, "overall_index": overall, "overall_grade": _grade(overall)}


# ------------------------------------------------------------------
# Cohort assembly + persistence
# ------------------------------------------------------------------
async def _resolve_fees(db, document_id: str, college_name: str) -> tuple[int, str]:
    override = await db.nirf_fees.find_one({"document_id": document_id}, {"_id": 0})
    if override and override.get("fees") is not None:
        return override["fees"], override.get("source", "Admin-set fee")
    return indicative_fees(college_name)


async def _load_cohort_records(db, year: int, category: str) -> list[dict]:
    derived = await db.nirf_derived_metrics.find({"year": year, "category": category}, {"_id": 0}).to_list(1000)
    records = []
    for dm in derived:
        ext = await db.nirf_extractions.find_one({"document_id": dm["document_id"]}, {"_id": 0})
        if not ext:
            continue
        fees, fees_source = await _resolve_fees(db, dm["document_id"], dm.get("college_name"))
        records.append({
            "document_id": dm["document_id"],
            "institute_id": dm.get("institute_id"),
            "year": year, "category": category,
            "college_name": dm.get("college_name"),
            "fields": ext.get("fields", {}),
            "metrics": dm.get("metrics", {}),
            "fees": fees, "fees_source": fees_source,
        })
    return records


def _build_cohort_ranges(records: list[dict]) -> dict:
    def col(extractor):
        return [v for v in (extractor(r) for r in records) if v is not None]

    def mm(vals):
        return (min(vals), max(vals)) if vals else (None, None)

    return {
        "placement": mm(col(lambda r: (r["metrics"].get("placement_rate_overall") or {}).get("value"))),
        "higher_studies": mm(col(lambda r: (r["metrics"].get("higher_studies_rate_overall") or {}).get("value"))),
        "faculty_ratio": mm(col(lambda r: (r["metrics"].get("faculty_ratio") or {}).get("value"))),
        "research": mm(col(lambda r: (r["metrics"].get("research_per_faculty") or {}).get("value"))),
        "salary": mm(col(lambda r: _median_salary(r["fields"])[0])),
        "fees": mm(col(lambda r: r["fees"])),
        "patents": mm(col(lambda r: _patents_total(r["fields"])[0])),
    }


async def _persist_scores(db, record: dict, computed: dict, cohort_size: int) -> dict:
    rec = {
        "id": str(uuid.uuid4()),
        "document_id": record["document_id"],
        "institute_id": record["institute_id"],
        "year": record["year"], "category": record["category"],
        "college_name": record["college_name"],
        "fees": record["fees"], "fees_source": record["fees_source"],
        "cohort_size": cohort_size,
        "scores": computed["scores"],
        "overall_index": computed["overall_index"],
        "overall_grade": computed["overall_grade"],
        "computed_at": _now_iso(),
    }
    existing = await db.nirf_intelligence_scores.find_one({"document_id": record["document_id"]}, {"_id": 0})
    if existing:
        rec["id"] = existing["id"]
    await db.nirf_intelligence_scores.update_one(
        {"document_id": record["document_id"]}, {"$set": rec}, upsert=True)
    return rec


async def compute_one(db, document_id: str) -> Optional[dict]:
    dm = await db.nirf_derived_metrics.find_one({"document_id": document_id}, {"_id": 0})
    if not dm:
        return None
    records = await _load_cohort_records(db, dm["year"], dm["category"])
    cohort = _build_cohort_ranges(records)
    target = next((r for r in records if r["document_id"] == document_id), None)
    if not target:
        return None
    computed = compute_scores(target, cohort)
    return await _persist_scores(db, target, computed, len(records))


async def run_intelligence(db, job_id: str, year: int, category: str):
    logs: list[str] = []

    def log(msg: str):
        line = f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}"
        logs.append(line)
        logger.info(line)

    await db.nirf_intelligence_jobs.update_one(
        {"id": job_id}, {"$set": {"status": "Running", "started_at": _now_iso()}})
    try:
        records = await _load_cohort_records(db, year, category)
        cohort = _build_cohort_ranges(records)
        log(f"Scoring {len(records)} institutions for {category} {year} (cohort-relative)")
        ok = 0
        for r in records:
            computed = compute_scores(r, cohort)
            await _persist_scores(db, r, computed, len(records))
            ok += 1
            s = computed["scores"]
            log(f"   {r['institute_id']:<16} CS {s['career_success']['value']} · VFM {s['value_for_money']['value']} · AS {s['academic_strength']['value']} · T {s['transparency']['value']}")
        await db.nirf_intelligence_jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "Completed", "completed_at": _now_iso(),
                      "stats": {"total": len(records), "scored": ok}, "logs": logs[-300:]}})
    except Exception as e:
        logger.exception("Intelligence job failed")
        log(f"FATAL: {e}")
        await db.nirf_intelligence_jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "Failed", "completed_at": _now_iso(),
                      "error": str(e)[:500], "logs": logs[-300:]}})


async def set_fees(db, document_id: str, fees: int, source: str = "Admin-set fee") -> dict:
    await db.nirf_fees.update_one(
        {"document_id": document_id},
        {"$set": {"document_id": document_id, "fees": fees, "source": source, "updated_at": _now_iso()}},
        upsert=True)
    return await compute_one(db, document_id)
