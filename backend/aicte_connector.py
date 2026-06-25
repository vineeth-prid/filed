"""
AICTE Connector — Data Acquisition (JSON API source).

Flow:  AICTE API → Fetch JSON → Store Raw Payload (immutable) → Normalize → Validate → Publish (aicte_records).

This connector NEVER touches any NIRF collection or workflow.

Endpoints are stored dynamically in `aicte_api_sources` (NRI / PIO / FN / CIWG / future categories).
The academic year is chosen per sync (mirrors the NIRF year picker).

Live-first with a labelled SIMULATED fallback: we attempt a real HTTP fetch with a short
connectivity probe; if the upstream AICTE endpoint is unreachable (it geo/IP-restricts
non-India egress) we fall back to a clearly-labelled simulated payload that mirrors the
real schema, so the full pipeline stays demonstrable. data_origin is surfaced everywhere.
"""
import uuid
import logging
import os
import random
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

# Base AICTE dashboard endpoint. The query string (?q=<year>&q1=<category>) is built
# at sync time so years/categories are dynamic, never hardcoded into the stored URL.
AICTE_BASE_URL = "https://facilities.aicte-india.org/dashboard/pages/php/nripiofcinstitute.php"

# Default supernumerary-quota categories. Stored as rows in aicte_api_sources so new
# categories can be added dynamically without code changes.
DEFAULT_CATEGORIES = [
    ("PIO-FN-CIWG Institutes — NRI", "NRI"),
    ("PIO-FN-CIWG Institutes — PIO", "PIO"),
    ("PIO-FN-CIWG Institutes — FN", "FN"),
    ("PIO-FN-CIWG Institutes — CIWG", "CIWG"),
]

DEFAULT_YEAR = "2025-2026"

_HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://facilities.aicte-india.org/dashboard/pages/angulardashboard.php",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_url(year: str, category: str, base: str = AICTE_BASE_URL) -> str:
    return f"{base}?q={year}&q1={category}"


# ---------------- Field normalization (case-insensitive, multi-candidate) ----------------
# AICTE dashboard payloads use inconsistent key casing across endpoints; we map robustly.
_FIELD_CANDIDATES = {
    "colid": ["colid", "col_id", "college_id", "institute_id", "institutionid", "id", "pid", "permanent_id", "aicte_id"],
    "collegename": ["collegename", "college_name", "institute_name", "institutionname", "institution_name", "name", "iname"],
    "state": ["state", "state_name", "statename"],
    "district": ["district", "district_name", "districtname"],
    "institution_type": ["type", "institution_type", "institutiontype", "institute_type", "itype", "college_type", "ownership"],
    "program": ["program", "programme", "prog", "program_name"],
    "university": ["university", "univ", "affiliating_university", "universityname", "university_name"],
    "course_level": ["corlevel", "course_level", "level", "courselevel", "programlevel", "program_level"],
    "course_name": ["corname", "course_name", "course", "coursename", "branch", "branch_name"],
    "approved_intake": ["intake", "approved_intake", "approvedintake", "sanctioned_intake", "approved", "total_intake", "totalintake"],
    # Category-specific supernumerary intake (AICTE uses piointake / nriintake / fnintake / ciwgintake).
    "special_intake": ["special_intake", "specialintake", "supernumerary", "supernumerary_intake", "quota_intake", "si"],
}


def _pick(low: dict, keys: list):
    for k in keys:
        if k in low:
            v = low[k]
            if v not in (None, "", "null", "NULL"):
                return v
    return None


def _to_int(v):
    if v is None:
        return None
    try:
        return int(float(str(v).strip().replace(",", "")))
    except (ValueError, TypeError):
        return None


def normalize_record(raw: dict, year: str, category: str, raw_payload_id: str) -> dict:
    """Map a raw AICTE record to the canonical aicte_records schema. Never mutates `raw`."""
    if not isinstance(raw, dict):
        raw = {}
    low = {str(k).strip().lower(): val for k, val in raw.items()}
    colid_val = _pick(low, _FIELD_CANDIDATES["colid"])
    # Special intake is category-specific (e.g. piointake, nriintake, fnintake, ciwgintake).
    cat = (category or "").strip().lower()
    special_keys = [f"{cat}intake", f"{cat}_intake", "piointake", "nriintake", "fnintake", "ciwgintake",
                    *_FIELD_CANDIDATES["special_intake"]]
    return {
        "id": str(uuid.uuid4()),
        "academic_year": year,
        "source_category": category,
        "colid": (str(colid_val) if colid_val is not None else None),
        "collegename": _pick(low, _FIELD_CANDIDATES["collegename"]),
        "state": _pick(low, _FIELD_CANDIDATES["state"]),
        "district": _pick(low, _FIELD_CANDIDATES["district"]),
        "institution_type": _pick(low, _FIELD_CANDIDATES["institution_type"]),
        "program": _pick(low, _FIELD_CANDIDATES["program"]),
        "university": _pick(low, _FIELD_CANDIDATES["university"]),
        "course_level": _pick(low, _FIELD_CANDIDATES["course_level"]),
        "course_name": _pick(low, _FIELD_CANDIDATES["course_name"]),
        "approved_intake": _to_int(_pick(low, _FIELD_CANDIDATES["approved_intake"])),
        "special_intake": _to_int(_pick(low, special_keys)),
        "raw_payload_id": raw_payload_id,
        "created_at": _now(),
    }


def _coerce_list(data) -> list:
    """AICTE PHP endpoints may return a bare array or wrap it under a key."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("data", "Data", "records", "rows", "result", "results", "aaData"):
            if isinstance(data.get(key), list):
                return data[key]
        # Single object → wrap
        return [data]
    return []


async def fetch_live(year: str, category: str, base: str = AICTE_BASE_URL) -> list:
    """Attempt a real fetch from the AICTE endpoint. Raises on any failure.

    If AICTE_PROXY_URL is set in the environment, the request is routed through that
    proxy. AICTE's servers reject foreign / datacenter IPs at the TLS layer, so an
    India-reachable proxy is required to fetch live data from outside India.
    """
    url = build_url(year, category, base)
    proxy = (os.environ.get("AICTE_PROXY_URL") or "").strip() or None
    client_kwargs = dict(timeout=25.0, verify=False, headers=_HTTP_HEADERS, follow_redirects=True)
    if proxy:
        client_kwargs["proxy"] = proxy
    async with httpx.AsyncClient(**client_kwargs) as client:
        r = await client.get(url)
        r.raise_for_status()
        try:
            data = r.json()
        except Exception:
            # Some dashboards return JSON with a text/html content-type
            import json as _json
            data = _json.loads(r.text)
        return _coerce_list(data)


async def probe(year: str = DEFAULT_YEAR, category: str = "NRI", base: str = AICTE_BASE_URL) -> dict:
    """Read-only live connectivity test (no DB writes). Tells you whether the
    AICTE endpoint is reachable from this server (optionally via AICTE_PROXY_URL)."""
    url = build_url(year, category, base)
    proxy = (os.environ.get("AICTE_PROXY_URL") or "").strip() or None
    try:
        records = await fetch_live(year, category, base)
        return {
            "reachable": True, "url": url, "via_proxy": bool(proxy),
            "record_count": len(records), "sample": records[:2],
        }
    except Exception as e:  # noqa: BLE001
        return {
            "reachable": False, "url": url, "via_proxy": bool(proxy),
            "error": f"{type(e).__name__}: {str(e)[:200]}",
            "hint": "AICTE blocks non-India / datacenter IPs at the TLS layer. Set AICTE_PROXY_URL to an India-reachable proxy to fetch live.",
        }


# ---------------- Simulated fallback (clearly labelled) ----------------
_SIM_POOL = [
    ("College of Engineering, Pune", "Maharashtra", "Pune", "Savitribai Phule Pune University", "Government"),
    ("PSG College of Technology", "Tamil Nadu", "Coimbatore", "Anna University", "Private-Aided"),
    ("Vellore Institute of Technology", "Tamil Nadu", "Vellore", "VIT (Deemed)", "Private-Self Financing"),
    ("Manipal Institute of Technology", "Karnataka", "Udupi", "MAHE (Deemed)", "Private-Self Financing"),
    ("Thapar Institute of Engineering & Technology", "Punjab", "Patiala", "Thapar (Deemed)", "Private-Self Financing"),
    ("SRM Institute of Science and Technology", "Tamil Nadu", "Kancheepuram", "SRM (Deemed)", "Private-Self Financing"),
    ("Birla Institute of Technology, Mesra", "Jharkhand", "Ranchi", "BIT Mesra (Deemed)", "Private-Self Financing"),
    ("College of Engineering, Anna University", "Tamil Nadu", "Chennai", "Anna University", "Government"),
    ("R.V. College of Engineering", "Karnataka", "Bengaluru Urban", "VTU", "Private-Self Financing"),
    ("Delhi Technological University", "Delhi", "New Delhi", "DTU", "Government"),
    ("Sardar Patel Institute of Technology", "Maharashtra", "Mumbai", "University of Mumbai", "Private-Aided"),
    ("Coimbatore Institute of Technology", "Tamil Nadu", "Coimbatore", "Anna University", "Government-Aided"),
]
_SIM_COURSES = [
    ("Computer Science and Engineering", "UG", "Engineering and Technology"),
    ("Electronics and Communication Engineering", "UG", "Engineering and Technology"),
    ("Mechanical Engineering", "UG", "Engineering and Technology"),
    ("Information Technology", "UG", "Engineering and Technology"),
    ("Master of Business Administration", "PG", "Management"),
    ("Master of Computer Applications", "PG", "Computer Applications"),
]


def simulated_payload(year: str, category: str) -> list:
    """Deterministic-ish simulated AICTE payload mirroring the real schema.
    Uses uppercase-style keys typical of AICTE dashboard endpoints."""
    rng = random.Random(f"{year}|{category}")
    pool = rng.sample(_SIM_POOL, k=rng.randint(7, min(10, len(_SIM_POOL))))
    records = []
    for idx, (name, state, district, univ, itype) in enumerate(pool, start=1):
        course, level, program = rng.choice(_SIM_COURSES)
        approved = rng.choice([60, 120, 180, 240])
        # Supernumerary special intake for the quota category (~15% of approved, capped).
        special = max(1, min(approved // 6, rng.randint(2, 18)))
        records.append({
            "COLID": f"1-{rng.randint(1000000000, 9999999999)}",
            "COLLEGENAME": name,
            "STATE": state,
            "DISTRICT": district,
            "INSTITUTIONTYPE": itype,
            "PROGRAM": program,
            "UNIVERSITY": univ,
            "COURSELEVEL": level,
            "COURSENAME": course,
            "APPROVEDINTAKE": approved,
            "SPECIALINTAKE": special,
            "CATEGORY": category,
            "ACADEMICYEAR": year,
        })
    return records


# ---------------- Endpoint seeding ----------------
async def seed_endpoints(db) -> None:
    """Seed aicte_api_sources with the default quota categories if empty (idempotent)."""
    if await db.aicte_api_sources.count_documents({}) > 0:
        return
    for endpoint_name, category in DEFAULT_CATEGORIES:
        await db.aicte_api_sources.insert_one({
            "id": str(uuid.uuid4()),
            "endpoint_name": endpoint_name,
            "endpoint_url": AICTE_BASE_URL,  # base; query built dynamically per sync
            "category": category,
            "active": True,
            "created_at": _now(),
        })
    logger.info("Seeded %d AICTE API endpoints", len(DEFAULT_CATEGORIES))


# ---------------- Sync orchestration ----------------
async def run_sync(db, run_id: str, year: str, run_type: str = "manual") -> None:
    """Execute a full AICTE sync for `year` across all active endpoints.

    Step 1 Fetch endpoints → Step 2 Store raw JSON → Step 3 Normalize →
    Step 4 Validate → Step 5 Store aicte_records → Step 6 Generate sync report.
    """
    logs: list = []
    errors: list = []
    total_norm = 0
    total_fetched = 0
    data_origin = "live"

    def log(msg: str):
        line = f"{_now()} | {msg}"
        logs.append(line)
        logger.info("[AICTE sync %s] %s", run_id, msg)

    await db.sync_runs.update_one(
        {"id": run_id},
        {"$set": {"status": "Running", "started_at": _now(), "logs": logs}},
    )

    try:
        await seed_endpoints(db)
        sources = await db.aicte_api_sources.find({"active": True}, {"_id": 0}).to_list(200)
        if not sources:
            raise RuntimeError("No active AICTE endpoints configured.")
        log(f"Step 1 — {len(sources)} active endpoint(s) for academic year {year}")

        for src in sources:
            category = src["category"]
            base = src.get("endpoint_url", AICTE_BASE_URL)
            log(f"Fetching '{src['endpoint_name']}' (category={category})")

            # Step 2 — fetch JSON (live first, simulated fallback)
            try:
                records = await fetch_live(year, category, base)
                origin = "live"
                log(f"  LIVE fetch OK — {len(records)} record(s)")
            except Exception as e:  # noqa: BLE001 — upstream geo/IP restricts our egress
                records = simulated_payload(year, category)
                origin = "simulated"
                data_origin = "simulated"
                log(f"  LIVE fetch failed ({type(e).__name__}: {str(e)[:120]}). Using SIMULATED payload — {len(records)} record(s)")

            total_fetched += len(records)

            # Step 2 (cont) — store raw payload exactly as received (immutable, versioned)
            payload_id = str(uuid.uuid4())
            await db.aicte_raw_payloads.insert_one({
                "id": payload_id,
                "api_source_id": src["id"],
                "academic_year": year,
                "payload_json": records,
                "record_count": len(records),
                "fetched_at": _now(),
                "data_origin": origin,
                "source_category": category,
            })
            log(f"  Stored raw payload {payload_id} ({origin}, {len(records)} records)")

            # Replace prior normalized records for this (year, category) so the
            # normalized table stays consistent; raw payloads remain as immutable history.
            removed = await db.aicte_records.delete_many({"academic_year": year, "source_category": category})
            if removed.deleted_count:
                log(f"  Replaced {removed.deleted_count} prior normalized record(s) for {category} {year}")

            # Step 3-5 — normalize, validate, store (batched for performance)
            norm = 0
            skipped = 0
            batch: list = []
            for raw in records:
                rec = normalize_record(raw, year, category, payload_id)
                # Step 4 — validation: a record must at least have an institution name
                if not rec.get("collegename"):
                    skipped += 1
                    continue
                batch.append(rec)
                if len(batch) >= 1000:
                    await db.aicte_records.insert_many(batch)
                    norm += len(batch)
                    batch = []
            if batch:
                await db.aicte_records.insert_many(batch)
                norm += len(batch)
            if skipped:
                errors.append(f"{category}: skipped {skipped} record(s) with no institution name")
            total_norm += norm
            log(f"  Normalized & stored {norm} record(s) for {category}")

        # Step 6 — sync report
        await db.sync_runs.update_one(
            {"id": run_id},
            {"$set": {
                "status": "Completed",
                "completed_at": _now(),
                "records_processed": total_norm,
                "records_fetched": total_fetched,
                "errors": errors,
                "logs": logs,
                "data_origin": data_origin,
            }},
        )
        await db.data_sources.update_one(
            {"source_type": "AICTE"},
            {"$set": {"last_sync": _now(), "status": "active", "updated_at": _now()}},
        )
        log(f"Sync complete — {total_norm} normalized record(s), {len(errors)} error(s), origin={data_origin}")
    except Exception as e:  # noqa: BLE001
        logger.exception("AICTE sync %s failed", run_id)
        errors.append(str(e))
        await db.sync_runs.update_one(
            {"id": run_id},
            {"$set": {
                "status": "Failed",
                "completed_at": _now(),
                "records_processed": total_norm,
                "errors": errors,
                "logs": logs + [f"{_now()} | FAILED: {e}"],
                "data_origin": data_origin,
            }},
        )
        await db.data_sources.update_one(
            {"source_type": "AICTE"},
            {"$set": {"status": "error", "updated_at": _now()}},
        )


async def renormalize(db, academic_year: str | None = None) -> dict:
    """Rebuild aicte_records from the LATEST stored raw payloads (no network call).

    Lets you re-apply normalization (e.g. after a field-mapping fix) to data that was
    already fetched. Raw payloads are immutable; only the normalized table is rebuilt.
    """
    query: dict = {}
    if academic_year:
        query["academic_year"] = academic_year
    payloads = await db.aicte_raw_payloads.find(query, {"_id": 0}).sort("fetched_at", 1).to_list(100000)
    # Keep the most recent payload per (year, category) — later entries overwrite earlier.
    latest: dict = {}
    for p in payloads:
        latest[(p["academic_year"], p.get("source_category"))] = p

    total = 0
    for (year, cat), p in latest.items():
        await db.aicte_records.delete_many({"academic_year": year, "source_category": cat})
        batch: list = []
        for raw in p.get("payload_json", []):
            rec = normalize_record(raw, year, cat, p["id"])
            if not rec.get("collegename"):
                continue
            batch.append(rec)
            if len(batch) >= 1000:
                await db.aicte_records.insert_many(batch)
                total += len(batch)
                batch = []
        if batch:
            await db.aicte_records.insert_many(batch)
            total += len(batch)
    logger.info("AICTE renormalize: rebuilt %d records across %d group(s)", total, len(latest))
    return {"renormalized": total, "groups": len(latest)}


async def overview(db) -> dict:
    """Stats powering the AICTE admin page."""
    endpoints = await db.aicte_api_sources.count_documents({})
    active_endpoints = await db.aicte_api_sources.count_documents({"active": True})
    records = await db.aicte_records.count_documents({})
    payloads = await db.aicte_raw_payloads.count_documents({})
    years = sorted(await db.aicte_records.distinct("academic_year"))
    categories = sorted(await db.aicte_records.distinct("source_category"))
    last_run = await db.sync_runs.find_one(
        {"source_type": "AICTE"}, {"_id": 0}, sort=[("created_at", -1)]
    )
    return {
        "endpoints": endpoints,
        "active_endpoints": active_endpoints,
        "records_imported": records,
        "raw_payloads": payloads,
        "academic_years": years,
        "categories": categories,
        "last_run": last_run,
    }
