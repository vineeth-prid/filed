"""
NAAC Connector — Hybrid Web Connector for the NAAC public HEI dashboard.

Independent connector. Does NOT touch NIRF or AICTE code. Plugs into the existing
Data Sources Management Layer via the connector registry (data_sources_service.CONNECTORS).

Portal: https://assessmentonline.naac.gov.in/public/index.php/hei_dashboard

Flow:
  DISCOVERY (DataTables JSON list, needs _token + session cookie)
    -> ACQUISITION (institution rows + raw response)
    -> DETAIL (HTML "View Details" modal per institution)
    -> PDF DISCOVERY (IIQA / SSR / Peer Team Report / Grade Sheet links)
    -> PDF DOWNLOAD (versioned, checksummed, never overwrite)
    -> PDF EXTRACTION (full text + tables, all sections)
    -> NORMALIZATION (keep all source fields, no metrics)
    -> PUBLISH into naac_* collections + sync report.

The portal is reachable only from India-permitted IPs (geo-blocked elsewhere); set
NAAC_PROXY_URL to route via a proxy if needed. When unreachable, the sync fails cleanly
and is reported (no fabricated data for accreditation records).
"""
from __future__ import annotations

import os
import re
import uuid
import hashlib
import logging
from datetime import datetime, timezone

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

BASE = "https://assessmentonline.naac.gov.in/public/index.php"
DASHBOARD_URL = f"{BASE}/hei_dashboard"

STORAGE_DIR = os.environ.get("NAAC_STORAGE_DIR", "/app/backend/storage/naac")

_HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": DASHBOARD_URL,
}

# DataTables column definitions required by the server-side handler (from captured request).
_COLUMNS = [
    ("hei_assessment_id", "hei_assessment_id", False, True),
    ("hei_name", "hei_basic_profile.hei_name", True, True),
    ("aishe_id", "hei_basic_profile.aishe_id", True, True),
    ("other_address", "other_address", False, True),
    ("state_name", "state_name", False, True),
    ("iiqa_submitted_date", "iiqa_submitted_date", False, True),
    ("date_of_decleration", "date_of_decleration", False, True),
    ("grade", "grade", False, True),
    ("edit_button", "edit_button", False, False),
]

# Report link types discovered in the detail modal.
DOC_TYPES = {
    "iiqa_report": "IIQA Information",
    "ssr_report": "SSR Information",
    "peerteam_report": "Peer Team Report",
    "grade_sheet_rpt": "Grade Sheet",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _proxy() -> str | None:
    return (os.environ.get("NAAC_PROXY_URL") or "").strip() or None


def _client_kwargs() -> dict:
    kw = dict(timeout=40.0, verify=False, headers=_HTTP_HEADERS, follow_redirects=True)
    p = _proxy()
    if p:
        kw["proxy"] = p
    return kw


# ----------------------------- Session bootstrap -----------------------------
async def bootstrap_token(client: httpx.AsyncClient) -> str | None:
    """GET the dashboard page to establish a session cookie and extract the CSRF _token."""
    r = await client.get(DASHBOARD_URL, headers={"Accept": "text/html,*/*"})
    html = r.text
    # Try common Laravel token locations.
    for pat in [
        r'name="_token"\s+value="([^"]+)"',
        r'name=["\']csrf-token["\']\s+content=["\']([^"\']+)["\']',
        r'"_token"\s*:\s*"([^"]+)"',
        r"_token\s*=\s*['\"]([^'\"]+)['\"]",
    ]:
        m = re.search(pat, html)
        if m:
            return m.group(1)
    return None


# ----------------------------- Discovery (list) -----------------------------
def build_list_params(token: str | None, filters: dict, start: int, length: int) -> dict:
    params: dict = {
        "inst_type": filters.get("inst_type", ""),
        "state": filters.get("state", ""),
        "cycle": filters.get("cycle", 0),
        "iiqa_status": filters.get("iiqa_status", 5),
        "iiqa_sub_status": filters.get("iiqa_sub_status", 0),
        "date_range": filters.get("date_range", ""),
        "inst_name": filters.get("inst_name", ""),
        "draw": 1,
        "start": start,
        "length": length,
        "order[0][column]": 5,
        "order[0][dir]": "desc",
        "search[value]": "",
        "search[regex]": "false",
        "_": int(datetime.now().timestamp() * 1000),
    }
    if token:
        params["_token"] = token
    for i, (data, name, searchable, orderable) in enumerate(_COLUMNS):
        params[f"columns[{i}][data]"] = data
        params[f"columns[{i}][name]"] = name
        params[f"columns[{i}][searchable]"] = "true" if searchable else "false"
        params[f"columns[{i}][orderable]"] = "true" if orderable else "false"
        params[f"columns[{i}][search][value]"] = ""
        params[f"columns[{i}][search][regex]"] = "false"
    return params


async def fetch_list_page(client, token, filters, start, length) -> dict:
    params = build_list_params(token, filters, start, length)
    r = await client.get(DASHBOARD_URL, params=params)
    r.raise_for_status()
    return r.json()


def _clean(s):
    if s is None:
        return None
    s = re.sub(r"\s+", " ", str(s)).strip()
    return s or None


def parse_institution_row(row: dict) -> dict:
    """Normalize one DataTables institution row (keep all source fields)."""
    return {
        "hei_assessment_id": row.get("hei_assessment_id"),
        "hei_name": _clean(row.get("hei_name")),
        "aishe_id": _clean(row.get("aishe_id")),
        "address": _clean(row.get("other_address")),
        "state": _clean(row.get("state_name")),
        "iiqa_submitted_date": row.get("iiqa_submitted_date"),
        "date_of_decleration": row.get("date_of_decleration"),
        "grade": _clean(row.get("grade")),
        "status": str(row.get("status")) if row.get("status") is not None else "5",
    }


# ----------------------------- Detail (modal) -----------------------------
async def fetch_detail_html(client, hei_assessment_id, status) -> str:
    url = f"{DASHBOARD_URL}/{hei_assessment_id}"
    r = await client.get(url, params={"status": status}, headers={**_HTTP_HEADERS, "Accept": "text/html, */*; q=0.01"})
    r.raise_for_status()
    return r.text


def parse_detail(html: str) -> dict:
    """Parse the View Details modal HTML fragment into structured fields."""
    soup = BeautifulSoup(html, "html.parser")

    out: dict = {
        "institution": {"name": None, "code": None},
        "assessment": {},
        "document_links": {},
        "previous_assessments": [],
    }

    # Title: "COIMBATORE INSTITUTE OF TECHNOLOGY(C-36969)"
    h4 = soup.find("h4")
    if h4:
        title = _clean(h4.get_text())
        m = re.match(r"(.*?)\(([^)]+)\)\s*$", title or "")
        if m:
            out["institution"]["name"] = _clean(m.group(1))
            out["institution"]["code"] = _clean(m.group(2))
        else:
            out["institution"]["name"] = title

    # First modal-table = IIQA/SSR status key-values.
    kv = {}
    first_table = soup.find("table", class_="modal-table")
    if first_table:
        for tr in first_table.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) == 2:
                kv[_clean(tds[0].get_text())] = _clean(tds[1].get_text())
    out["assessment"] = {
        "iiqa_submitted_date": kv.get("IIQA Submitted Date"),
        "iiqa_status": kv.get("IIQA Status"),
        "ssr_submitted_date": kv.get("SSR Submitted Date"),
        "ssr_status": kv.get("SSR Status"),
    }

    # Report links (anchors to iiqa_report / ssr_report / peerteam_report / grade_sheet_rpt).
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        for slug in DOC_TYPES:
            if f"/{slug}/" in href:
                out["document_links"][slug] = href

    # Previous assessment table (#prev_table).
    prev = soup.find("table", id="prev_table")
    if prev:
        rows = prev.find_all("tr")
        for tr in rows[1:]:  # skip header row
            tds = [_clean(td.get_text()) for td in tr.find_all("td")]
            if len(tds) >= 6 and (tds[0] or tds[1] or tds[2]):
                score = None
                try:
                    score = float(tds[3]) if tds[3] not in (None, "") else None
                except (ValueError, TypeError):
                    score = None
                out["previous_assessments"].append({
                    "cycle_no": tds[0],
                    "assessment_date": tds[1],
                    "grade": tds[2],
                    "cgpa": score,
                    "ec_no": tds[4],
                    "certificate": tds[5] or None,
                })
    return out


# ----------------------------- PDF download + extraction -----------------------------
async def download_pdf(client, url: str) -> dict:
    r = await client.get(url, headers={**_HTTP_HEADERS, "Accept": "application/pdf,*/*"})
    r.raise_for_status()
    content = r.content
    ctype = r.headers.get("content-type", "")
    is_pdf = content[:5] == b"%PDF-" or "application/pdf" in ctype.lower()
    return {
        "content": content,
        "content_type": ctype,
        "is_pdf": is_pdf,
        "size": len(content),
        "checksum": hashlib.sha256(content).hexdigest(),
        "status_code": r.status_code,
    }


def extract_pdf(path: str) -> dict:
    """Extract ALL available content: per-page text + tables + document metadata.
    Generic full extraction (not summary-only). No metrics computed."""
    import pdfplumber  # local import keeps module import light

    pages_out = []
    full_text_parts = []
    table_count = 0
    meta = {}
    with pdfplumber.open(path) as pdf:
        meta = {k: str(v) for k, v in (pdf.metadata or {}).items()}
        for idx, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            tables = []
            try:
                for t in page.extract_tables():
                    if t:
                        tables.append(t)
                        table_count += 1
            except Exception:  # noqa: BLE001
                pass
            full_text_parts.append(text)
            pages_out.append({"page": idx, "text": text, "tables": tables})
    full_text = "\n".join(full_text_parts)
    return {
        "page_count": len(pages_out),
        "table_count": table_count,
        "char_count": len(full_text),
        "metadata": meta,
        "pages": pages_out,
        "full_text": full_text,
    }


# ----------------------------- Persistence helpers -----------------------------
async def _store_raw_html(db, kind, hei_assessment_id, url, status_code, body):
    doc = {
        "id": str(uuid.uuid4()),
        "kind": kind,  # "list" | "detail"
        "hei_assessment_id": hei_assessment_id,
        "url": url,
        "status_code": status_code,
        "body": body,
        "fetched_at": _now(),
    }
    await db.naac_raw_html.insert_one({**doc})
    return doc["id"]


async def _upsert_institution(db, inst: dict, sync_run_id: str):
    inst_doc = {**inst, "updated_at": _now(), "last_sync_run": sync_run_id}
    await db.naac_institutions.update_one(
        {"hei_assessment_id": inst["hei_assessment_id"]},
        {"$set": inst_doc, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": _now()}},
        upsert=True,
    )


# ----------------------------- Sync orchestration -----------------------------
async def run_sync(db, run_id: str, params: dict) -> None:
    """Execute a NAAC sync.

    params:
      mode: "manual" | "single" | "state" | "cycle" | "scheduled"
      filters: {inst_type, state, cycle, iiqa_status, iiqa_sub_status, inst_name}
      hei_assessment_id, status   (for single)
      limit: cap institutions processed (default 25)
      download_pdfs: bool (default True)
      extract_pdfs: bool (default True)
    """
    params = params or {}
    mode = params.get("mode", "manual")
    filters = dict(params.get("filters") or {})
    if mode == "state" and params.get("state"):
        filters["state"] = params["state"]
    if mode == "cycle" and params.get("cycle") is not None:
        filters["cycle"] = params["cycle"]
    limit = int(params.get("limit", 25))
    download_pdfs = bool(params.get("download_pdfs", True))
    extract_pdfs = bool(params.get("extract_pdfs", True))

    logs: list = []
    errors: list = []
    stats = {
        "institutions": 0, "assessments": 0, "document_links": 0,
        "pdfs_downloaded": 0, "extraction_success": 0,
        "failed_downloads": 0, "failed_parsing": 0,
    }

    def log(msg: str):
        logs.append(f"{_now()} | {msg}")
        logger.info("[NAAC sync %s] %s", run_id, msg)

    await db.sync_runs.update_one(
        {"id": run_id}, {"$set": {"status": "Running", "started_at": _now(), "logs": logs}}
    )

    os.makedirs(STORAGE_DIR, exist_ok=True)

    try:
        async with httpx.AsyncClient(**_client_kwargs()) as client:
            # ---- session + token ----
            token = await bootstrap_token(client)
            log(f"Session bootstrapped. CSRF token: {'found' if token else 'NOT found (continuing with session cookie)'}")

            # ---- DISCOVERY ----
            institutions: list = []
            if mode == "single" and params.get("hei_assessment_id"):
                institutions = [{
                    "hei_assessment_id": params["hei_assessment_id"],
                    "hei_name": None, "aishe_id": None, "address": None, "state": None,
                    "iiqa_submitted_date": None, "date_of_decleration": None, "grade": None,
                    "status": str(params.get("status", 5)),
                }]
                log(f"Single-institution sync for hei_assessment_id={params['hei_assessment_id']}")
            else:
                log(f"Discovery — filters={filters or 'defaults'} (mode={mode})")
                start = 0
                page_len = 50
                total = None
                while True:
                    page = await fetch_list_page(client, token, filters, start, page_len)
                    rows = page.get("data", []) or []
                    total = page.get("recordsTotal", total)
                    await _store_raw_html(db, "list", None, f"{DASHBOARD_URL}?start={start}", 200, page)
                    for row in rows:
                        institutions.append(parse_institution_row(row))
                    log(f"  Discovered {len(rows)} (total so far {len(institutions)} / recordsTotal {total})")
                    start += page_len
                    if not rows or (total is not None and start >= total) or len(institutions) >= max(limit, 0) or len(institutions) >= 5000:
                        break
                if limit and len(institutions) > limit:
                    institutions = institutions[:limit]
                log(f"Discovery complete — processing {len(institutions)} institution(s)")

            # ---- ACQUISITION + DETAIL per institution ----
            for inst in institutions:
                hei_id = inst["hei_assessment_id"]
                status = inst.get("status", "5")
                try:
                    html = await fetch_detail_html(client, hei_id, status)
                    await _store_raw_html(db, "detail", hei_id, f"{DASHBOARD_URL}/{hei_id}?status={status}", 200, html)
                    detail = parse_detail(html)
                except Exception as e:  # noqa: BLE001
                    stats["failed_parsing"] += 1
                    errors.append(f"detail {hei_id}: {type(e).__name__}: {str(e)[:120]}")
                    log(f"  ! detail failed for {hei_id}: {e}")
                    continue

                # Merge detail into institution record (keep all source fields).
                if detail["institution"].get("name") and not inst.get("hei_name"):
                    inst["hei_name"] = detail["institution"]["name"]
                inst["institution_code"] = detail["institution"].get("code")
                inst["iiqa_status"] = detail["assessment"].get("iiqa_status")
                inst["ssr_submitted_date"] = detail["assessment"].get("ssr_submitted_date")
                inst["ssr_status"] = detail["assessment"].get("ssr_status")
                if detail["assessment"].get("iiqa_submitted_date"):
                    inst["iiqa_submitted_date_detail"] = detail["assessment"]["iiqa_submitted_date"]
                await _upsert_institution(db, inst, run_id)
                stats["institutions"] += 1

                # ---- ASSESSMENTS (normalize, keep all fields) ----
                # Replace prior assessments for this institution (re-sync consistency).
                await db.naac_assessments.delete_many({"hei_assessment_id": hei_id})
                for a in detail["previous_assessments"]:
                    await db.naac_assessments.insert_one({
                        "id": str(uuid.uuid4()),
                        "hei_assessment_id": hei_id,
                        "aishe_id": inst.get("aishe_id"),
                        "institution_name": inst.get("hei_name"),
                        "cycle": a.get("cycle_no"),
                        "assessment_date": a.get("assessment_date"),
                        "grade": a.get("grade"),
                        "cgpa": a.get("cgpa"),
                        "ec_no": a.get("ec_no"),
                        "certificate": a.get("certificate"),
                        "created_at": _now(),
                    })
                    stats["assessments"] += 1

                # ---- PDF DISCOVERY (register links) ----
                doc_links = []
                for slug, url in detail["document_links"].items():
                    link = {
                        "id": str(uuid.uuid4()),
                        "hei_assessment_id": hei_id,
                        "aishe_id": inst.get("aishe_id"),
                        "institution_name": inst.get("hei_name"),
                        "doc_type": slug,
                        "doc_label": DOC_TYPES.get(slug, slug),
                        "url": url,
                        "discovered_at": _now(),
                    }
                    # Idempotent register (don't duplicate identical url).
                    await db.naac_document_links.update_one(
                        {"hei_assessment_id": hei_id, "doc_type": slug, "url": url},
                        {"$setOnInsert": link}, upsert=True,
                    )
                    doc_links.append(link)
                    stats["document_links"] += 1

                # ---- PDF DOWNLOAD + EXTRACTION ----
                if download_pdfs:
                    for link in doc_links:
                        try:
                            res = await download_pdf(client, link["url"])
                        except Exception as e:  # noqa: BLE001
                            stats["failed_downloads"] += 1
                            errors.append(f"download {hei_id}/{link['doc_type']}: {type(e).__name__}")
                            continue
                        if not res["is_pdf"]:
                            stats["failed_downloads"] += 1
                            errors.append(f"download {hei_id}/{link['doc_type']}: not a PDF ({res['content_type']})")
                            continue

                        # Version history — never overwrite. New version only if checksum changes.
                        existing = await db.naac_documents.find_one(
                            {"hei_assessment_id": hei_id, "doc_type": link["doc_type"], "checksum": res["checksum"]},
                            {"_id": 0, "id": 1},
                        )
                        if existing:
                            continue  # identical file already stored
                        version = await db.naac_documents.count_documents(
                            {"hei_assessment_id": hei_id, "doc_type": link["doc_type"]}
                        ) + 1
                        safe = re.sub(r"[^A-Za-z0-9_-]", "_", f"{inst.get('aishe_id') or hei_id}_{link['doc_type']}_v{version}")
                        file_path = os.path.join(STORAGE_DIR, f"{safe}.pdf")
                        with open(file_path, "wb") as fh:
                            fh.write(res["content"])
                        doc_id = str(uuid.uuid4())
                        await db.naac_raw_pdf.insert_one({
                            "id": str(uuid.uuid4()), "document_id": doc_id,
                            "file_path": file_path, "checksum": res["checksum"],
                            "size": res["size"], "content_type": res["content_type"], "fetched_at": _now(),
                        })
                        doc_record = {
                            "id": doc_id,
                            "hei_assessment_id": hei_id,
                            "aishe_id": inst.get("aishe_id"),
                            "institution_name": inst.get("hei_name"),
                            "cycle": None,
                            "doc_type": link["doc_type"],
                            "doc_label": link["doc_label"],
                            "version": version,
                            "source_url": link["url"],
                            "file_path": file_path,
                            "checksum": res["checksum"],
                            "size": res["size"],
                            "download_date": _now(),
                            "http_status": res["status_code"],
                            "extraction_status": "pending",
                            "created_at": _now(),
                        }
                        await db.naac_documents.insert_one({**doc_record})
                        stats["pdfs_downloaded"] += 1

                        # ---- PDF EXTRACTION (all sections) ----
                        if extract_pdfs:
                            try:
                                extracted = extract_pdf(file_path)
                                await db.naac_documents.update_one(
                                    {"id": doc_id},
                                    {"$set": {
                                        "extraction_status": "success",
                                        "extraction": extracted,
                                        "extraction_meta": {
                                            "page_count": extracted["page_count"],
                                            "table_count": extracted["table_count"],
                                            "char_count": extracted["char_count"],
                                            "extracted_at": _now(),
                                        },
                                    }},
                                )
                                stats["extraction_success"] += 1
                            except Exception as e:  # noqa: BLE001
                                stats["failed_parsing"] += 1
                                await db.naac_documents.update_one(
                                    {"id": doc_id},
                                    {"$set": {"extraction_status": "failed", "extraction_error": str(e)[:200]}},
                                )
                                errors.append(f"extract {hei_id}/{link['doc_type']}: {type(e).__name__}")

            # ---- SYNC REPORT ----
            await db.sync_runs.update_one(
                {"id": run_id},
                {"$set": {
                    "status": "Completed", "completed_at": _now(),
                    "records_processed": stats["institutions"],
                    "stats": stats, "errors": errors, "logs": logs,
                    "data_origin": "live",
                }},
            )
            await db.data_sources.update_one(
                {"source_type": "NAAC"},
                {"$set": {"last_sync": _now(), "status": "active", "updated_at": _now()}},
            )
            log(f"Sync complete — {stats}")
    except Exception as e:  # noqa: BLE001
        logger.exception("NAAC sync %s failed", run_id)
        errors.append(str(e))
        await db.sync_runs.update_one(
            {"id": run_id},
            {"$set": {
                "status": "Failed", "completed_at": _now(),
                "records_processed": stats["institutions"], "stats": stats,
                "errors": errors, "logs": logs + [f"{_now()} | FAILED: {e}"],
            }},
        )
        await db.data_sources.update_one(
            {"source_type": "NAAC"}, {"$set": {"status": "error", "updated_at": _now()}}
        )


# ----------------------------- Stats / monitoring -----------------------------
async def stats_for_source(db) -> dict:
    institutions = await db.naac_institutions.count_documents({})
    states = [s for s in await db.naac_institutions.distinct("state") if s]
    return {"records": institutions, "years_available": sorted(states)}


async def overview(db) -> dict:
    institutions = await db.naac_institutions.count_documents({})
    assessments = await db.naac_assessments.count_documents({})
    links = await db.naac_document_links.count_documents({})
    docs = await db.naac_documents.count_documents({})
    extracted_ok = await db.naac_documents.count_documents({"extraction_status": "success"})
    extracted_fail = await db.naac_documents.count_documents({"extraction_status": "failed"})
    raw_html = await db.naac_raw_html.count_documents({})
    raw_pdf = await db.naac_raw_pdf.count_documents({})
    states = sorted([s for s in await db.naac_institutions.distinct("state") if s])
    last_run = await db.sync_runs.find_one(
        {"source_type": "NAAC"}, {"_id": 0}, sort=[("created_at", -1)]
    )
    last_stats = (last_run or {}).get("stats", {})
    return {
        "institutions": institutions,
        "assessments": assessments,
        "document_links": links,
        "pdfs_downloaded": docs,
        "extraction_success": extracted_ok,
        "extraction_failed": extracted_fail,
        "raw_html": raw_html,
        "raw_pdf": raw_pdf,
        "states": states,
        "last_run": last_run,
        "monitoring": {
            "institutions_synced": last_stats.get("institutions", 0),
            "assessments_imported": last_stats.get("assessments", 0),
            "pdfs_downloaded": last_stats.get("pdfs_downloaded", 0),
            "extraction_success": last_stats.get("extraction_success", 0),
            "failed_downloads": last_stats.get("failed_downloads", 0),
            "failed_parsing": last_stats.get("failed_parsing", 0),
        },
    }
