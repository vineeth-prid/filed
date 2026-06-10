"""
College Data Normalization Service.

Turns raw extracted NIRF fields into comparable, derived metrics across
institutions — WITHOUT ever mutating the raw data.

Storage (MongoDB collections modelling the two required tables):
  - nirf_raw_data        : immutable, versioned snapshots of raw extracted fields.
                           Insert-only. Existing rows are NEVER updated/overwritten.
  - nirf_derived_metrics : computed metrics, each carrying its formula + the exact
                           input fields (value + source_page) used, plus a pointer
                           to the raw_data version it was derived from.

Derived metrics:
  Placement Rate        = Placed / Graduated
  Higher Studies Rate   = Higher Studies / Graduated
  Outcome Rate          = (Placed + Higher Studies) / Graduated
  Faculty Ratio         = Students / Faculty
  Research Per Faculty  = Research Funding / Faculty

Placement/Outcome rates are computed for UG, PG and an Overall (UG+PG) segment.
Every metric is traceable to the raw_data snapshot and its source PDF page(s).
"""
from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger("nirf.normalize")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ------------------------------------------------------------------
# Metric definitions: name -> (label, group, formula, numerator field
# keys [summed], denominator field key, kind)
# ------------------------------------------------------------------
METRIC_DEFS = [
    # key, label, group, formula, numerator_keys, denom_key, kind
    ("placement_rate_ug",      "Placement Rate (UG)",      "Placement Rate",      "UG Placed / UG Graduated",                ["ug_placed"],                  "ug_graduated",  "rate"),
    ("placement_rate_pg",      "Placement Rate (PG)",      "Placement Rate",      "PG Placed / PG Graduated",                ["pg_placed"],                  "pg_graduated",  "rate"),
    ("placement_rate_overall", "Placement Rate (Overall)", "Placement Rate",      "(UG+PG Placed) / (UG+PG Graduated)",      ["ug_placed", "pg_placed"],     "graduated_total", "rate"),

    ("higher_studies_rate_ug",      "Higher Studies Rate (UG)",      "Higher Studies Rate", "UG Higher Studies / UG Graduated",            ["ug_higher_studies"],                    "ug_graduated",   "rate"),
    ("higher_studies_rate_pg",      "Higher Studies Rate (PG)",      "Higher Studies Rate", "PG Higher Studies / PG Graduated",            ["pg_higher_studies"],                    "pg_graduated",   "rate"),
    ("higher_studies_rate_overall", "Higher Studies Rate (Overall)", "Higher Studies Rate", "(UG+PG Higher Studies) / (UG+PG Graduated)",  ["ug_higher_studies", "pg_higher_studies"], "graduated_total", "rate"),

    ("outcome_rate_ug",      "Outcome Rate (UG)",      "Outcome Rate", "(UG Placed + UG Higher Studies) / UG Graduated",               ["ug_placed", "ug_higher_studies"],                              "ug_graduated",    "rate"),
    ("outcome_rate_pg",      "Outcome Rate (PG)",      "Outcome Rate", "(PG Placed + PG Higher Studies) / PG Graduated",               ["pg_placed", "pg_higher_studies"],                              "pg_graduated",    "rate"),
    ("outcome_rate_overall", "Outcome Rate (Overall)", "Outcome Rate", "(UG+PG Placed + UG+PG Higher Studies) / (UG+PG Graduated)",    ["ug_placed", "pg_placed", "ug_higher_studies", "pg_higher_studies"], "graduated_total", "rate"),

    ("faculty_ratio",        "Faculty Ratio (Students : Faculty)", "Faculty",  "Total Students / Faculty",        ["total_students"],  "faculty_count", "ratio"),
    ("research_per_faculty", "Research Funding per Faculty (₹)",   "Research", "Research Funding / Faculty",      ["research_funding"], "faculty_count", "perfaculty"),
]

# Synthetic denominator (sum of UG+PG graduated) used by the *_overall metrics.
_SYNTHETIC_DENOMS = {"graduated_total": ["ug_graduated", "pg_graduated"]}


def metric_catalog() -> list[dict]:
    return [
        {"key": k, "label": label, "group": grp, "formula": formula, "kind": kind}
        for (k, label, grp, formula, _n, _d, kind) in METRIC_DEFS
    ]


def _field_val(fields: dict, key: str):
    f = fields.get(key) or {}
    return f.get("value"), f.get("source_page"), f.get("confidence", 0.0)


def _resolve_inputs(fields: dict, keys: list[str]) -> tuple[list[dict], Optional[float], list[float]]:
    """Return (input-trace list, summed numeric value or None, confidences)."""
    inputs = []
    total = 0.0
    ok = True
    confs = []
    for k in keys:
        if k in _SYNTHETIC_DENOMS:
            sub_inputs, sub_total, sub_confs = _resolve_inputs(fields, _SYNTHETIC_DENOMS[k])
            inputs.extend(sub_inputs)
            if sub_total is None:
                ok = False
            else:
                total += sub_total
                confs.extend(sub_confs)
            continue
        v, page, conf = _field_val(fields, k)
        inputs.append({"field": k, "value": v, "source_page": page, "confidence": conf})
        if v is None:
            ok = False
        else:
            try:
                total += float(v)
                confs.append(conf)
            except (TypeError, ValueError):
                ok = False
    return inputs, (total if ok else None), confs


def compute_derived_metrics(fields: dict) -> dict:
    """Pure function: raw fields -> derived metrics with full traceability."""
    metrics: dict[str, dict] = {}
    for (key, label, group, formula, num_keys, denom_key, kind) in METRIC_DEFS:
        num_inputs, num_val, num_confs = _resolve_inputs(fields, num_keys)
        den_inputs, den_val, den_confs = _resolve_inputs(fields, [denom_key])
        inputs = num_inputs + den_inputs

        status = "ok"
        value = None
        if num_val is None or den_val is None:
            status = "insufficient_data"
        elif den_val == 0:
            status = "division_by_zero"
        else:
            value = round(num_val / den_val, 4)

        confs = num_confs + den_confs
        confidence = round(min(confs), 2) if (status == "ok" and confs) else 0.0
        metrics[key] = {
            "label": label,
            "group": group,
            "formula": formula,
            "kind": kind,
            "value": value,
            "status": status,
            "confidence": confidence,
            "inputs": inputs,
        }
    return metrics


# ------------------------------------------------------------------
# Persistence — immutable raw_data + derived_metrics
# ------------------------------------------------------------------
def _content_hash(fields: dict) -> str:
    snapshot = {k: (fields.get(k) or {}).get("value") for k in sorted(fields.keys())}
    return hashlib.sha256(json.dumps(snapshot, sort_keys=True, default=str).encode()).hexdigest()


async def persist_raw_data(db, extraction: dict) -> dict:
    """Insert an immutable, versioned snapshot of the raw extracted fields.

    Never updates an existing row. A new version is created only when the field
    values differ from the latest stored snapshot for the document.
    """
    fields = extraction.get("fields", {})
    chash = _content_hash(fields)
    latest = await db.nirf_raw_data.find(
        {"document_id": extraction["document_id"]}, {"_id": 0}
    ).sort("version", -1).to_list(1)
    latest = latest[0] if latest else None

    if latest and latest.get("content_hash") == chash:
        return latest  # identical raw values already captured — do not duplicate

    version = (latest["version"] + 1) if latest else 1
    doc = {
        "id": str(uuid.uuid4()),
        "document_id": extraction["document_id"],
        "extraction_id": extraction.get("id"),
        "institute_id": extraction.get("institute_id"),
        "year": extraction.get("year"),
        "category": extraction.get("category"),
        "college_name": extraction.get("college_name"),
        "version": version,
        "content_hash": chash,
        "fields": fields,
        "immutable": True,
        "created_at": _now_iso(),
    }
    await db.nirf_raw_data.insert_one({**doc})  # INSERT-ONLY; raw data never overwritten
    return doc


async def persist_derived_metrics(db, raw_doc: dict) -> dict:
    """Compute and upsert derived metrics tied to a specific raw_data version."""
    metrics = compute_derived_metrics(raw_doc["fields"])
    computed = [m for m in metrics.values() if m["status"] == "ok"]
    avg_conf = round(sum(m["confidence"] for m in computed) / len(computed), 3) if computed else 0.0

    rec = {
        "id": str(uuid.uuid4()),
        "document_id": raw_doc["document_id"],
        "institute_id": raw_doc.get("institute_id"),
        "year": raw_doc.get("year"),
        "category": raw_doc.get("category"),
        "college_name": raw_doc.get("college_name"),
        "raw_data_id": raw_doc["id"],
        "raw_data_version": raw_doc["version"],
        "metrics": metrics,
        "metrics_computed": len(computed),
        "metrics_total": len(metrics),
        "avg_confidence": avg_conf,
        "computed_at": _now_iso(),
    }
    existing = await db.nirf_derived_metrics.find_one({"document_id": raw_doc["document_id"]}, {"_id": 0})
    if existing:
        rec["id"] = existing["id"]
    await db.nirf_derived_metrics.update_one(
        {"document_id": raw_doc["document_id"]}, {"$set": rec}, upsert=True)
    return rec


async def normalize_document(db, document_id: str) -> Optional[dict]:
    """Snapshot raw data (immutable) + (re)compute derived metrics for one doc."""
    ext = await db.nirf_extractions.find_one({"document_id": document_id}, {"_id": 0})
    if not ext:
        ext = await db.nirf_extractions.find_one({"id": document_id}, {"_id": 0})
    if not ext:
        return None
    raw_doc = await persist_raw_data(db, ext)
    derived = await persist_derived_metrics(db, raw_doc)
    return {"raw_data": raw_doc, "derived": derived}


async def run_normalization(db, job_id: str, year: int, category: str, limit: int = 500):
    """Background batch: normalize every extracted document for year/category."""
    logs: list[str] = []

    def log(msg: str):
        line = f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}"
        logs.append(line)
        logger.info(line)

    await db.nirf_normalize_jobs.update_one(
        {"id": job_id}, {"$set": {"status": "Running", "started_at": _now_iso()}})
    try:
        exts = await db.nirf_extractions.find(
            {"year": year, "category": category}, {"_id": 0}).to_list(limit)
        log(f"Normalizing {len(exts)} extracted institutions for {category} {year}")
        ok = 0
        for e in exts:
            raw_doc = await persist_raw_data(db, e)
            derived = await persist_derived_metrics(db, raw_doc)
            ok += 1
            log(f"   {e.get('institute_id'):<16} v{raw_doc['version']} · {derived['metrics_computed']}/{derived['metrics_total']} metrics · avg {int(derived['avg_confidence']*100)}%")
        await db.nirf_normalize_jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "Completed", "completed_at": _now_iso(),
                      "stats": {"total": len(exts), "normalized": ok},
                      "logs": logs[-300:]}})
    except Exception as e:
        logger.exception("Normalization job failed")
        log(f"FATAL: {e}")
        await db.nirf_normalize_jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "Failed", "completed_at": _now_iso(),
                      "error": str(e)[:500], "logs": logs[-300:]}})
