from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Any
import uuid
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, UserMessage


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB connection
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

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
        "You are a senior education research analyst writing for an institutional due-diligence "
        "platform. Your tone is the same as a credit-rating analyst at Morningstar or Bloomberg: "
        "neutral, evidence-based, never accusatory, never promotional. "
        "Rules: (1) Never call any institution fake, misleading, inflated, or a scam. "
        "(2) Always frame observations as comparative or relative, citing the specific metric. "
        "(3) Acknowledge that different metrics measure different student populations. "
        "(4) Each observation is a single crisp sentence, max 28 words. "
        "(5) Output ONLY a JSON array of 5 strings — no prose, no markdown, no keys."
    )

    user_prompt = (
        f"Compare the following institutions based strictly on their disclosed indicators. "
        f"Produce 5 investment-research-style observations as a JSON array of strings.\n\n"
        f"{snapshot}\n\n"
        f"{'Additional context: ' + req.context if req.context else ''}\n"
        f"Return ONLY a JSON array, e.g. [\"observation 1\", \"observation 2\", ...]"
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
