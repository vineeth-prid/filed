"""
Filed Support & Admissions Assistant.

A public, no-cost assistant powered by the self-hosted Ollama models on the user's
server (llama3.2:3b default, qwen3:8b optional via ASSISTANT_MODEL). It:
  - answers visitor queries about the Filed platform, colleges, comparisons, etc.
  - detects admission/help intent and invites the visitor to share contact details
  - captures those details as LEADS (managed in the admin panel)

Conversations are stored per session; leads are stored in `leads`. No third-party
LLM / API key — everything runs against the local Ollama daemon.
"""
from __future__ import annotations

import re
import uuid
import logging
from datetime import datetime, timezone

from config import settings
from ollama_client import chat_with_history, OllamaError

logger = logging.getLogger("filed.assistant")

MAX_HISTORY = 12  # messages of context sent to the model

SYSTEM_PROMPT = (
    "You are 'Filed Assistant', a warm, concise support agent for Filed — an education "
    "due-diligence platform that helps students and parents in India evaluate colleges using "
    "public data (NIRF, NAAC, AICTE, UGC): placements, fees, outcomes and accreditation.\n\n"
    "Your job:\n"
    "1. Help visitors with questions about the platform and about choosing/comparing colleges.\n"
    "2. Guide them to the right tools: Colleges (browse), Compare (up to 4), Match Me, and factsheets.\n"
    "3. If someone wants admission help, guidance, or to be contacted, encourage them to share their "
    "name, email/phone and what they're interested in — a Filed counsellor will reach out.\n\n"
    "Rules:\n"
    "- Be brief and friendly (2-5 sentences). Use simple language.\n"
    "- NEVER invent specific numbers, ranks, fees or cut-offs. If unsure, say so and point to the tools.\n"
    "- Stay on education/admissions/platform topics. Politely decline unrelated requests.\n"
    "- Do not give guarantees about admission or results."
)

# Keyword intent → surface the 'share details' lead form in the widget.
_LEAD_INTENT = re.compile(
    r"\b(admission|admissions|apply|application|enrol|enroll|enrolment|enrollment|"
    r"join|seat|counsel|councel|scholarship|fees? help|help me get|interested in|"
    r"want to (apply|join|study)|contact me|call me|reach out|guidance)\b",
    re.IGNORECASE,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip_think(text: str) -> str:
    """qwen3 emits <think>...</think> reasoning blocks — remove them for the UI."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S | re.I)
    return text.strip()


async def _get_conversation(db, session_id: str) -> dict:
    conv = await db.assistant_conversations.find_one({"id": session_id}, {"_id": 0})
    if not conv:
        conv = {"id": session_id, "messages": [], "lead_id": None,
                "created_at": _now(), "updated_at": _now()}
        await db.assistant_conversations.insert_one({**conv})
    return conv


async def reply(db, session_id: str, message: str) -> dict:
    """Generate an assistant reply for `message` within `session_id`. Persists both turns."""
    session_id = session_id or str(uuid.uuid4())
    message = (message or "").strip()
    if not message:
        return {"session_id": session_id, "reply": "Please type a question and I'll help.", "suggest_lead": False}

    conv = await _get_conversation(db, session_id)
    history = conv.get("messages", [])[-MAX_HISTORY:]

    suggest_lead = bool(_LEAD_INTENT.search(message))

    # Build the model context.
    msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in history:
        msgs.append({"role": m["role"], "content": m["content"]})
    msgs.append({"role": "user", "content": message})

    try:
        raw = await chat_with_history(msgs, model=settings.assistant_model, temperature=0.4, num_predict=500)
        answer = _strip_think(raw) or "Sorry, I couldn't generate a response just now. Could you rephrase?"
        ok = True
    except OllamaError as e:
        logger.warning("Assistant LLM unavailable: %s", e)
        answer = ("I'm having trouble reaching the assistant service right now. "
                  "You can still browse Colleges and Compare, or share your details below and our team will help you.")
        ok = False
        suggest_lead = True

    now = _now()
    await db.assistant_conversations.update_one(
        {"id": session_id},
        {"$push": {"messages": {"$each": [
            {"role": "user", "content": message, "ts": now},
            {"role": "assistant", "content": answer, "ts": now},
        ]}}, "$set": {"updated_at": now}},
    )
    return {"session_id": session_id, "reply": answer, "suggest_lead": suggest_lead, "llm_ok": ok}


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


async def submit_lead(db, payload: dict) -> dict:
    """Store an admission/contact lead from the assistant widget."""
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip()
    phone = (payload.get("phone") or "").strip()
    if not name:
        return {"ok": False, "error": "Name is required."}
    if not email and not phone:
        return {"ok": False, "error": "Please provide an email or phone number."}
    if email and not _EMAIL_RE.match(email):
        return {"ok": False, "error": "Please enter a valid email address."}

    session_id = payload.get("session_id")
    lead = {
        "id": str(uuid.uuid4()),
        "name": name,
        "email": email or None,
        "phone": phone or None,
        "interest": (payload.get("interest") or "").strip() or None,
        "location": (payload.get("location") or "").strip() or None,
        "message": (payload.get("message") or "").strip() or None,
        "source": "assistant",
        "session_id": session_id,
        "status": "new",
        "notes": None,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.leads.insert_one({**lead})
    if session_id:
        await db.assistant_conversations.update_one(
            {"id": session_id}, {"$set": {"lead_id": lead["id"], "updated_at": _now()}}
        )
    lead.pop("_id", None)
    logger.info("Captured lead %s (%s)", lead["id"], name)
    return {"ok": True, "lead_id": lead["id"]}


# ----------------------------- Admin management -----------------------------
LEAD_STATUSES = ["new", "contacted", "qualified", "converted", "closed"]


async def list_leads(db, status: str | None = None, q: str | None = None,
                     limit: int = 100, offset: int = 0) -> dict:
    query: dict = {}
    if status:
        query["status"] = status
    if q:
        query["$or"] = [
            {"name": {"$regex": re.escape(q), "$options": "i"}},
            {"email": {"$regex": re.escape(q), "$options": "i"}},
            {"phone": {"$regex": re.escape(q), "$options": "i"}},
            {"interest": {"$regex": re.escape(q), "$options": "i"}},
        ]
    total = await db.leads.count_documents(query)
    rows = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).skip(offset).to_list(limit)
    return {"leads": rows, "total": total}


async def lead_detail(db, lead_id: str) -> dict | None:
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        return None
    conv = None
    if lead.get("session_id"):
        conv = await db.assistant_conversations.find_one({"id": lead["session_id"]}, {"_id": 0})
    return {"lead": lead, "conversation": conv}


async def update_lead(db, lead_id: str, status: str | None, notes: str | None) -> dict | None:
    patch: dict = {"updated_at": _now()}
    if status:
        if status not in LEAD_STATUSES:
            return {"error": f"Invalid status. Use one of {LEAD_STATUSES}"}
        patch["status"] = status
    if notes is not None:
        patch["notes"] = notes
    res = await db.leads.update_one({"id": lead_id}, {"$set": patch})
    if res.matched_count == 0:
        return None
    return await db.leads.find_one({"id": lead_id}, {"_id": 0})


async def lead_stats(db) -> dict:
    total = await db.leads.count_documents({})
    by_status = {}
    for s in LEAD_STATUSES:
        by_status[s] = await db.leads.count_documents({"status": s})
    return {"total": total, "by_status": by_status, "statuses": LEAD_STATUSES}
