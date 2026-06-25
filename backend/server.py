from fastapi import FastAPI, APIRouter, HTTPException, Request, Query
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
import logging
import re
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uuid
from datetime import datetime, timezone

from config import settings
from rate_limit import limiter, client_ip
from ollama_client import chat as ollama_chat, health_check as ollama_health, OllamaError, parse_json_array
from security import (
    SecurityHeadersMiddleware,
    RequestSizeLimitMiddleware,
    TimeoutMiddleware,
    BotShieldMiddleware,
    AntiScrapingMiddleware,
    HoneypotMiddleware,
)

from nirf_service import run_sync, retry_document, CATEGORY_SLUG
from nirf_extractor import (
    run_extraction, extract_single, apply_correction,
    FIELD_KEYS, FIELD_GROUPS, _confidence_band,
)
from nirf_normalizer import (
    run_normalization, normalize_document, compute_derived_metrics, metric_catalog,
)
from intelligence_engine import (
    run_intelligence, compute_one, set_fees, score_catalog,
)
from annual_refresh import (
    run_annual_refresh, build_change_tracking, get_trends,
    _years_with_data, TRACKED_METRICS,
)
from auth import (
    create_access_token, decode_token, is_admin_token, bearer_from_header,
    seed_admin, authenticate, is_login_locked,
)
import data_sources_service as ds
import aicte_connector


# MongoDB connection
client = AsyncIOMotorClient(settings.mongo_url)
db = client[settings.db_name]

# Bound every paginated query so a client cannot request the whole collection.
MAX_PAGE_SIZE = 500

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Keep strong references to fire-and-forget background tasks so they are not GC'd.
_background_tasks: set = set()


def _spawn(coro):
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return task

app = FastAPI(
    title="Filed — Education Due Diligence API",
    # Disable auto-generated Swagger/OpenAPI docs in production to avoid
    # exposing the full API schema to attackers.
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)
api_router = APIRouter(prefix="/api")


# ---------- Models ----------
class InsightRequest(BaseModel):
    colleges: List[Dict[str, Any]]
    context: str | None = None


class InsightResponse(BaseModel):
    insights: List[str]


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"product": "Filed", "tagline": "Before investing in a college, review the facts."}


# ---------- Admin Authentication ----------
class LoginRequest(BaseModel):
    email: str
    password: str


@api_router.post("/auth/login")
async def auth_login(req: LoginRequest, request: Request):
    ip = client_ip(request)
    if is_login_locked(ip, req.email):
        raise HTTPException(
            status_code=429,
            detail="Too many failed attempts. Please wait 15 minutes before trying again.",
        )
    user = await authenticate(db, req.email, req.password, ip=ip)
    if not user:
        # Generic message — never reveal which of email/password was wrong.
        raise HTTPException(401, "Invalid credentials")
    token = create_access_token(user["email"], user["role"])
    return {"access_token": token, "token_type": "bearer", "user": user}


@api_router.get("/auth/me")
async def auth_me(request: Request):
    token = bearer_from_header(request.headers.get("Authorization", ""))
    payload = decode_token(token) if token else None
    if not payload:
        raise HTTPException(401, "Not authenticated")
    return {"email": payload["sub"], "role": payload.get("role", "admin")}


@api_router.post("/auth/logout")
async def auth_logout():
    # Stateless JWT — the client discards the token. Endpoint provided for symmetry.
    return {"ok": True}


@api_router.get("/admin/llm/health")
async def llm_health():
    """Check that the local Ollama daemon is reachable and the model is loaded."""
    return await ollama_health()


def _clip(value: Any) -> Any:
    """Truncate attacker-controlled strings before they reach the LLM prompt."""
    if isinstance(value, str):
        return value[: settings.insights_max_field_len]
    return value


@api_router.post("/insights", response_model=InsightResponse)
async def generate_insights(req: InsightRequest, request: Request):
    # Rate limit this expensive endpoint per client IP (LLM cost-abuse guard).
    if not limiter.check(
        f"insights:{client_ip(request)}",
        settings.insights_rate_limit_requests,
        settings.insights_rate_limit_window_seconds,
    ):
        raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")

    if not req.colleges:
        raise HTTPException(status_code=400, detail="No colleges provided")
    if len(req.colleges) > settings.insights_max_colleges:
        raise HTTPException(
            status_code=400,
            detail=f"Too many colleges (max {settings.insights_max_colleges}).",
        )
    # Sanitize untrusted input: keep only known keys, clip string lengths.
    req.colleges = [{k: _clip(v) for k, v in c.items()} for c in req.colleges]
    if req.context:
        req.context = _clip(req.context)

    # Build compact data snapshot for LLM
    snapshot_lines = []
    for c in req.colleges:
        snapshot_lines.append(
            f"- {c.get('short') or c.get('name')}: "
            f"Outcome Score {c.get('outcomeScore')}, ROI {c.get('roiRating')}, "
            f"Median Salary ₹{c.get('medianSalary'):,}, "
            f"Placement {c.get('placementRate')}%, Higher Studies {c.get('higherStudies')}%, "
            f"Transparency {c.get('transparency')}, "
            f"Est. Cost ₹{c.get('cost'):,}, Faculty Ratio {c.get('facultyRatio')}, "
            f"Type {c.get('type')}"
        )
    snapshot = "\n".join(snapshot_lines)

    system = (
        "You are an analyst at Filed, an education due-diligence platform that helps Indian families "
        "make better college decisions. Your readers are parents and 17-year-old students — not financial "
        "professionals. Tone: warm, plain-English, conversational, but always backed by the numbers. "
        "Rules: "
        "(1) Never call any college fake, misleading, inflated, or a scam. "
        "(2) Use everyday phrasing: 'students who got jobs' instead of 'placement rate', "
        "'typical salary' instead of 'median CTC', 'what families spend' instead of 'cost of attendance', "
        "'further studies' instead of 'higher studies cohort'. "
        "(3) Each observation is one crisp, conversational sentence (max 24 words) that highlights "
        "something a parent would care about: jobs, salary, cost, value-for-money, further studies, openness. "
        "(4) Where helpful, use concrete comparisons like '40% less' or 'roughly 2x'. "
        "(5) Output ONLY a JSON array of exactly 5 strings — no prose, no markdown, no keys."
    )

    user_prompt = (
        f"Help a family understand how the colleges below compare. Use the disclosed numbers. "
        f"Produce exactly 5 plain-English observations as a JSON array of strings.\n\n"
        f"{snapshot}\n\n"
        f"{'Context the family mentioned: ' + req.context if req.context else ''}\n"
        f"Return ONLY a JSON array of 5 strings."
    )

    try:
        raw = await ollama_chat(system, user_prompt)
        insights = parse_json_array(raw)
        return InsightResponse(insights=insights[:5])
    except OllamaError as e:
        logger.error("Insight generation failed (Ollama): %s", e)
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error("Insight generation failed: %s", e)
        raise HTTPException(status_code=500, detail="Insight generation failed.")


# ----------------- NIRF Data Acquisition -----------------
class SyncRequest(BaseModel):
    year: int = 2024
    category: str = "Engineering"
    limit: int = 25


@api_router.get("/admin/nirf/categories")
async def list_categories():
    return {"categories": list(CATEGORY_SLUG.keys())}


@api_router.get("/admin/nirf/overview")
async def admin_overview(year: int = 2024, category: str = "Engineering"):
    """Aggregate counts powering the Admin Panel hub dashboard."""
    docs_total = await db.nirf_documents.count_documents({"year": year, "category": category})
    docs_downloaded = await db.nirf_documents.count_documents({"year": year, "category": category, "status": "Downloaded"})
    extractions = await db.nirf_extractions.count_documents({"year": year, "category": category})
    derived = await db.nirf_derived_metrics.count_documents({"year": year, "category": category})
    scores = await db.nirf_intelligence_scores.count_documents({"year": year, "category": category})
    years = sorted([y for y in await db.nirf_extractions.distinct("year", {"category": category}) if isinstance(y, int)])
    last_refresh = await db.nirf_refresh_jobs.find_one({}, {"_id": 0}, sort=[("created_at", -1)])
    return {
        "year": year, "category": category,
        "institutions": docs_total,
        "downloaded": docs_downloaded,
        "extractions": extractions,
        "derived_metrics": derived,
        "intelligence_scores": scores,
        "years_tracked": years,
        "last_refresh": {
            "year": last_refresh.get("year"), "status": last_refresh.get("status"),
            "data_origin": last_refresh.get("data_origin"), "created_at": last_refresh.get("created_at"),
        } if last_refresh else None,
    }


@api_router.post("/admin/nirf/sync")
async def trigger_sync(req: SyncRequest):
    if req.category not in CATEGORY_SLUG:
        raise HTTPException(400, f"Unsupported category. Choose one of: {list(CATEGORY_SLUG.keys())}")
    job_id = str(uuid.uuid4())
    job = {
        "id": job_id,
        "year": req.year,
        "category": req.category,
        "limit": req.limit,
        "status": "Queued",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "stats": {"total": 0, "downloaded": 0, "failed": 0},
        "logs": [],
    }
    await db.nirf_jobs.insert_one({**job})
    _spawn(run_sync(db, job_id, req.year, req.category, req.limit))
    return {"job_id": job_id, "status": "Queued"}


@api_router.get("/admin/nirf/jobs")
async def list_jobs(limit: int = Query(20, ge=1, le=MAX_PAGE_SIZE)):
    rows = await db.nirf_jobs.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return rows


@api_router.get("/admin/nirf/jobs/{job_id}")
async def get_job(job_id: str):
    job = await db.nirf_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@api_router.get("/admin/nirf/institutions")
async def list_institutions(year: Optional[int] = None, category: Optional[str] = None, q: Optional[str] = None,
                            limit: int = Query(200, ge=1, le=MAX_PAGE_SIZE), offset: int = Query(0, ge=0)):
    query: dict = {}
    if year:
        query["year"] = year
    if category:
        query["category"] = category
    if q:
        query["college_name"] = {"$regex": re.escape(q), "$options": "i"}
    rows = await db.nirf_institutions.find(query, {"_id": 0}).sort("rank", 1).skip(offset).to_list(limit)
    return rows


@api_router.get("/admin/nirf/documents")
async def list_documents(status: Optional[str] = None, year: Optional[int] = None, category: Optional[str] = None,
                         limit: int = Query(500, ge=1, le=MAX_PAGE_SIZE), offset: int = Query(0, ge=0)):
    query: dict = {}
    if status:
        query["status"] = status
    if year:
        query["year"] = year
    if category:
        query["category"] = category
    rows = await db.nirf_documents.find(query, {"_id": 0}).sort("updated_at", -1).skip(offset).to_list(limit)

    counts = {"Pending": 0, "Downloaded": 0, "Failed": 0}
    pipeline_query: dict = {}
    if year:
        pipeline_query["year"] = year
    if category:
        pipeline_query["category"] = category
    async for r in db.nirf_documents.aggregate([
        {"$match": pipeline_query},
        {"$group": {"_id": "$status", "n": {"$sum": 1}}},
    ]):
        counts[r["_id"]] = r["n"]
    return {"documents": rows, "counts": counts}


@api_router.post("/admin/nirf/documents/{document_id}/retry")
async def retry_doc(document_id: str):
    updated = await retry_document(db, document_id)
    if not updated:
        raise HTTPException(404, "Document not found")
    updated.pop("_id", None)
    return updated


# ----------------- PDF Extraction Engine -----------------
class ExtractRequest(BaseModel):
    year: int = 2024
    category: str = "Engineering"


class CorrectionRequest(BaseModel):
    field: str
    value: Any = None


@api_router.get("/admin/nirf/extract/schema")
async def extract_schema():
    """Field schema that drives the admin review screen."""
    return {"fields": FIELD_KEYS, "groups": FIELD_GROUPS}


@api_router.post("/admin/nirf/extract")
async def trigger_extraction(req: ExtractRequest):
    if req.category not in CATEGORY_SLUG:
        raise HTTPException(400, f"Unsupported category. Choose one of: {list(CATEGORY_SLUG.keys())}")
    job_id = str(uuid.uuid4())
    job = {
        "id": job_id,
        "year": req.year,
        "category": req.category,
        "status": "Queued",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "stats": {"total": 0, "extracted": 0, "failed": 0},
        "logs": [],
    }
    await db.nirf_extract_jobs.insert_one({**job})
    _spawn(run_extraction(db, job_id, req.year, req.category))
    return {"job_id": job_id, "status": "Queued"}


@api_router.get("/admin/nirf/extract/jobs/{job_id}")
async def get_extract_job(job_id: str):
    job = await db.nirf_extract_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Extraction job not found")
    return job


@api_router.get("/admin/nirf/extractions")
async def list_extractions(year: Optional[int] = None, category: Optional[str] = None,
                           limit: int = Query(500, ge=1, le=MAX_PAGE_SIZE), offset: int = Query(0, ge=0)):
    query: dict = {}
    if year:
        query["year"] = year
    if category:
        query["category"] = category
    rows = await db.nirf_extractions.find(query, {"_id": 0}).sort("overall_confidence", 1).skip(offset).to_list(limit)
    summary = {"total": len(rows), "High": 0, "Medium": 0, "Low": 0, "Reviewed": 0}
    for r in rows:
        summary[_confidence_band(r.get("overall_confidence", 0))] += 1
        if r.get("status") == "Reviewed":
            summary["Reviewed"] += 1
        r["confidence_band"] = _confidence_band(r.get("overall_confidence", 0))
    return {"extractions": rows, "summary": summary}


@api_router.get("/admin/nirf/extractions/{extraction_id}")
async def get_extraction(extraction_id: str):
    rec = await db.nirf_extractions.find_one({"id": extraction_id}, {"_id": 0})
    if not rec:
        rec = await db.nirf_extractions.find_one({"document_id": extraction_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Extraction not found")
    rec["confidence_band"] = _confidence_band(rec.get("overall_confidence", 0))
    return rec


@api_router.post("/admin/nirf/documents/{document_id}/extract")
async def extract_one_doc(document_id: str):
    rec = await extract_single(db, document_id)
    if not rec:
        raise HTTPException(404, "Document not found")
    rec.pop("_id", None)
    return rec


@api_router.patch("/admin/nirf/extractions/{extraction_id}/field")
async def correct_field(extraction_id: str, req: CorrectionRequest):
    result = await apply_correction(db, extraction_id, req.field, req.value)
    if result is None:
        raise HTTPException(404, "Extraction not found")
    if result.get("error"):
        raise HTTPException(400, result["error"])
    result.pop("_id", None)
    return result
# ----------------- /NIRF -----------------


# ----------------- Data Normalization Service -----------------
class NormalizeRequest(BaseModel):
    year: int = 2024
    category: str = "Engineering"


@api_router.get("/admin/nirf/metrics/catalog")
async def metrics_catalog():
    """The derived-metric definitions (label, group, formula) that power the UI."""
    return {"metrics": metric_catalog()}


@api_router.post("/admin/nirf/normalize")
async def trigger_normalization(req: NormalizeRequest):
    if req.category not in CATEGORY_SLUG:
        raise HTTPException(400, f"Unsupported category. Choose one of: {list(CATEGORY_SLUG.keys())}")
    job_id = str(uuid.uuid4())
    job = {
        "id": job_id,
        "year": req.year,
        "category": req.category,
        "status": "Queued",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "stats": {"total": 0, "normalized": 0},
        "logs": [],
    }
    await db.nirf_normalize_jobs.insert_one({**job})
    _spawn(run_normalization(db, job_id, req.year, req.category))
    return {"job_id": job_id, "status": "Queued"}


@api_router.get("/admin/nirf/normalize/jobs/{job_id}")
async def get_normalize_job(job_id: str):
    job = await db.nirf_normalize_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Normalization job not found")
    return job


@api_router.post("/admin/nirf/documents/{document_id}/normalize")
async def normalize_one_doc(document_id: str):
    result = await normalize_document(db, document_id)
    if not result:
        raise HTTPException(404, "Extraction for document not found — extract it first")
    return result


@api_router.get("/admin/nirf/derived-metrics")
async def list_derived_metrics(year: Optional[int] = None, category: Optional[str] = None,
                               limit: int = Query(500, ge=1, le=MAX_PAGE_SIZE), offset: int = Query(0, ge=0)):
    query: dict = {}
    if year:
        query["year"] = year
    if category:
        query["category"] = category
    rows = await db.nirf_derived_metrics.find(query, {"_id": 0}).sort("avg_confidence", -1).skip(offset).to_list(limit)
    return {"derived_metrics": rows, "count": len(rows)}


@api_router.get("/admin/nirf/derived-metrics/{document_id}")
async def get_derived_metrics(document_id: str):
    rec = await db.nirf_derived_metrics.find_one({"document_id": document_id}, {"_id": 0})
    if not rec:
        rec = await db.nirf_derived_metrics.find_one({"id": document_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Derived metrics not found")
    return rec


@api_router.get("/admin/nirf/raw-data/{document_id}")
async def get_raw_data_versions(document_id: str):
    """All immutable raw-data versions for a document (proves raw data is never overwritten)."""
    rows = await db.nirf_raw_data.find({"document_id": document_id}, {"_id": 0}).sort("version", 1).to_list(100)
    if not rows:
        raise HTTPException(404, "No raw data captured for this document")
    return {"document_id": document_id, "versions": rows, "version_count": len(rows)}
# ----------------- /Normalization -----------------


# ----------------- College Intelligence Engine -----------------
class IntelligenceRequest(BaseModel):
    year: int = 2024
    category: str = "Engineering"


class FeesRequest(BaseModel):
    fees: int
    source: Optional[str] = "Admin-set fee"


@api_router.get("/admin/nirf/intelligence/catalog")
async def intelligence_catalog():
    """Score definitions + inputs + method (drives the UI explainability)."""
    return {"scores": score_catalog()}


@api_router.post("/admin/nirf/intelligence")
async def trigger_intelligence(req: IntelligenceRequest):
    if req.category not in CATEGORY_SLUG:
        raise HTTPException(400, f"Unsupported category. Choose one of: {list(CATEGORY_SLUG.keys())}")
    job_id = str(uuid.uuid4())
    job = {
        "id": job_id, "year": req.year, "category": req.category, "status": "Queued",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "stats": {"total": 0, "scored": 0}, "logs": [],
    }
    await db.nirf_intelligence_jobs.insert_one({**job})
    _spawn(run_intelligence(db, job_id, req.year, req.category))
    return {"job_id": job_id, "status": "Queued"}


@api_router.get("/admin/nirf/intelligence/jobs/{job_id}")
async def get_intelligence_job(job_id: str):
    job = await db.nirf_intelligence_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Intelligence job not found")
    return job


@api_router.get("/admin/nirf/intelligence")
async def list_intelligence(year: Optional[int] = None, category: Optional[str] = None,
                            limit: int = Query(500, ge=1, le=MAX_PAGE_SIZE), offset: int = Query(0, ge=0)):
    query: dict = {}
    if year:
        query["year"] = year
    if category:
        query["category"] = category
    rows = await db.nirf_intelligence_scores.find(query, {"_id": 0}).sort("overall_index", -1).skip(offset).to_list(limit)
    return {"intelligence": rows, "count": len(rows)}


@api_router.get("/admin/nirf/intelligence/{document_id}")
async def get_intelligence(document_id: str):
    rec = await db.nirf_intelligence_scores.find_one({"document_id": document_id}, {"_id": 0})
    if not rec:
        rec = await db.nirf_intelligence_scores.find_one({"id": document_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Intelligence scores not found")
    return rec


@api_router.post("/admin/nirf/documents/{document_id}/intelligence")
async def compute_intelligence_one(document_id: str):
    rec = await compute_one(db, document_id)
    if not rec:
        raise HTTPException(404, "Derived metrics for document not found — normalize it first")
    return rec


@api_router.put("/admin/nirf/fees/{document_id}")
async def update_fees(document_id: str, req: FeesRequest):
    rec = await set_fees(db, document_id, req.fees, req.source or "Admin-set fee")
    if not rec:
        raise HTTPException(404, "Derived metrics for document not found — normalize it first")
    return rec
# ----------------- /Intelligence -----------------


# ----------------- Annual NIRF Refresh + Change Tracking -----------------
class RefreshRequest(BaseModel):
    year: int = 2026
    category: str = "Engineering"
    limit: int = 25
    simulate: bool = True


@api_router.post("/admin/nirf/refresh")
async def trigger_refresh(req: RefreshRequest):
    if req.category not in CATEGORY_SLUG:
        raise HTTPException(400, f"Unsupported category. Choose one of: {list(CATEGORY_SLUG.keys())}")
    job_id = str(uuid.uuid4())
    job = {
        "id": job_id, "year": req.year, "category": req.category, "status": "Queued",
        "created_at": datetime.now(timezone.utc).isoformat(), "stages": [], "logs": [],
    }
    await db.nirf_refresh_jobs.insert_one({**job})
    _spawn(run_annual_refresh(db, job_id, req.year, req.category, req.limit, req.simulate))
    return {"job_id": job_id, "status": "Queued"}


@api_router.get("/admin/nirf/refresh/jobs/{job_id}")
async def get_refresh_job(job_id: str):
    job = await db.nirf_refresh_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Refresh job not found")
    return job


@api_router.get("/admin/nirf/years")
async def list_years(category: str = "Engineering"):
    return {"category": category, "years": await _years_with_data(db, category)}


@api_router.get("/admin/nirf/changes")
async def list_changes(year: int, category: str = "Engineering", limit: int = Query(500, ge=1, le=MAX_PAGE_SIZE)):
    rows = await db.nirf_yoy_changes.find({"year": year, "category": category}, {"_id": 0}).to_list(limit)
    prev = rows[0]["previous_year"] if rows else None

    def avg(metric, key="pct_change"):
        vals = [r["changes"][metric][key] for r in rows if r["changes"][metric].get(key) is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    summary = {
        "year": year, "previous_year": prev, "institutions": len(rows),
        "avg_salary_pct": avg("median_salary"),
        "avg_placement_delta_pp": avg("placement_rate", "delta"),
        "avg_faculty_pct": avg("faculty_count"),
        "data_origin": rows[0]["data_origin"] if rows else "extracted",
    }
    return {"changes": rows, "summary": summary}


@api_router.get("/admin/nirf/trends")
async def trends(category: str = "Engineering", metric: str = "median_salary"):
    if metric not in TRACKED_METRICS:
        raise HTTPException(400, f"metric must be one of {TRACKED_METRICS}")
    return await get_trends(db, category, metric)
# ----------------- /Refresh -----------------


# ----------------- Public read-only product data -----------------
# Bridges the admin pipeline's computed output to the public site so the
# user-facing product can render REAL institutional data (intelligence scores
# + derived metrics) instead of only the static mock dataset.
def _derived_value(metrics: dict, key: str):
    m = (metrics or {}).get(key) or {}
    return m.get("value")


async def _public_college_view(score_doc: dict) -> dict:
    document_id = score_doc.get("document_id")
    dm = await db.nirf_derived_metrics.find_one({"document_id": document_id}, {"_id": 0}) or {}
    metrics = dm.get("metrics", {})
    inst = await db.nirf_institutions.find_one(
        {"institute_id": dm.get("institute_id") or score_doc.get("institute_id")},
        {"_id": 0},
    ) or {}
    scores = {s.get("key", s.get("label")): {"value": s.get("value"), "grade": s.get("grade")}
              for s in score_doc.get("scores", [])}
    return {
        "id": document_id,
        "name": score_doc.get("college_name") or dm.get("college_name"),
        "city": inst.get("city"),
        "state": inst.get("state"),
        "year": score_doc.get("year"),
        "category": score_doc.get("category"),
        "rank": inst.get("rank"),
        "overallIndex": score_doc.get("overall_index"),
        "overallGrade": score_doc.get("overall_grade"),
        "scores": scores,
        "placementRate": _derived_value(metrics, "placement_rate_overall"),
        "higherStudies": _derived_value(metrics, "higher_studies_rate_overall"),
        "facultyRatio": _derived_value(metrics, "faculty_ratio"),
        "fees": dm.get("fees"),
        "sources": [f"NIRF {score_doc.get('year')}"],
        "dataOrigin": "pipeline",
    }


@api_router.get("/colleges")
async def public_colleges(year: int = 2024, category: str = "Engineering",
                          limit: int = Query(100, ge=1, le=MAX_PAGE_SIZE), offset: int = Query(0, ge=0)):
    """Public, read-only list of institutions with computed intelligence scores."""
    rows = await db.nirf_intelligence_scores.find(
        {"year": year, "category": category}, {"_id": 0},
    ).sort("overall_index", -1).skip(offset).to_list(limit)
    colleges = [await _public_college_view(r) for r in rows]
    return {"colleges": colleges, "count": len(colleges)}


@api_router.get("/colleges/{document_id}")
async def public_college(document_id: str):
    score_doc = await db.nirf_intelligence_scores.find_one({"document_id": document_id}, {"_id": 0})
    if not score_doc:
        raise HTTPException(404, "College not found in computed dataset")
    return await _public_college_view(score_doc)
# ----------------- /Public -----------------


# ============================================================================
# Data Sources Management Layer (source-independent) + AICTE Connector
# Additive only — does not touch any existing NIRF route, collection or workflow.
# ============================================================================
class SourceSyncRequest(BaseModel):
    academic_year: Optional[str] = None
    run_type: str = "manual"


class AicteSyncRequest(BaseModel):
    academic_year: Optional[str] = None
    run_type: str = "manual"


class AicteEndpointRequest(BaseModel):
    endpoint_name: str
    category: str
    endpoint_url: Optional[str] = None
    active: bool = True


class AicteEndpointPatch(BaseModel):
    active: Optional[bool] = None
    endpoint_name: Optional[str] = None
    endpoint_url: Optional[str] = None


# ---------------- Data Sources ----------------
@api_router.get("/admin/sources")
async def admin_list_sources():
    return {"sources": await ds.list_sources(db)}


@api_router.get("/admin/sources/{source_id}")
async def admin_get_source(source_id: str):
    src = await ds.get_source(db, source_id)
    if not src:
        raise HTTPException(404, "Data source not found")
    conn = ds.CONNECTORS.get(src["source_type"])
    stats = await conn["stats"](db, src) if conn else {"records": 0, "years_available": []}
    return {**src, **stats}


@api_router.post("/admin/sources/{source_id}/sync")
async def admin_sync_source(source_id: str, req: SourceSyncRequest):
    src = await ds.get_source(db, source_id)
    if not src:
        raise HTTPException(404, "Data source not found")
    if src["source_type"] not in ds.CONNECTORS:
        raise HTTPException(400, f"No connector registered for '{src['source_type']}'")
    params = {"academic_year": req.academic_year, "run_type": req.run_type}
    run_id = await ds.create_run(db, src, run_type=req.run_type, params=params)
    _spawn(ds.run_source_sync(db, src, run_id, params))
    return {"run_id": run_id, "status": "Queued", "source_type": src["source_type"]}


@api_router.get("/admin/sources/{source_id}/runs")
async def admin_source_runs(source_id: str, limit: int = Query(50, ge=1, le=MAX_PAGE_SIZE)):
    return {"runs": await ds.list_runs(db, source_id=source_id, limit=limit)}


# ---------------- Sync Runs (common: history / logs / monitoring) ----------------
@api_router.get("/admin/sync-runs")
async def admin_sync_runs(limit: int = Query(50, ge=1, le=MAX_PAGE_SIZE)):
    return {"runs": await ds.list_runs(db, limit=limit)}


@api_router.get("/admin/sync-runs/{run_id}")
async def admin_sync_run(run_id: str):
    run = await ds.get_run(db, run_id)
    if not run:
        raise HTTPException(404, "Sync run not found")
    return run


@api_router.get("/admin/monitoring")
async def admin_monitoring():
    return await ds.monitoring_summary(db)


# ---------------- AICTE ----------------
@api_router.get("/admin/aicte/overview")
async def admin_aicte_overview():
    return await aicte_connector.overview(db)


@api_router.get("/admin/aicte/sources")
async def admin_aicte_sources():
    rows = await db.aicte_api_sources.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return {"endpoints": rows}


@api_router.post("/admin/aicte/sources")
async def admin_aicte_add_source(req: AicteEndpointRequest):
    row = {
        "id": str(uuid.uuid4()),
        "endpoint_name": req.endpoint_name,
        "endpoint_url": req.endpoint_url or aicte_connector.AICTE_BASE_URL,
        "category": req.category,
        "active": req.active,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.aicte_api_sources.insert_one({**row})
    return row


@api_router.patch("/admin/aicte/sources/{endpoint_id}")
async def admin_aicte_patch_source(endpoint_id: str, req: AicteEndpointPatch):
    patch = {k: v for k, v in req.dict().items() if v is not None}
    if not patch:
        raise HTTPException(400, "Nothing to update")
    res = await db.aicte_api_sources.update_one({"id": endpoint_id}, {"$set": patch})
    if res.matched_count == 0:
        raise HTTPException(404, "Endpoint not found")
    return await db.aicte_api_sources.find_one({"id": endpoint_id}, {"_id": 0})


@api_router.post("/admin/aicte/sync")
async def admin_aicte_sync(req: AicteSyncRequest):
    src = await db.data_sources.find_one({"source_type": "AICTE"}, {"_id": 0})
    if not src:
        await ds.seed_sources(db)
        src = await db.data_sources.find_one({"source_type": "AICTE"}, {"_id": 0})
    params = {"academic_year": req.academic_year or aicte_connector.DEFAULT_YEAR, "run_type": req.run_type}
    run_id = await ds.create_run(db, src, run_type=req.run_type, params=params)
    _spawn(ds.run_source_sync(db, src, run_id, params))
    return {"run_id": run_id, "status": "Queued", "academic_year": params["academic_year"]}


@api_router.get("/admin/aicte/records")
async def admin_aicte_records(academic_year: Optional[str] = None, category: Optional[str] = None,
                              q: Optional[str] = None, state: Optional[str] = None,
                              limit: int = Query(100, ge=1, le=MAX_PAGE_SIZE), offset: int = Query(0, ge=0)):
    query: dict = {}
    if academic_year:
        query["academic_year"] = academic_year
    if category:
        query["source_category"] = category
    if state:
        query["state"] = state
    if q:
        query["collegename"] = {"$regex": re.escape(q), "$options": "i"}
    total = await db.aicte_records.count_documents(query)
    rows = await db.aicte_records.find(query, {"_id": 0}).sort("collegename", 1).skip(offset).to_list(limit)
    return {"records": rows, "total": total}


@api_router.get("/admin/aicte/payloads")
async def admin_aicte_payloads(academic_year: Optional[str] = None,
                               limit: int = Query(50, ge=1, le=MAX_PAGE_SIZE)):
    query: dict = {}
    if academic_year:
        query["academic_year"] = academic_year
    # Exclude the heavy payload_json blob from the list view.
    rows = await db.aicte_raw_payloads.find(
        query, {"_id": 0, "payload_json": 0}
    ).sort("fetched_at", -1).to_list(limit)
    return {"payloads": rows}


@api_router.get("/admin/aicte/payloads/{payload_id}")
async def admin_aicte_payload(payload_id: str):
    row = await db.aicte_raw_payloads.find_one({"id": payload_id}, {"_id": 0})
    if not row:
        raise HTTPException(404, "Raw payload not found")
    return row


@api_router.get("/admin/aicte/years")
async def admin_aicte_years():
    years = sorted(await db.aicte_records.distinct("academic_year"))
    return {"years": years}


@api_router.get("/admin/aicte/test-connection")
async def admin_aicte_test_connection(academic_year: Optional[str] = None, category: str = "NRI"):
    """Live, read-only reachability probe of the AICTE endpoint (no data written)."""
    return await aicte_connector.probe(academic_year or aicte_connector.DEFAULT_YEAR, category)
# ----------------- /Data Sources + AICTE -----------------


app.include_router(api_router)


_CORS_ORIGINS = settings.effective_cors_origins()
_CORS_ALLOW_ALL = _CORS_ORIGINS == ["*"]


def _cors_headers(request: Request) -> dict:
    """Echo CORS headers onto early (pre-handler) responses like 401/429,
    so browser clients receive a usable error instead of an opaque CORS failure."""
    origin = request.headers.get("origin")
    if not origin:
        return {}
    if _CORS_ALLOW_ALL or origin in _CORS_ORIGINS:
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",
        }
    return {}


# Coarse global per-IP rate limit, then admin JWT (with role check) on /api/admin/*.
@app.middleware("http")
async def gate_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and request.method != "OPTIONS":
        if not limiter.check(
            f"global:{client_ip(request)}",
            settings.rate_limit_requests,
            settings.rate_limit_window_seconds,
        ):
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down."},
                headers=_cors_headers(request),
            )

    if path.startswith("/api/admin") and request.method != "OPTIONS":
        token = bearer_from_header(request.headers.get("Authorization", ""))
        if not token or not is_admin_token(token):
            return JSONResponse(
                status_code=401,
                content={"detail": "Admin authentication required"},
                headers=_cors_headers(request),
            )
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    # Starlette ≥0.30 forbids allow_origins=["*"] + allow_credentials=True.
    allow_origins=[] if _CORS_ALLOW_ALL else _CORS_ORIGINS,
    allow_origin_regex=r".*" if _CORS_ALLOW_ALL else None,
    allow_credentials=not _CORS_ALLOW_ALL,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security middleware — registered last so they execute FIRST (Starlette LIFO).
# Order (outermost → innermost): Honeypot → BotShield → AntiScraping →
#   Timeout → RequestSizeLimit → SecurityHeaders → CORS → gate_middleware → routes
app.add_middleware(SecurityHeadersMiddleware, is_production=settings.is_production)
app.add_middleware(RequestSizeLimitMiddleware, max_bytes=settings.max_request_body_bytes)
app.add_middleware(TimeoutMiddleware, timeout_seconds=settings.request_timeout_seconds)
app.add_middleware(BotShieldMiddleware)
app.add_middleware(AntiScrapingMiddleware)
app.add_middleware(HoneypotMiddleware)


JOB_COLLECTIONS = [
    "nirf_jobs", "nirf_extract_jobs", "nirf_normalize_jobs",
    "nirf_intelligence_jobs", "nirf_refresh_jobs", "sync_runs",
]


async def _reconcile_orphaned_jobs():
    """Background jobs run in-process and do not survive a restart. Any job left
    'Queued'/'Running' after a crash/redeploy is stuck forever — mark it Interrupted."""
    total = 0
    for coll in JOB_COLLECTIONS:
        res = await db[coll].update_many(
            {"status": {"$in": ["Queued", "Running"]}},
            {"$set": {
                "status": "Interrupted",
                "error": "Server restarted while job was in progress.",
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        total += res.modified_count
    if total:
        logger.info(f"Reconciled {total} orphaned job(s) to Interrupted")


async def _ensure_indexes():
    """Indexes backing the common (year, category, status) filters + sorts."""
    await db.nirf_institutions.create_index([("year", 1), ("category", 1), ("rank", 1)])
    await db.nirf_institutions.create_index([("institute_id", 1), ("year", 1), ("category", 1)], unique=True)
    await db.nirf_documents.create_index([("year", 1), ("category", 1), ("status", 1)])
    await db.nirf_documents.create_index([("id", 1)])
    await db.nirf_extractions.create_index([("year", 1), ("category", 1), ("overall_confidence", 1)])
    await db.nirf_extractions.create_index([("document_id", 1)])
    await db.nirf_derived_metrics.create_index([("year", 1), ("category", 1)])
    await db.nirf_derived_metrics.create_index([("document_id", 1)])
    await db.nirf_intelligence_scores.create_index([("year", 1), ("category", 1), ("overall_index", -1)])
    await db.nirf_raw_data.create_index([("document_id", 1), ("version", 1)])
    await db.nirf_yoy_changes.create_index([("year", 1), ("category", 1)])
    # Uniqueness is enforced on the deterministic blind index, not the encrypted
    # email (Fernet ciphertext is random, so a unique index on it is meaningless).
    # sparse=True so any legacy row without the field does not break index creation.
    await db.users.create_index([("email_bidx", 1)], unique=True, sparse=True)
    # Data Sources Management Layer + AICTE connector indexes (additive).
    await db.data_sources.create_index([("source_type", 1)], unique=True)
    await db.sync_runs.create_index([("source_id", 1), ("created_at", -1)])
    await db.sync_runs.create_index([("source_type", 1), ("created_at", -1)])
    await db.aicte_api_sources.create_index([("category", 1)])
    await db.aicte_raw_payloads.create_index([("academic_year", 1), ("fetched_at", -1)])
    await db.aicte_records.create_index([("academic_year", 1), ("source_category", 1)])
    await db.aicte_records.create_index([("collegename", 1)])
    for coll in JOB_COLLECTIONS:
        await db[coll].create_index([("created_at", -1)])
        await db[coll].create_index([("id", 1)])


@app.on_event("startup")
async def on_startup():
    await seed_admin(db)
    await ds.seed_sources(db)
    await aicte_connector.seed_endpoints(db)
    await _ensure_indexes()
    await _reconcile_orphaned_jobs()
    llm_status = await ollama_health()
    if llm_status["ok"] and llm_status.get("model_ready"):
        logger.info("Ollama ready — model: %s", settings.ollama_model)
    else:
        logger.warning(
            "Ollama not ready at startup: %s. "
            "Run: ollama pull %s",
            llm_status.get("error", "model not found"),
            settings.ollama_model,
        )
    logger.info("Startup complete: admin verified, indexes ensured, orphan jobs reconciled")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
