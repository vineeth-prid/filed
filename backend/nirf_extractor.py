"""
NIRF PDF Extraction Engine.

Converts NIRF "Data Submitted by Institution" PDFs into structured data.

Strategy (layered, with graceful degradation):
  1. pdfplumber  -> primary text + table extraction (digital PDFs).
  2. Camelot     -> table corroboration for student-strength / placement numbers.
  3. OCR (tesseract via pdf2image) -> fallback for pages with no extractable text.

Every extracted field is stored as:
    { value, source_page, confidence, method, raw }

Field groups:
  Institution : college_name, state, city
  Students    : total_students, ug_students, pg_students, phd_students
  Faculty     : faculty_count
  Placement UG: ug_graduated, ug_placed, ug_higher_studies, ug_median_salary
  Placement PG: pg_graduated, pg_placed, pg_higher_studies, pg_median_salary
  Research    : patents_filed, patents_granted, sponsored_projects, research_funding
"""
from __future__ import annotations

import logging
import re
from typing import Optional

import pdfplumber

logger = logging.getLogger("nirf.extract")

# Ordered list of every field key the engine targets (drives DB shape + UI).
FIELD_KEYS = [
    "college_name", "state", "city",
    "total_students", "ug_students", "pg_students", "phd_students",
    "faculty_count",
    "ug_graduated", "ug_placed", "ug_higher_studies", "ug_median_salary",
    "pg_graduated", "pg_placed", "pg_higher_studies", "pg_median_salary",
    "patents_filed", "patents_granted", "sponsored_projects", "research_funding",
]

FIELD_GROUPS = {
    "Institution": ["college_name", "state", "city"],
    "Students": ["total_students", "ug_students", "pg_students", "phd_students"],
    "Faculty": ["faculty_count"],
    "Placement — UG": ["ug_graduated", "ug_placed", "ug_higher_studies", "ug_median_salary"],
    "Placement — PG": ["pg_graduated", "pg_placed", "pg_higher_studies", "pg_median_salary"],
    "Research": ["patents_filed", "patents_granted", "sponsored_projects", "research_funding"],
}


def _field(value, source_page=None, confidence=0.0, method=None, raw=None) -> dict:
    return {
        "value": value,
        "source_page": source_page,
        "confidence": round(float(confidence), 2),
        "method": method,
        "raw": raw,
    }


def _to_int(s) -> Optional[int]:
    if s is None:
        return None
    m = re.match(r"\s*([\d,]+)", str(s))
    if not m:
        return None
    try:
        return int(m.group(1).replace(",", ""))
    except ValueError:
        return None


# ------------------------------------------------------------------
# Page loading (pdfplumber + OCR fallback)
# ------------------------------------------------------------------
def _ocr_page(path: str, page_index: int) -> str:
    """OCR a single page. Returns extracted text or '' on failure."""
    try:
        from pdf2image import convert_from_path
        import pytesseract
        imgs = convert_from_path(path, first_page=page_index + 1, last_page=page_index + 1, dpi=200)
        if not imgs:
            return ""
        return pytesseract.image_to_string(imgs[0]) or ""
    except Exception as e:  # pragma: no cover - depends on system tesseract
        logger.warning(f"OCR failed for page {page_index + 1}: {e}")
        return ""


def load_pages(path: str) -> tuple[list[dict], list[str]]:
    """Return (pages, methods_used).
    pages = [{ index, text, tables }] where index is 1-based page number.
    """
    pages: list[dict] = []
    methods: set[str] = set()
    with pdfplumber.open(path) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            method = "pdfplumber"
            if len(text.strip()) < 40:
                # Scanned / image page -> OCR fallback
                ocr_text = _ocr_page(path, i)
                if len(ocr_text.strip()) > len(text.strip()):
                    text = ocr_text
                    method = "ocr"
            methods.add(method)
            try:
                tables = page.extract_tables() or []
            except Exception:
                tables = []
            pages.append({"index": i + 1, "text": text, "tables": tables, "method": method})
    return pages, sorted(methods)


def _camelot_table_count(path: str) -> int:
    """Best-effort Camelot pass used as a corroboration signal."""
    try:
        import camelot
        tables = camelot.read_pdf(path, pages="all", flavor="stream", suppress_stdout=True)
        return tables.n
    except Exception as e:  # pragma: no cover - depends on ghostscript
        logger.info(f"Camelot pass skipped: {e}")
        return 0


# ------------------------------------------------------------------
# Field extractors
# ------------------------------------------------------------------
INSTITUTE_RE = re.compile(r"Institute Name:\s*(.+?)\s*\[(IR-[A-Z0-9\-]+)\]")


def extract_institution(pages: list[dict], meta: Optional[dict]) -> dict:
    out = {}
    p1 = pages[0]["text"] if pages else ""
    m = INSTITUTE_RE.search(p1)
    if m:
        out["college_name"] = _field(m.group(1).strip(), 1, 0.98, "pdfplumber", m.group(0))
    elif meta and meta.get("college_name"):
        out["college_name"] = _field(meta["college_name"], None, 0.6, "ranking_metadata")
    else:
        out["college_name"] = _field(None, None, 0.0, None)

    # State / City are not present in the data-sheet PDF body; sourced from
    # ranking metadata captured during scraping (authoritative, but not in-PDF).
    for key in ("state", "city"):
        if meta and meta.get(key):
            out[key] = _field(meta[key], None, 0.85, "ranking_metadata")
        else:
            out[key] = _field(None, None, 0.0, None)
    return out


def _find_strength_table(pages: list[dict]) -> tuple[Optional[list], Optional[int]]:
    """Locate the 'Total Actual Student Strength' table and its page."""
    for pg in pages:
        for tbl in pg["tables"]:
            if not tbl or not tbl[0]:
                continue
            header = [(c or "").replace("\n", " ") for c in tbl[0]]
            if any("Total Students" in h for h in header):
                return tbl, pg["index"]
    return None, None


def extract_students(pages: list[dict]) -> dict:
    out = {}
    tbl, page_no = _find_strength_table(pages)
    ug = pg = None
    if tbl:
        header = [(c or "").replace("\n", " ") for c in tbl[0]]
        try:
            total_col = next(i for i, h in enumerate(header) if "Total Students" in h)
        except StopIteration:
            total_col = None
        if total_col is not None:
            ug_sum = pg_sum = 0
            ug_hit = pg_hit = False
            for row in tbl[1:]:
                label = (row[0] or "").replace("\n", " ")
                val = _to_int(row[total_col]) if total_col < len(row) else None
                if val is None:
                    continue
                if label.strip().startswith("UG"):
                    ug_sum += val
                    ug_hit = True
                elif label.strip().startswith("PG"):
                    pg_sum += val
                    pg_hit = True
            ug = ug_sum if ug_hit else None
            pg = pg_sum if pg_hit else None

    out["ug_students"] = _field(ug, page_no, 0.93 if ug is not None else 0.0, "pdfplumber")
    out["pg_students"] = _field(pg, page_no, 0.93 if pg is not None else 0.0, "pdfplumber")

    phd = extract_phd(pages)
    out["phd_students"] = phd

    parts = [v for v in (ug, pg, phd["value"]) if v is not None]
    if parts:
        total = sum(parts)
        conf = min(
            out["ug_students"]["confidence"] or 1,
            out["pg_students"]["confidence"] or 1,
            phd["confidence"] or 1,
        )
        out["total_students"] = _field(total, page_no, round(conf * 0.97, 2), "computed",
                                       raw="ug+pg+phd")
    else:
        out["total_students"] = _field(None, None, 0.0, None)
    return out


def extract_phd(pages: list[dict]) -> dict:
    full = "\n".join(p["text"] for p in pages)
    page_no = next((p["index"] for p in pages if "Ph.D" in p["text"]), None)
    # Block describing students currently pursuing the doctoral program.
    block_m = re.search(r"Ph\.?D\s*\(Student pursuing.*?(?=No\. of Ph\.?D students graduated|$)",
                        full, re.DOTALL | re.IGNORECASE)
    block = block_m.group(0) if block_m else full
    ft = re.search(r"Full Time\s+(\d+)", block)
    pt = re.search(r"Part Time\s+(\d+)", block)
    if ft or pt:
        val = (int(ft.group(1)) if ft else 0) + (int(pt.group(1)) if pt else 0)
        return _field(val, page_no, 0.9, "pdfplumber", raw=block[:120])
    return _field(None, None, 0.0, None)


def extract_faculty(pages: list[dict]) -> dict:
    for pg in pages:
        m = re.search(r"Number of faculty members entered\s+(\d+)", pg["text"])
        if m:
            return {"faculty_count": _field(int(m.group(1)), pg["index"], 0.97, "pdfplumber", m.group(0))}
    return {"faculty_count": _field(None, None, 0.0, None)}


PLACEMENT_HEADING_RE = re.compile(
    r"(UG|PG)\s*\[\s*(\d+)\s*Years?\s*Program\(s\)\]\s*:\s*Placement", re.IGNORECASE)


def _is_placement_table(tbl) -> bool:
    if not tbl or not tbl[0]:
        return False
    header = " ".join((c or "") for c in tbl[0]).replace("\n", " ")
    return "Median salary" in header


def _parse_placement_row(tbl) -> Optional[dict]:
    """Parse the latest-year row of a placement table using the salary cell as
    an anchor. Salary is the integer cell >= 10000; graduated/placed are the two
    integer cells before it, higher-studies the cell after it."""
    data_rows = [r for r in tbl[1:] if r and re.match(r"\s*\d{4}-\d{2}", str(r[0] or ""))]
    if not data_rows:
        return None
    row = data_rows[-1]  # latest academic year
    # Locate salary cell
    sal_idx = None
    for i, c in enumerate(row):
        n = _to_int(c)
        if n is not None and n >= 10000:
            sal_idx = i
    if sal_idx is None or sal_idx < 2:
        return None
    graduated = _to_int(row[sal_idx - 2])
    placed = _to_int(row[sal_idx - 1])
    median = _to_int(row[sal_idx])
    higher = _to_int(row[sal_idx + 1]) if sal_idx + 1 < len(row) else None
    return {"graduated": graduated, "placed": placed, "median": median, "higher": higher}


def extract_placement(pages: list[dict]) -> dict:
    # Collect placement tables (with page no) and headings in document order.
    placement_tables: list[tuple[list, int]] = []
    for pg in pages:
        for tbl in pg["tables"]:
            if _is_placement_table(tbl):
                placement_tables.append((tbl, pg["index"]))

    headings: list[str] = []
    for pg in pages:
        for m in PLACEMENT_HEADING_RE.finditer(pg["text"]):
            headings.append(f"{m.group(1).upper()}{m.group(2)}")  # e.g. UG4, PG2

    sections: dict[str, dict] = {}
    for i, (tbl, page_no) in enumerate(placement_tables):
        key = headings[i] if i < len(headings) else f"T{i}"
        parsed = _parse_placement_row(tbl)
        if parsed:
            sections[key] = {"page": page_no, **parsed}

    def pick(prefixes):
        for p in prefixes:
            for k in sections:
                if k.startswith(p):
                    return sections[k]
        return None

    ug = pick(["UG4", "UG5", "UG"])
    pg = pick(["PG2", "PG3", "PG"])

    out = {}
    for prefix, data in (("ug", ug), ("pg", pg)):
        if data:
            pageno = data["page"]
            conf = 0.88
            out[f"{prefix}_graduated"] = _field(data["graduated"], pageno, conf if data["graduated"] is not None else 0.0, "pdfplumber")
            out[f"{prefix}_placed"] = _field(data["placed"], pageno, conf if data["placed"] is not None else 0.0, "pdfplumber")
            out[f"{prefix}_higher_studies"] = _field(data["higher"], pageno, conf if data["higher"] is not None else 0.0, "pdfplumber")
            out[f"{prefix}_median_salary"] = _field(data["median"], pageno, 0.85 if data["median"] is not None else 0.0, "pdfplumber")
        else:
            for suffix in ("graduated", "placed", "higher_studies", "median_salary"):
                out[f"{prefix}_{suffix}"] = _field(None, None, 0.0, None)
    return out


def extract_research(pages: list[dict]) -> dict:
    full = "\n".join(p["text"] for p in pages)
    out = {}

    # Sponsored projects (latest year = first number after the label)
    sp_page = next((p["index"] for p in pages if "Sponsored Research Details" in p["text"]), None)
    sp = re.search(r"Total no\. of Sponsored Projects\s+(\d+)", full)
    out["sponsored_projects"] = _field(int(sp.group(1)), sp_page, 0.95, "pdfplumber", sp.group(0)) if sp \
        else _field(None, None, 0.0, None)

    # Research funding = Total Amount Received within the Sponsored Research block
    block_m = re.search(r"Sponsored Research Details(.*?)(Consultancy Project Details|$)",
                        full, re.DOTALL)
    funding = None
    if block_m:
        fm = re.search(r"Total Amount Received \(Amount in Rupees\)\s+(\d+)", block_m.group(1))
        if fm:
            funding = int(fm.group(1))
    out["research_funding"] = _field(funding, sp_page, 0.9 if funding is not None else 0.0,
                                     "pdfplumber")

    # Patents — not present in standard NIRF data-sheet PDFs; attempt anyway.
    pat_page = next((p["index"] for p in pages if re.search(r"[Pp]atent", p["text"])), None)
    pf = re.search(r"(?:No\. of )?Patents?\s+(?:Published|Filed)\D*(\d+)", full)
    pgr = re.search(r"(?:No\. of )?Patents?\s+Granted\D*(\d+)", full)
    out["patents_filed"] = _field(int(pf.group(1)), pat_page, 0.85, "pdfplumber") if pf \
        else _field(None, None, 0.0, None)
    out["patents_granted"] = _field(int(pgr.group(1)), pat_page, 0.85, "pdfplumber") if pgr \
        else _field(None, None, 0.0, None)
    return out


# ------------------------------------------------------------------
# Public API
# ------------------------------------------------------------------
def extract_pdf(path: str, meta: Optional[dict] = None) -> dict:
    """Extract all structured fields from a NIRF PDF.

    Returns: { fields: {key: fieldobj}, overall_confidence, methods_used,
               page_count, camelot_tables }
    """
    pages, methods = load_pages(path)
    camelot_n = _camelot_table_count(path)
    if camelot_n:
        methods = sorted(set(methods) | {"camelot"})

    fields: dict[str, dict] = {}
    fields.update(extract_institution(pages, meta))
    fields.update(extract_students(pages))
    fields.update(extract_faculty(pages))
    fields.update(extract_placement(pages))
    fields.update(extract_research(pages))

    # Ensure every expected key exists
    for k in FIELD_KEYS:
        fields.setdefault(k, _field(None, None, 0.0, None))

    confs = [fields[k]["confidence"] for k in FIELD_KEYS]
    found = [c for c in confs if c > 0]
    overall = round(sum(confs) / len(confs), 3) if confs else 0.0
    coverage = round(len(found) / len(FIELD_KEYS), 3)

    return {
        "fields": fields,
        "overall_confidence": overall,
        "coverage": coverage,
        "methods_used": methods,
        "page_count": len(pages),
        "camelot_tables": camelot_n,
    }



# ==================================================================
# DB orchestration (MongoDB) — batch extraction, single re-extract,
# manual corrections.
# ==================================================================
import asyncio
import uuid
from datetime import datetime, timezone
from pathlib import Path

_BACKEND_DIR = Path(__file__).parent


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _abs_pdf_path(doc: dict) -> Optional[Path]:
    """Resolve the on-disk PDF path for a nirf_documents record."""
    rel = doc.get("path")
    if not rel:
        return None
    p = (_BACKEND_DIR / rel).resolve()
    return p if p.exists() else None


async def _meta_for(db, doc: dict) -> dict:
    inst = await db.nirf_institutions.find_one(
        {"institute_id": doc["institute_id"], "year": doc["year"], "category": doc["category"]},
        {"_id": 0},
    )
    if inst:
        return {"college_name": inst.get("college_name"), "state": inst.get("state"), "city": inst.get("city")}
    return {"college_name": doc.get("college_name")}


def _confidence_band(c: float) -> str:
    if c >= 0.85:
        return "High"
    if c >= 0.6:
        return "Medium"
    return "Low"


async def _extract_and_store(db, doc: dict) -> dict:
    """Extract one downloaded document and upsert into nirf_extractions.
    Preserves any prior manual corrections on re-extraction."""
    path = _abs_pdf_path(doc)
    base = {
        "document_id": doc["id"],
        "institute_id": doc["institute_id"],
        "year": doc["year"],
        "category": doc["category"],
        "college_name": doc.get("college_name"),
        "updated_at": _now_iso(),
    }
    existing = await db.nirf_extractions.find_one({"document_id": doc["id"]}, {"_id": 0})

    if not path:
        rec = {
            "id": existing["id"] if existing else str(uuid.uuid4()),
            **base,
            "status": "Failed",
            "error": "PDF not found on disk (download it first)",
            "overall_confidence": 0.0, "coverage": 0.0,
            "fields": (existing or {}).get("fields", {}),
            "extracted_at": _now_iso(),
        }
        await db.nirf_extractions.update_one({"document_id": doc["id"]}, {"$set": rec}, upsert=True)
        return rec

    meta = await _meta_for(db, doc)
    result = await asyncio.to_thread(extract_pdf, str(path), meta)

    fields = result["fields"]
    # Preserve prior manual corrections
    if existing:
        for k, prev in (existing.get("fields") or {}).items():
            if prev.get("corrected") and k in fields:
                fields[k] = {
                    **fields[k],
                    "value": prev["value"],
                    "confidence": 1.0,
                    "method": "manual",
                    "corrected": True,
                    "original_value": prev.get("original_value"),
                }

    rec = {
        "id": existing["id"] if existing else str(uuid.uuid4()),
        **base,
        "college_name": (fields.get("college_name") or {}).get("value") or doc.get("college_name"),
        "status": "Extracted",
        "error": None,
        "overall_confidence": result["overall_confidence"],
        "coverage": result["coverage"],
        "methods_used": result["methods_used"],
        "page_count": result["page_count"],
        "camelot_tables": result["camelot_tables"],
        "fields": fields,
        "extracted_at": _now_iso(),
    }
    await db.nirf_extractions.update_one({"document_id": doc["id"]}, {"$set": rec}, upsert=True)
    return rec


async def run_extraction(db, job_id: str, year: int, category: str, limit: int = 500):
    """Background batch extraction of all downloaded documents for year/category."""
    started = _now_iso()
    logs: list[str] = []

    def log(msg: str):
        line = f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}"
        logs.append(line)
        logger.info(line)

    await db.nirf_extract_jobs.update_one(
        {"id": job_id}, {"$set": {"status": "Running", "started_at": started}})
    try:
        docs = await db.nirf_documents.find(
            {"year": year, "category": category, "status": "Downloaded"}, {"_id": 0}
        ).to_list(limit)
        log(f"Found {len(docs)} downloaded documents for {category} {year}")
        ok = failed = 0
        for d in docs:
            try:
                rec = await _extract_and_store(db, d)
                if rec["status"] == "Extracted":
                    ok += 1
                    log(f"   OK  {d['institute_id']:<16} conf={rec['overall_confidence']}  {d.get('college_name','')[:48]}")
                else:
                    failed += 1
                    log(f" FAIL  {d['institute_id']:<16} {rec.get('error')}")
            except Exception as e:  # pragma: no cover
                failed += 1
                log(f" FAIL  {d['institute_id']:<16} {str(e)[:120]}")
        await db.nirf_extract_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "Completed", "completed_at": _now_iso(),
                "stats": {"total": len(docs), "extracted": ok, "failed": failed},
                "logs": logs[-300:],
            }})
    except Exception as e:
        logger.exception("Extraction job failed")
        log(f"FATAL: {e}")
        await db.nirf_extract_jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "Failed", "completed_at": _now_iso(),
                      "error": str(e)[:500], "logs": logs[-300:]}})


async def extract_single(db, document_id: str) -> Optional[dict]:
    doc = await db.nirf_documents.find_one({"id": document_id}, {"_id": 0})
    if not doc:
        return None
    return await _extract_and_store(db, doc)


async def apply_correction(db, extraction_id: str, field_key: str, value) -> Optional[dict]:
    """Apply a manual correction to a single field and recompute confidence/coverage."""
    if field_key not in FIELD_KEYS:
        return {"error": f"Unknown field '{field_key}'"}
    rec = await db.nirf_extractions.find_one({"id": extraction_id}, {"_id": 0})
    if not rec:
        return None
    fields = rec.get("fields", {})
    prev = fields.get(field_key, _field(None, None, 0.0, None))
    original = prev.get("original_value") if prev.get("corrected") else prev.get("value")
    fields[field_key] = {
        "value": value,
        "source_page": prev.get("source_page"),
        "confidence": 1.0,
        "method": "manual",
        "raw": prev.get("raw"),
        "corrected": True,
        "original_value": original,
    }
    confs = [fields[k]["confidence"] for k in FIELD_KEYS if k in fields]
    found = [c for c in confs if c > 0]
    overall = round(sum(confs) / len(confs), 3) if confs else 0.0
    coverage = round(len(found) / len(FIELD_KEYS), 3)
    patch = {
        "fields": fields,
        "overall_confidence": overall,
        "coverage": coverage,
        "status": "Reviewed",
        "reviewed_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    await db.nirf_extractions.update_one({"id": extraction_id}, {"$set": patch})
    return {**rec, **patch}
