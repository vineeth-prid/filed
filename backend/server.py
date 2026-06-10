from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Any, Optional
import uuid
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, UserMessage

from nirf_service import run_sync, retry_document, CATEGORY_SLUG
from nirf_extractor import (
    run_extraction, extract_single, apply_correction,
    FIELD_KEYS, FIELD_GROUPS, _confidence_band,
)


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB connection
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Keep strong references to fire-and-forget background tasks so they are not GC'd.
_background_tasks: set = set()


def _spawn(coro):
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return task

app = FastAPI(title="Filed — Education Due Diligence API")
api_router = APIRouter(prefix="/api")


# ---------- Models ----------
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


class InsightRequest(BaseModel):
    colleges: List[Dict[str, Any]]
    context: str | None = None


class InsightResponse(BaseModel):
    insights: List[str]


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"product": "Filed", "tagline": "Before investing in a college, review the facts."}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(payload: StatusCheckCreate):
    status_obj = StatusCheck(**payload.model_dump())
    doc = status_obj.model_dump()
    doc["timestamp"] = doc["timestamp"].isoformat()
    await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    rows = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for r in rows:
        if isinstance(r.get("timestamp"), str):
            r["timestamp"] = datetime.fromisoformat(r["timestamp"])
    return rows


@api_router.post("/insights", response_model=InsightResponse)
async def generate_insights(req: InsightRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")
    if not req.colleges:
        raise HTTPException(status_code=400, detail="No colleges provided")

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

    session_id = f"insights-{uuid.uuid4()}"
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=system,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        raw = await chat.send_message(UserMessage(text=user_prompt))
        text = raw if isinstance(raw, str) else str(raw)

        # Extract JSON array
        import json
        import re
        match = re.search(r"\[.*\]", text, re.S)
        if match:
            insights = json.loads(match.group(0))
            insights = [str(s).strip() for s in insights if str(s).strip()]
        else:
            # Fallback: split lines
            insights = [ln.strip("-• \t") for ln in text.splitlines() if ln.strip()][:5]
        return InsightResponse(insights=insights[:5])
    except Exception as e:
        logger.error(f"Insight generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Insight generation failed: {str(e)}")


# ----------------- NIRF Data Acquisition -----------------
class SyncRequest(BaseModel):
    year: int = 2024
    category: str = "Engineering"
    limit: int = 25


@api_router.get("/admin/nirf/categories")
async def list_categories():
    return {"categories": list(CATEGORY_SLUG.keys())}


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
async def list_jobs(limit: int = 20):
    rows = await db.nirf_jobs.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return rows


@api_router.get("/admin/nirf/jobs/{job_id}")
async def get_job(job_id: str):
    job = await db.nirf_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@api_router.get("/admin/nirf/institutions")
async def list_institutions(year: Optional[int] = None, category: Optional[str] = None, q: Optional[str] = None, limit: int = 200):
    query: dict = {}
    if year:
        query["year"] = year
    if category:
        query["category"] = category
    if q:
        query["college_name"] = {"$regex": q, "$options": "i"}
    rows = await db.nirf_institutions.find(query, {"_id": 0}).sort("rank", 1).to_list(limit)
    return rows


@api_router.get("/admin/nirf/documents")
async def list_documents(status: Optional[str] = None, year: Optional[int] = None, category: Optional[str] = None, limit: int = 500):
    query: dict = {}
    if status:
        query["status"] = status
    if year:
        query["year"] = year
    if category:
        query["category"] = category
    rows = await db.nirf_documents.find(query, {"_id": 0}).sort("updated_at", -1).to_list(limit)

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
async def list_extractions(year: Optional[int] = None, category: Optional[str] = None, limit: int = 500):
    query: dict = {}
    if year:
        query["year"] = year
    if category:
        query["category"] = category
    rows = await db.nirf_extractions.find(query, {"_id": 0}).sort("overall_confidence", 1).to_list(limit)
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


app.include_router(api_router)


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
