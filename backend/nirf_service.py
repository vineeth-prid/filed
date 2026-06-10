"""
NIRF Data Acquisition Service.

Modules: Ranking Scraper, PDF URL Generator, PDF Downloader, Scheduler, Logs.

Storage layout: /app/backend/storage/nirf/{year}/{category}/{institute_id}.pdf
Collections: nirf_institutions, nirf_documents, nirf_jobs.
"""
from __future__ import annotations

import asyncio
import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger("nirf")

STORAGE_ROOT = Path(__file__).parent / "storage" / "nirf"
STORAGE_ROOT.mkdir(parents=True, exist_ok=True)

# Category → URL slug used by NIRF for both ranking page and PDF folder
CATEGORY_SLUG = {
    "Engineering": "Engineering",
    "Management": "Management",
    "Pharmacy": "Pharmacy",
    "Medical": "Medical",
    "Law": "Law",
    "Architecture": "Architecture",
    "College": "College",
    "University": "University",
    "Overall": "Overall",
}

# Ranking page file names used by NIRF (best-effort — fallback to fixture if missing).
RANKING_PAGE = {
    "Engineering": "EngineeringRanking.html",
    "Management": "ManagementRanking.html",
    "Pharmacy": "PharmacyRanking.html",
    "Medical": "MedicalRanking.html",
    "Law": "LawRanking.html",
    "Architecture": "ArchitectureRanking.html",
    "College": "CollegeRanking.html",
    "University": "UniversityRanking.html",
    "Overall": "OverallRanking.html",
}

INSTITUTE_ID_RE = re.compile(r"\bIR-[A-Z0-9\-]+\d{3,}\b")

# A small, realistic fallback fixture so the demo flow works even if the
# upstream site is unreachable from this container.
FALLBACK_ROWS = [
    {"institute_id": "IR-E-U-0456", "college_name": "Indian Institute of Technology Madras",        "city": "Chennai",      "state": "Tamil Nadu",      "score": 89.46, "rank": 1},
    {"institute_id": "IR-E-U-0306", "college_name": "Indian Institute of Technology Delhi",         "city": "New Delhi",    "state": "Delhi",           "score": 86.66, "rank": 2},
    {"institute_id": "IR-E-U-0575", "college_name": "Indian Institute of Technology Bombay",        "city": "Mumbai",       "state": "Maharashtra",     "score": 83.09, "rank": 3},
    {"institute_id": "IR-E-U-0573", "college_name": "Indian Institute of Technology Kanpur",        "city": "Kanpur",       "state": "Uttar Pradesh",   "score": 82.79, "rank": 4},
    {"institute_id": "IR-E-U-0456-A", "college_name": "Indian Institute of Technology Kharagpur",   "city": "Kharagpur",    "state": "West Bengal",     "score": 76.88, "rank": 5},
    {"institute_id": "IR-E-U-0177", "college_name": "Indian Institute of Technology Roorkee",       "city": "Roorkee",      "state": "Uttarakhand",     "score": 76.00, "rank": 6},
    {"institute_id": "IR-E-U-0167", "college_name": "Indian Institute of Technology Guwahati",      "city": "Guwahati",     "state": "Assam",           "score": 71.78, "rank": 7},
    {"institute_id": "IR-E-U-0573-A", "college_name": "Indian Institute of Technology Hyderabad",   "city": "Hyderabad",    "state": "Telangana",       "score": 71.55, "rank": 8},
    {"institute_id": "IR-E-C-36995", "college_name": "National Institute of Technology Tiruchirappalli", "city": "Tiruchirappalli", "state": "Tamil Nadu", "score": 65.27, "rank": 9},
    {"institute_id": "IR-E-C-37000", "college_name": "Jadavpur University, Faculty of Engineering", "city": "Kolkata",      "state": "West Bengal",     "score": 64.05, "rank": 10},
    {"institute_id": "IR-E-C-15001", "college_name": "Indian Institute of Technology BHU",          "city": "Varanasi",     "state": "Uttar Pradesh",   "score": 63.10, "rank": 11},
    {"institute_id": "IR-E-C-26102", "college_name": "Anna University",                              "city": "Chennai",      "state": "Tamil Nadu",      "score": 62.20, "rank": 12},
    {"institute_id": "IR-E-C-37100", "college_name": "Vellore Institute of Technology",             "city": "Vellore",      "state": "Tamil Nadu",      "score": 61.10, "rank": 13},
    {"institute_id": "IR-E-C-37200", "college_name": "BITS Pilani",                                  "city": "Pilani",       "state": "Rajasthan",       "score": 60.95, "rank": 14},
    {"institute_id": "IR-E-C-37300", "college_name": "National Institute of Technology Karnataka",  "city": "Surathkal",    "state": "Karnataka",       "score": 60.10, "rank": 15},
]


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def generate_pdf_url(year: int, category: str, institute_id: str) -> str:
    """Module 2 — PDF URL Generator."""
    slug = CATEGORY_SLUG.get(category, category)
    return f"https://www.nirfindia.org/nirfpdfcdn/{year}/pdf/{slug}/{institute_id}.pdf"


def ranking_page_url(year: int, category: str) -> str:
    page = RANKING_PAGE.get(category, f"{category}Ranking.html")
    return f"https://www.nirfindia.org/Rankings/{year}/{page}"


# ------------------------------------------------------------------
# Module 1 — Ranking Scraper
# ------------------------------------------------------------------
async def scrape_ranking_page(year: int, category: str, used_fallback_holder: dict) -> list[dict]:
    """Fetch the NIRF ranking page and parse institute rows.
    Returns list of {institute_id, college_name, city, state, score, rank}.
    Falls back to embedded fixture if fetch fails or yields zero rows.
    """
    url = ranking_page_url(year, category)
    html = None
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers={
            "User-Agent": "FiledNirfBot/1.0 (+research)"
        }) as client:
            r = await client.get(url)
            r.raise_for_status()
            html = r.text
    except Exception as e:
        logger.warning(f"NIRF ranking fetch failed for {url}: {e}")

    rows: list[dict] = []
    if html:
        rows = _parse_ranking_html(html)

    if not rows:
        logger.info("Using embedded fallback ranking fixture.")
        used_fallback_holder["used"] = True
        rows = [dict(r) for r in FALLBACK_ROWS]

    return rows


def _parse_ranking_html(html: str) -> list[dict]:
    """Best-effort parser for NIRF rankings HTML."""
    soup = BeautifulSoup(html, "html.parser")
    out: list[dict] = []
    for tr in soup.find_all("tr"):
        text = tr.get_text(" ", strip=True)
        m = INSTITUTE_ID_RE.search(text)
        if not m:
            continue
        institute_id = m.group(0)
        cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
        if len(cells) < 4:
            continue

        # Heuristic: find score/rank — last 2 numeric cells
        nums = []
        for c in cells:
            try:
                nums.append(float(c.replace(",", "")))
            except ValueError:
                pass
        score = nums[-2] if len(nums) >= 2 else (nums[-1] if nums else 0.0)
        rank = int(nums[-1]) if nums else 0

        # Name & location: pick first non-id long cell + last two text cells
        name = next((c for c in cells if institute_id not in c and len(c) > 5 and not _is_numericish(c)), "")
        # State / City — try last two non-numeric cells
        text_cells = [c for c in cells if c and not _is_numericish(c) and institute_id not in c and c != name]
        city = text_cells[-2] if len(text_cells) >= 2 else (text_cells[-1] if text_cells else "")
        state = text_cells[-1] if text_cells else ""

        out.append({
            "institute_id": institute_id,
            "college_name": name,
            "city": city,
            "state": state,
            "score": score,
            "rank": rank,
        })
    # Dedupe by institute_id, keep first
    seen = set()
    deduped = []
    for r in out:
        if r["institute_id"] in seen:
            continue
        seen.add(r["institute_id"])
        deduped.append(r)
    return deduped


def _is_numericish(s: str) -> bool:
    try:
        float(s.replace(",", "").strip())
        return True
    except ValueError:
        return False


# ------------------------------------------------------------------
# Module 3 — PDF Downloader
# ------------------------------------------------------------------
async def download_pdf(year: int, category: str, institute_id: str) -> dict:
    """Download a single PDF. Returns {status, path, size, error}."""
    url = generate_pdf_url(year, category, institute_id)
    slug = CATEGORY_SLUG.get(category, category).lower()
    folder = STORAGE_ROOT / str(year) / slug
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{institute_id}.pdf"

    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers={
            "User-Agent": "FiledNirfBot/1.0 (+research)"
        }) as client:
            r = await client.get(url)
            if r.status_code != 200:
                return {"status": "Failed", "path": None, "size": 0, "error": f"HTTP {r.status_code}", "url": url}
            content = r.content
            if not content or len(content) < 200:
                return {"status": "Failed", "path": None, "size": 0, "error": "Empty response body", "url": url}
            target.write_bytes(content)
            return {"status": "Downloaded", "path": str(target.relative_to(STORAGE_ROOT.parent.parent)), "size": len(content), "error": None, "url": url}
    except Exception as e:
        return {"status": "Failed", "path": None, "size": 0, "error": str(e)[:240], "url": url}


# ------------------------------------------------------------------
# Module 4 — Orchestrator / Sync runner
# ------------------------------------------------------------------
async def run_sync(db, job_id: str, year: int, category: str, limit: int = 25):
    """End-to-end sync. Updates job + writes nirf_institutions + nirf_documents."""
    used_fallback = {"used": False}
    started = _now_iso()
    await db.nirf_jobs.update_one(
        {"id": job_id},
        {"$set": {"status": "Running", "started_at": started}},
    )

    log_lines: list[str] = []

    def log(msg: str):
        line = f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}"
        log_lines.append(line)
        logger.info(line)

    try:
        log(f"Fetching ranking page for {category} {year}...")
        rows = await scrape_ranking_page(year, category, used_fallback)
        log(f"Parsed {len(rows)} institutions" + (" (using embedded fallback)" if used_fallback["used"] else ""))

        if limit and limit > 0:
            rows = rows[:limit]
            log(f"Limited to first {len(rows)} institutions for this sync")

        # Persist institutions
        for r in rows:
            doc = {
                "id": str(uuid.uuid4()),
                **r,
                "year": year,
                "category": category,
                "ingested_at": _now_iso(),
            }
            await db.nirf_institutions.update_one(
                {"institute_id": r["institute_id"], "year": year, "category": category},
                {"$set": doc},
                upsert=True,
            )

        # Download PDFs concurrently in small batches
        downloaded = failed = 0
        sem = asyncio.Semaphore(5)

        async def handle(row):
            nonlocal downloaded, failed
            async with sem:
                # Create or load existing document record
                existing = await db.nirf_documents.find_one(
                    {"institute_id": row["institute_id"], "year": year, "category": category},
                    {"_id": 0},
                )
                doc_id = existing["id"] if existing else str(uuid.uuid4())
                pdf_url = generate_pdf_url(year, category, row["institute_id"])
                await db.nirf_documents.update_one(
                    {"id": doc_id},
                    {"$set": {
                        "id": doc_id,
                        "institute_id": row["institute_id"],
                        "college_name": row["college_name"],
                        "year": year,
                        "category": category,
                        "url": pdf_url,
                        "status": "Pending",
                        "attempts": (existing.get("attempts", 0) if existing else 0) + 1,
                        "updated_at": _now_iso(),
                    }},
                    upsert=True,
                )

                result = await download_pdf(year, category, row["institute_id"])
                if result["status"] == "Downloaded":
                    downloaded += 1
                else:
                    failed += 1
                await db.nirf_documents.update_one(
                    {"id": doc_id},
                    {"$set": {
                        "status": result["status"],
                        "path": result.get("path"),
                        "size": result.get("size", 0),
                        "error": result.get("error"),
                        "updated_at": _now_iso(),
                    }},
                )
                log(f"{result['status']:>10}  {row['institute_id']:<18}  {row['college_name'][:60]}")

        await asyncio.gather(*(handle(r) for r in rows))

        await db.nirf_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "Completed",
                "completed_at": _now_iso(),
                "stats": {
                    "total": len(rows),
                    "downloaded": downloaded,
                    "failed": failed,
                    "fallback_used": used_fallback["used"],
                },
                "logs": log_lines[-300:],
            }},
        )
    except Exception as e:
        logger.exception("Sync failed")
        log(f"FATAL: {e}")
        await db.nirf_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "Failed",
                "completed_at": _now_iso(),
                "error": str(e)[:500],
                "logs": log_lines[-300:],
            }},
        )


async def retry_document(db, document_id: str) -> Optional[dict]:
    """Module 3+5 — manual retry of a single failed download."""
    doc = await db.nirf_documents.find_one({"id": document_id}, {"_id": 0})
    if not doc:
        return None
    result = await download_pdf(doc["year"], doc["category"], doc["institute_id"])
    patch = {
        "status": result["status"],
        "path": result.get("path"),
        "size": result.get("size", 0),
        "error": result.get("error"),
        "attempts": doc.get("attempts", 0) + 1,
        "updated_at": _now_iso(),
    }
    await db.nirf_documents.update_one({"id": document_id}, {"$set": patch})
    return {**doc, **patch}
