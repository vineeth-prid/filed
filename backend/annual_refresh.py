"""
Annual NIRF Refresh Workflow + Year-on-Year Change Tracking.

One-click "Sync NIRF {year}" that orchestrates the full pipeline as a single
staged background job:

  1. Scrape ranking page      (nirf_service.scrape_ranking_page)
  2. Find institutions        (parse rows)
  3. Generate PDF URLs        (nirf_service.generate_pdf_url)
  4. Download reports         (nirf_service.download_pdf)
  5. Extract data             (nirf_extractor._extract_and_store)
  6. Calculate metrics+scores (nirf_normalizer + intelligence_engine)
  7. Update database & track changes (build_change_tracking)

Historical records are NEVER overwritten: every collection is keyed by
(institute_id, year, category) / per-year document_id, so a new survey year
creates new documents and leaves prior years untouched.

When upstream NIRF is unreachable / the year isn't published yet, stage 4 yields
no PDFs; the workflow then falls back to a clearly-labelled SIMULATED carry-forward
from the latest available year (realistic per-institution deltas) so change
tracking + YoY trends remain demonstrable. Simulated records carry
data_origin="simulated".

Change tracking surfaces: Median Salary, Placement, Faculty changes + YoY trends.
"""
from __future__ import annotations

import asyncio
import logging
import random
import uuid
from datetime import datetime, timezone
from typing import Optional

from nirf_service import scrape_ranking_page, generate_pdf_url, download_pdf
from nirf_extractor import _extract_and_store
from nirf_normalizer import persist_raw_data, persist_derived_metrics
from intelligence_engine import (
    _load_cohort_records, _build_cohort_ranges, compute_scores, _persist_scores,
)

logger = logging.getLogger("nirf.refresh")

TRACKED_METRICS = ["median_salary", "placement_rate", "faculty_count"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _stages() -> list[dict]:
    names = [
        "Scrape ranking page", "Find institutions", "Generate PDF URLs",
        "Download reports", "Extract data", "Calculate metrics & scores",
        "Update database & track changes",
    ]
    return [{"n": i + 1, "name": n, "status": "pending", "detail": ""} for i, n in enumerate(names)]


# ------------------------------------------------------------------
# Helpers to read tracked values from stored records
# ------------------------------------------------------------------
def _median_salary(ext: dict) -> Optional[int]:
    f = ext.get("fields", {})
    vals = [(f.get("ug_median_salary") or {}).get("value"), (f.get("pg_median_salary") or {}).get("value")]
    vals = [v for v in vals if v is not None]
    return max(vals) if vals else None


def _faculty(ext: dict) -> Optional[int]:
    return (ext.get("fields", {}).get("faculty_count") or {}).get("value")


def _placement(dm: dict) -> Optional[float]:
    return ((dm or {}).get("metrics", {}).get("placement_rate_overall") or {}).get("value")


def _delta(current, previous, pct_points=False) -> dict:
    if current is None or previous is None:
        return {"current": current, "previous": previous, "delta": None, "pct_change": None, "direction": "na"}
    delta = round(current - previous, 4)
    if pct_points:  # ratios -> express delta in percentage points
        delta = round((current - previous) * 100, 2)
    pct = round((current - previous) / previous * 100, 1) if previous else None
    direction = "up" if (current - previous) > 0 else "down" if (current - previous) < 0 else "flat"
    return {"current": current, "previous": previous, "delta": delta, "pct_change": pct, "direction": direction}


async def _years_with_data(db, category: str) -> list[int]:
    years = await db.nirf_extractions.distinct("year", {"category": category})
    return sorted([y for y in years if isinstance(y, int)])


async def _previous_year_with_data(db, year: int, category: str) -> Optional[int]:
    years = [y for y in await _years_with_data(db, category) if y < year]
    return max(years) if years else None


# ------------------------------------------------------------------
# Simulated carry-forward (labelled) when upstream is unavailable
# ------------------------------------------------------------------
async def _simulate_year_from_prior(db, year: int, category: str, prior_year: int, log) -> int:
    prior = await db.nirf_extractions.find(
        {"year": prior_year, "category": category}, {"_id": 0}).to_list(1000)
    if not prior:
        return 0
    count = 0
    for pe in prior:
        iid = pe["institute_id"]
        rnd = random.Random(f"{iid}-{year}")
        sal_f = 1 + rnd.uniform(0.02, 0.12)
        plc_f = 1 + rnd.uniform(-0.03, 0.08)
        grad_f = 1 + rnd.uniform(0.0, 0.05)
        hs_f = 1 + rnd.uniform(-0.10, 0.18)
        fac_f = 1 + rnd.uniform(-0.02, 0.06)
        res_f = 1 + rnd.uniform(-0.05, 0.15)

        new_fields = {}
        for k, f in pe.get("fields", {}).items():
            nf = dict(f)
            nf["method"] = "simulated"
            nf["confidence"] = round((f.get("confidence", 0) or 0) * 0.9, 2)
            new_fields[k] = nf

        def bump(key, factor):
            f = new_fields.get(key)
            if f and isinstance(f.get("value"), (int, float)):
                f["value"] = int(round(f["value"] * factor))

        for k in ("ug_median_salary", "pg_median_salary"):
            bump(k, sal_f)
        for k in ("ug_placed", "pg_placed"):
            bump(k, plc_f)
        for k in ("ug_graduated", "pg_graduated", "total_students", "ug_students", "pg_students", "phd_students"):
            bump(k, grad_f)
        for k in ("ug_higher_studies", "pg_higher_studies"):
            bump(k, hs_f)
        bump("faculty_count", fac_f)
        bump("research_funding", res_f)
        bump("sponsored_projects", res_f)

        # Institution record for the new year (carry location/rank metadata)
        inst = await db.nirf_institutions.find_one(
            {"institute_id": iid, "year": prior_year, "category": category}, {"_id": 0})
        if inst:
            ni = {k: v for k, v in inst.items() if k != "id"}
            ni.update({"id": str(uuid.uuid4()), "year": year, "ingested_at": _now_iso()})
            await db.nirf_institutions.update_one(
                {"institute_id": iid, "year": year, "category": category}, {"$set": ni}, upsert=True)

        # Document record (marked downloaded+simulated so downstream runs)
        await db.nirf_documents.update_one(
            {"institute_id": iid, "year": year, "category": category},
            {"$setOnInsert": {"id": str(uuid.uuid4())},
             "$set": {
                "institute_id": iid, "college_name": pe.get("college_name"),
                "year": year, "category": category,
                "url": generate_pdf_url(year, category, iid),
                "status": "Downloaded", "path": None, "size": 0, "attempts": 1,
                "data_origin": "simulated", "updated_at": _now_iso()}},
            upsert=True)
        docrec = await db.nirf_documents.find_one(
            {"institute_id": iid, "year": year, "category": category}, {"_id": 0})
        did = docrec["id"]

        await db.nirf_extractions.update_one(
            {"document_id": did},
            {"$setOnInsert": {"id": str(uuid.uuid4())},
             "$set": {
                "document_id": did, "institute_id": iid, "year": year, "category": category,
                "college_name": pe.get("college_name"), "status": "Extracted", "error": None,
                "overall_confidence": round((pe.get("overall_confidence", 0) or 0) * 0.9, 3),
                "coverage": pe.get("coverage", 0), "methods_used": ["simulated"],
                "page_count": pe.get("page_count"), "data_origin": "simulated",
                "fields": new_fields, "extracted_at": _now_iso()}},
            upsert=True)
        count += 1
    log(f"   Simulated {count} institutions for {year} (carry-forward from {prior_year}, labelled)")
    return count


# ------------------------------------------------------------------
# Change tracking
# ------------------------------------------------------------------
async def build_change_tracking(db, year: int, category: str) -> dict:
    prev = await _previous_year_with_data(db, year, category)
    if not prev:
        return {"previous_year": None, "changes": 0}

    cur_ext = {e["institute_id"]: e for e in await db.nirf_extractions.find({"year": year, "category": category}, {"_id": 0}).to_list(1000)}
    prev_ext = {e["institute_id"]: e for e in await db.nirf_extractions.find({"year": prev, "category": category}, {"_id": 0}).to_list(1000)}
    cur_dm = {d["institute_id"]: d for d in await db.nirf_derived_metrics.find({"year": year, "category": category}, {"_id": 0}).to_list(1000)}
    prev_dm = {d["institute_id"]: d for d in await db.nirf_derived_metrics.find({"year": prev, "category": category}, {"_id": 0}).to_list(1000)}

    n = 0
    for iid, ce in cur_ext.items():
        pe = prev_ext.get(iid)
        if not pe:
            continue
        changes = {
            "median_salary": _delta(_median_salary(ce), _median_salary(pe)),
            "placement_rate": _delta(_placement(cur_dm.get(iid)), _placement(prev_dm.get(iid)), pct_points=True),
            "faculty_count": _delta(_faculty(ce), _faculty(pe)),
        }
        rec = {
            "institute_id": iid, "college_name": ce.get("college_name"),
            "category": category, "year": year, "previous_year": prev,
            "document_id": ce.get("document_id"),
            "data_origin": ce.get("data_origin", "extracted"),
            "changes": changes, "computed_at": _now_iso(),
        }
        existing = await db.nirf_yoy_changes.find_one(
            {"institute_id": iid, "year": year, "category": category}, {"_id": 0})
        rec["id"] = existing["id"] if existing else str(uuid.uuid4())
        await db.nirf_yoy_changes.update_one(
            {"institute_id": iid, "year": year, "category": category}, {"$set": rec}, upsert=True)
        n += 1
    return {"previous_year": prev, "changes": n}


async def get_trends(db, category: str, metric: str = "median_salary") -> dict:
    years = await _years_with_data(db, category)
    exts_by_year = {}
    dms_by_year = {}
    for y in years:
        exts_by_year[y] = {e["institute_id"]: e for e in await db.nirf_extractions.find({"year": y, "category": category}, {"_id": 0}).to_list(1000)}
        dms_by_year[y] = {d["institute_id"]: d for d in await db.nirf_derived_metrics.find({"year": y, "category": category}, {"_id": 0}).to_list(1000)}

    def value_for(iid, y):
        if metric == "median_salary":
            return _median_salary(exts_by_year[y].get(iid, {}))
        if metric == "faculty_count":
            return _faculty(exts_by_year[y].get(iid, {}))
        if metric == "placement_rate":
            v = _placement(dms_by_year[y].get(iid))
            return round(v * 100, 1) if v is not None else None
        return None

    institutes = {}
    for y in years:
        for iid, e in exts_by_year[y].items():
            institutes.setdefault(iid, e.get("college_name"))

    series = []
    for iid, name in institutes.items():
        points = [{"year": y, "value": value_for(iid, y)} for y in years]
        if any(p["value"] is not None for p in points):
            series.append({"institute_id": iid, "college_name": name, "points": points})

    # Cohort average per year
    averages = []
    for y in years:
        vals = [value_for(iid, y) for iid in institutes]
        vals = [v for v in vals if v is not None]
        averages.append({"year": y, "value": round(sum(vals) / len(vals), 1) if vals else None})

    return {"category": category, "metric": metric, "years": years, "average": averages, "series": series}


# ------------------------------------------------------------------
# Orchestrated refresh job
# ------------------------------------------------------------------
async def run_annual_refresh(db, job_id: str, year: int, category: str, limit: int = 25, simulate: bool = True):
    stages = _stages()
    logs: list[str] = []

    def log(msg: str):
        line = f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}"
        logs.append(line)
        logger.info(line)

    async def push(status="Running"):
        await db.nirf_refresh_jobs.update_one(
            {"id": job_id}, {"$set": {"status": status, "stages": stages, "logs": logs[-400:]}})

    async def stage(i, status, detail=""):
        stages[i]["status"] = status
        if detail:
            stages[i]["detail"] = detail
        await push()

    await db.nirf_refresh_jobs.update_one({"id": job_id}, {"$set": {"started_at": _now_iso()}})
    data_origin = "extracted"
    try:
        # Stage 1-2 — scrape + find
        await stage(0, "running")
        used_fallback = {"used": False}
        log(f"Sync NIRF {year} · {category} — scraping ranking page…")
        rows = await scrape_ranking_page(year, category, used_fallback)
        await stage(0, "done", f"{'fallback fixture' if used_fallback['used'] else 'live page'}")
        await stage(1, "running")
        rows = rows[:limit] if limit else rows
        log(f"Found {len(rows)} institutions")
        await stage(1, "done", f"{len(rows)} institutions")

        # Stage 3 — generate URLs
        await stage(2, "running")
        for r in rows:
            r["_url"] = generate_pdf_url(year, category, r["institute_id"])
        await stage(2, "done", f"{len(rows)} URLs")

        # Stage 4 — download (with a fast connectivity probe so we don't hang
        # for 30s × N when upstream is unreachable / the year isn't published).
        await stage(3, "running")
        downloaded = 0
        for r in rows:
            iid = r["institute_id"]
            await db.nirf_institutions.update_one(
                {"institute_id": iid, "year": year, "category": category},
                {"$setOnInsert": {"id": str(uuid.uuid4())},
                 "$set": {**r, "year": year, "category": category, "ingested_at": _now_iso()}},
                upsert=True)
            await db.nirf_documents.update_one(
                {"institute_id": iid, "year": year, "category": category},
                {"$setOnInsert": {"id": str(uuid.uuid4())},
                 "$set": {"institute_id": iid, "college_name": r.get("college_name"),
                          "year": year, "category": category, "url": r["_url"],
                          "status": "Pending", "updated_at": _now_iso()}},
                upsert=True)

        async def _download(iid):
            try:
                return await asyncio.wait_for(download_pdf(year, category, iid), timeout=8)
            except (asyncio.TimeoutError, Exception):
                return {"status": "Failed", "path": None, "size": 0, "error": "timeout/unreachable", "url": generate_pdf_url(year, category, iid)}

        # Probe the first couple of institutions; if upstream is unreachable, bail fast.
        probe_ok = False
        for r in rows[:2]:
            res = await _download(r["institute_id"])
            if res["status"] == "Downloaded":
                probe_ok = True
            doc = await db.nirf_documents.find_one({"institute_id": r["institute_id"], "year": year, "category": category}, {"_id": 0})
            await db.nirf_documents.update_one({"id": doc["id"]}, {"$set": {"status": res["status"], "path": res.get("path"), "size": res.get("size", 0), "error": res.get("error"), "updated_at": _now_iso()}})
            if res["status"] == "Downloaded":
                downloaded += 1
        if probe_ok:
            for r in rows[2:]:
                iid = r["institute_id"]
                res = await _download(iid)
                doc = await db.nirf_documents.find_one({"institute_id": iid, "year": year, "category": category}, {"_id": 0})
                await db.nirf_documents.update_one({"id": doc["id"]}, {"$set": {"status": res["status"], "path": res.get("path"), "size": res.get("size", 0), "error": res.get("error"), "updated_at": _now_iso()}})
                if res["status"] == "Downloaded":
                    downloaded += 1
        else:
            log("Upstream probe failed — skipping remaining downloads")
        log(f"Downloaded {downloaded}/{len(rows)} PDFs")

        # Fallback to simulated carry-forward if nothing could be downloaded
        if downloaded == 0:
            prior = await _previous_year_with_data(db, year, category)
            if simulate and prior:
                data_origin = "simulated"
                log(f"Upstream PDFs unavailable for {year} — using labelled simulated carry-forward from {prior}")
                await _simulate_year_from_prior(db, year, category, prior, log)
                await stage(3, "done", f"0 live · simulated from {prior}")
            else:
                await stage(3, "failed", "No PDFs downloaded and no prior year to simulate from")
                raise RuntimeError("No PDFs downloaded; cannot continue")
        else:
            await stage(3, "done", f"{downloaded} downloaded")

        # Stage 5 — extract (only for real downloads; simulated already has extractions)
        await stage(4, "running")
        if data_origin != "simulated":
            docs = await db.nirf_documents.find(
                {"year": year, "category": category, "status": "Downloaded"}, {"_id": 0}).to_list(1000)
            ok = 0
            for d in docs:
                rec = await _extract_and_store(db, d)
                if rec["status"] == "Extracted":
                    ok += 1
            await stage(4, "done", f"{ok} extracted")
            log(f"Extracted {ok} institutions")
        else:
            await stage(4, "done", "simulated extractions")

        # Stage 6 — metrics + scores
        await stage(5, "running")
        exts = await db.nirf_extractions.find({"year": year, "category": category}, {"_id": 0}).to_list(1000)
        for e in exts:
            raw_doc = await persist_raw_data(db, e)
            await persist_derived_metrics(db, raw_doc)
        # intelligence (cohort-relative)
        records = await _load_cohort_records(db, year, category)
        cohort = _build_cohort_ranges(records)
        for r in records:
            computed = compute_scores(r, cohort)
            await _persist_scores(db, r, computed, len(records))
        await stage(5, "done", f"{len(records)} scored")
        log(f"Calculated metrics + intelligence scores for {len(records)} institutions")

        # Stage 7 — update DB + change tracking
        await stage(6, "running")
        ct = await build_change_tracking(db, year, category)
        detail = f"vs {ct['previous_year']}: {ct['changes']} institutions tracked" if ct["previous_year"] else "first year — no prior to compare"
        await stage(6, "done", detail)
        log(f"Change tracking — {detail}")

        await db.nirf_refresh_jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "Completed", "completed_at": _now_iso(),
                      "data_origin": data_origin,
                      "stats": {"institutions": len(exts), "downloaded": downloaded,
                                "previous_year": ct["previous_year"], "changes_tracked": ct["changes"]},
                      "stages": stages, "logs": logs[-400:]}})
    except Exception as e:
        logger.exception("Annual refresh failed")
        log(f"FATAL: {e}")
        await db.nirf_refresh_jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "Failed", "completed_at": _now_iso(),
                      "error": str(e)[:500], "stages": stages, "logs": logs[-400:]}})
