"""
Data Sources Management Layer — source-independent acquisition platform.

Manages multiple external data sources (NIRF, AICTE, and future: NAAC / TNEA / AISHE)
through a connector registry. Adding a new source requires only:
  1. Source registration (a row in `data_sources`)
  2. Connector implementation (register in CONNECTORS below)
No platform refactoring, and ZERO changes to existing NIRF or AICTE code.

This layer never modifies NIRF data — the NIRF connector here is READ-ONLY: it reports
status/stats from the existing NIRF collections; NIRF acquisition stays in the NIRF module.

Collections owned here:
  - data_sources : registered sources
  - sync_runs    : every sync execution (status / history / logs / errors / version)
"""
import uuid
import logging
from datetime import datetime, timezone

import aicte_connector

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------- Source registration ----------------
DEFAULT_SOURCES = [
    {"source_name": "NIRF", "source_type": "NIRF", "connector_type": "scraper", "status": "active"},
    {"source_name": "AICTE", "source_type": "AICTE", "connector_type": "json_api", "status": "active"},
]


async def seed_sources(db) -> None:
    """Idempotently register the built-in sources."""
    for d in DEFAULT_SOURCES:
        existing = await db.data_sources.find_one({"source_type": d["source_type"]})
        if not existing:
            await db.data_sources.insert_one({
                "id": str(uuid.uuid4()),
                **d,
                "last_sync": None,
                "created_at": _now(),
                "updated_at": _now(),
            })
            logger.info("Registered data source: %s", d["source_type"])


# ---------------- Connector registry ----------------
# Each connector provides: stats(db, source) -> {records, years_available}
#                          sync(db, run_id, source, params) -> coroutine
async def _nirf_stats(db, source) -> dict:
    records = await db.nirf_extractions.count_documents({})
    years = sorted([y for y in await db.nirf_extractions.distinct("year") if isinstance(y, int)])
    return {"records": records, "years_available": [str(y) for y in years]}


async def _nirf_sync(db, run_id, source, params) -> None:
    """READ-ONLY status snapshot — never mutates any NIRF collection or workflow."""
    logs = []

    def log(msg):
        logs.append(f"{_now()} | {msg}")

    await db.sync_runs.update_one({"id": run_id}, {"$set": {"status": "Running", "started_at": _now()}})
    try:
        docs = await db.nirf_documents.count_documents({})
        ext = await db.nirf_extractions.count_documents({})
        years = sorted([y for y in await db.nirf_extractions.distinct("year") if isinstance(y, int)])
        log("NIRF status snapshot (READ-ONLY — NIRF pipeline is unchanged)")
        log(f"Documents: {docs} · Extractions: {ext} · Years: {years or '—'}")
        log("NIRF acquisition is managed in the NIRF module (/admin/nirf). "
            "This Data Sources sync only refreshes status & does not re-acquire data.")
        await db.sync_runs.update_one({"id": run_id}, {"$set": {
            "status": "Completed", "completed_at": _now(),
            "records_processed": ext, "errors": [], "logs": logs,
            "data_origin": "existing",
        }})
        await db.data_sources.update_one({"id": source["id"]},
                                         {"$set": {"last_sync": _now(), "status": "active", "updated_at": _now()}})
    except Exception as e:  # noqa: BLE001
        logger.exception("NIRF status snapshot failed")
        await db.sync_runs.update_one({"id": run_id}, {"$set": {
            "status": "Failed", "completed_at": _now(),
            "errors": [str(e)], "logs": logs + [f"{_now()} | FAILED: {e}"],
        }})


async def _aicte_stats(db, source) -> dict:
    records = await db.aicte_records.count_documents({})
    years = sorted(await db.aicte_records.distinct("academic_year"))
    return {"records": records, "years_available": [str(y) for y in years]}


async def _aicte_sync(db, run_id, source, params) -> None:
    year = (params or {}).get("academic_year") or aicte_connector.DEFAULT_YEAR
    run_type = (params or {}).get("run_type", "manual")
    await aicte_connector.run_sync(db, run_id, year, run_type)


CONNECTORS = {
    "NIRF": {"stats": _nirf_stats, "sync": _nirf_sync},
    "AICTE": {"stats": _aicte_stats, "sync": _aicte_sync},
    # Future: "NAAC": {...}, "TNEA": {...}, "AISHE": {...}
}


# ---------------- Public API used by server routes ----------------
async def list_sources(db) -> list:
    rows = await db.data_sources.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)
    out = []
    for s in rows:
        conn = CONNECTORS.get(s["source_type"])
        stats = await conn["stats"](db, s) if conn else {"records": 0, "years_available": []}
        last_run = await db.sync_runs.find_one(
            {"source_id": s["id"]}, {"_id": 0}, sort=[("created_at", -1)]
        )
        out.append({**s, **stats, "supported": conn is not None,
                    "last_run_status": last_run.get("status") if last_run else None})
    return out


async def get_source(db, source_id: str):
    return await db.data_sources.find_one({"id": source_id}, {"_id": 0})


async def create_run(db, source: dict, run_type: str = "manual", params: dict | None = None) -> str:
    run_id = str(uuid.uuid4())
    await db.sync_runs.insert_one({
        "id": run_id,
        "source_id": source["id"],
        "source_type": source["source_type"],
        "run_type": run_type,
        "params": params or {},
        "started_at": None,
        "completed_at": None,
        "status": "Queued",
        "records_processed": 0,
        "errors": [],
        "logs": [],
        "created_at": _now(),
    })
    return run_id


async def run_source_sync(db, source: dict, run_id: str, params: dict | None = None) -> None:
    conn = CONNECTORS.get(source["source_type"])
    if not conn:
        await db.sync_runs.update_one({"id": run_id}, {"$set": {
            "status": "Failed", "completed_at": _now(),
            "errors": [f"No connector registered for source type '{source['source_type']}'"],
        }})
        return
    await conn["sync"](db, run_id, source, params or {})


async def list_runs(db, source_id: str | None = None, limit: int = 50) -> list:
    query = {"source_id": source_id} if source_id else {}
    return await db.sync_runs.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)


async def get_run(db, run_id: str):
    return await db.sync_runs.find_one({"id": run_id}, {"_id": 0})


async def monitoring_summary(db) -> dict:
    """Source-independent monitoring snapshot across all sources."""
    sources = await db.data_sources.count_documents({})
    total_runs = await db.sync_runs.count_documents({})
    failed = await db.sync_runs.count_documents({"status": "Failed"})
    running = await db.sync_runs.count_documents({"status": {"$in": ["Queued", "Running"]}})
    recent = await db.sync_runs.find({}, {"_id": 0}).sort("created_at", -1).to_list(10)
    by_source = []
    async for s in db.data_sources.find({}, {"_id": 0}):
        runs = await db.sync_runs.count_documents({"source_id": s["id"]})
        last = await db.sync_runs.find_one({"source_id": s["id"]}, {"_id": 0}, sort=[("created_at", -1)])
        by_source.append({
            "source_name": s["source_name"],
            "source_type": s["source_type"],
            "status": s.get("status"),
            "runs": runs,
            "last_sync": s.get("last_sync"),
            "last_status": last.get("status") if last else None,
        })
    return {
        "sources": sources,
        "total_runs": total_runs,
        "failed_runs": failed,
        "active_runs": running,
        "recent_runs": recent,
        "by_source": by_source,
    }
