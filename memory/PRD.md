# Filed — Education Due Diligence Platform

## Original Problem Statement
Build a high-fidelity product prototype for **Filed**, an Education Due Diligence Platform that helps students, parents, counsellors and educational consultants make better higher-education decisions using publicly available institutional disclosures, government filings, accreditation reports, placement outcomes, fee structures and academic indicators. Filed should feel like Morningstar / Bloomberg / a credit-rating report applied to higher education — not a coaching website, not a ranking site, not a lead-gen marketplace.

## Architecture Decisions
- **Frontend**: React 19 + React Router 7 + Tailwind 3 + Recharts 3 + lucide-react + sonner
- **Backend**: FastAPI minimal — only one route (`/api/insights`) calls Claude Sonnet 4.5 via Emergent Universal Key + `emergentintegrations`. No DB beyond template's status check.
- **Data**: Realistic mock dataset of 16 Indian institutions (`/app/frontend/src/data/colleges.js`) modeled after NIRF / NAAC / AICTE / UGC disclosures.
- **Insight Engine**: LLM (Claude Sonnet 4.5) with strict system prompt — neutral, comparative, no accusations.

## User Personas
1. Students (16–24) evaluating colleges as financial investments
2. Parents underwriting higher-education spend
3. Career counsellors using research-grade comparisons
4. Educational consultants serving multiple students

## Core Requirements (Static)
- Premium / trustworthy / analytical / financial-report style
- Color palette: Deep Navy, Slate Gray, Emerald Green, Steel Blue, Amber, Off White
- Never use language: fake, misleading, scam, inflated
- Every metric must be source-attributed and calculation-explainable
- Comparison must support up to 4 institutions
- Disclosure comparison: Advertised vs Regulatory Disclosure with Variance bands

## What's Been Implemented (Feb 2026)
- Homepage with all 10 mandated sections:
  1. Hero with Bloomberg-style ticker + animated Filed Terminal dashboard
  2. Education Decision Gap (interactive stat reveal)
  3. Market Landscape (Recharts scatter plot: cost vs outcome, transparency-coded, student-strength sized)
  4. Six Intelligence Categories (Bento grid on dark navy)
  5. Mutual-fund-style Factsheet Preview with source badges + hover calc tooltips
  6. Disclosure Comparison (Advertised vs Regulatory, Variance bands, picker)
  7. Comparison Engine (up to 4 institutions, sortable, best-highlighted)
  8. Insight Engine (LLM-powered observations via `/api/insights`)
  9. Methodology & Trust (3 pillars + 6 data sources)
  10. Final CTA (Choose With Confidence — 3 styled buttons)
- College Factsheet page (`/college/:id`) — full mutual-fund-style report with KPIs, source-badged metrics, hover tooltips, outcome+trust composition, disclosure variance summary
- Comparison page (`/compare`) — up to 4 institutions, "best on this metric" highlighting, LLM-powered observations panel
- Institutions Browser (`/colleges`) — search, type filter, sort
- Methodology page (`/methodology`) — published formulas for composite scores
- Backend `/api/insights` endpoint using Claude Sonnet 4.5 with strict neutral-analyst system prompt

## Admin Panel + Authentication (Jun 2026)
- **Admin Panel hub** at `/admin` (`AdminHome.jsx`) — pipeline stats + cards linking the 5 modules (Sync, Extraction Review, Normalized Metrics, Intelligence, Annual Refresh). Reachable via "Admin" link in the navbar (shared on all pages). Backend: `GET /api/admin/nirf/overview`.
- **Admin login (JWT Bearer)** — single seeded admin (`vini.roks@gmail.com`), email+password, bcrypt hash, 12h token in localStorage, `Authorization: Bearer` header. `auth.py` + `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`.
- **Protection**: middleware gates ALL `/api/admin/*` routes (401 without token); public site routes stay open. Frontend `ProtectedRoute` wraps all `/admin/*` pages → redirects to `/admin/login`. Navbar shows Logout when authed.
- Verified: backend 17/17 + frontend 14/14 (iteration_6.json, 100%). Admin creds in `/app/memory/test_credentials.md`.

## Annual NIRF Refresh Workflow (Jun 2026)
- `annual_refresh.py` — one-click "Sync NIRF {year}" orchestrates a 7-stage staged background job: scrape → find institutions → generate PDF URLs → download → extract → calculate metrics & scores → update DB & track changes. Reuses the tested extraction/normalization/intelligence building blocks.
- Stage 4 has a fast connectivity probe; if upstream NIRF is unreachable / the year isn't published, it falls back to a clearly-labelled SIMULATED carry-forward from the latest prior year (data_origin="simulated") so change tracking stays demonstrable. Uses REAL downloads whenever the site is reachable.
- **Year-on-Year change tracking** (`nirf_yoy_changes`): Median Salary, Placement (pp), Faculty changes per institution (current/previous/delta/pct_change/direction) + cohort summary.
- **YoY trends** endpoint: per-metric (median_salary / placement_rate / faculty_count) cohort-average + per-institution series across all years on record.
- **Historical records never overwritten**: every collection keyed by (institute_id, year, category)/per-year document_id; a new survey year creates new documents and leaves prior years intact (verified: 2024 untouched after 2026 sync).
- Admin UI `/admin/nirf/refresh` (`AdminRefresh.jsx`): year picker + Sync button, 7-stage live progress, simulated-data banner, change-summary KPIs, YoY change table (up/down arrows), Recharts trend chart with metric tabs.
- APIs: `/api/admin/nirf/refresh` (+jobs/{id}), `/years`, `/changes`, `/trends`.
- Tests: `/app/backend/tests/test_refresh.py` (6) — full backend+frontend verified (iteration_5.json, 100%).

## College Intelligence Engine (Jun 2026)
- `intelligence_engine.py` — generates 4 explainable composite scores (0–100) per institution via cohort-relative min–max normalization of derived metrics + raw fields, then weighted average.
  - **Career Success** = Placement Rate (.45) + Median Salary (.35) + Higher Studies Rate (.20)
  - **Value For Money** = Median Salary (.55) + Fees inverted (.45)
  - **Academic Strength** = Faculty Ratio inverted (.35) + Research per Faculty (.45) + Patents (.20, excluded when absent → weights renormalized)
  - **Transparency** = Data Availability (.5) + Source Completeness (.5), absolute scoring
- Every score stores components (raw value, normalized sub-score, weight, contribution, source, direction) → powers the **"See How This Was Calculated"** breakdown. Letter grades AAA→C.
- Fees aren't in NIRF PDFs → editable per-institution admin input (`nirf_fees`), seeded with indicative tuition by institution type; lowering fees recomputes VFM live.
- Stored in `nirf_intelligence_scores`. Admin UI `/admin/nirf/intelligence` (`AdminIntelligence.jsx`): scores table + per-institution detail with 4 score cards, expandable calc breakdown, and inline fees editor.
- APIs: `/api/admin/nirf/intelligence` (+jobs/{id}/list/detail/catalog), `/documents/{id}/intelligence`, PUT `/fees/{id}`.
- Tests: `/app/backend/tests/test_intelligence.py` (7) — total suite 23 pass; full backend+frontend verified (iteration_4.json, 100%).

## Data Normalization Service (Jun 2026)
- `nirf_normalizer.py` — turns raw extracted fields into comparable cross-institution metrics WITHOUT mutating raw data.
- Two collections (the required "tables"):
  - `nirf_raw_data` — IMMUTABLE, versioned, insert-only snapshots of raw fields (content-hashed; new version only when values change; manual corrections create a new version while old versions are preserved).
  - `nirf_derived_metrics` — computed metrics, each carrying formula + input fields (value + source_page) + pointer to the raw_data version (full traceability).
- 11 derived metrics: Placement Rate / Higher Studies Rate / Outcome Rate (each UG, PG, Overall), Faculty Ratio (students/faculty), Research per Faculty (funding/faculty). Confidence = min of input confidences; missing/zero inputs → status insufficient_data / division_by_zero.
- Admin UI: `/admin/nirf/metrics` (`AdminMetrics.jsx`) — cross-institution comparison table + per-institution detail with formulas and source-traceability chips. Linked from review/sync pages.
- APIs: `/api/admin/nirf/normalize` (+jobs), `/derived-metrics` (+/{id}), `/raw-data/{id}` (versions), `/metrics/catalog`, `/documents/{id}/normalize`.
- Tests: `/app/backend/tests/test_normalization.py` (7) — total backend suite 16 pass; full backend+frontend verified (iteration_3.json, 100%).

## PDF Extraction Engine (Jun 2026)
- `nirf_extractor.py` — layered extraction: pdfplumber (primary text+tables), Camelot (table corroboration), OCR/tesseract fallback for image-only pages.
- Extracts 20 fields across 6 groups: Institution (name/state/city), Students (total/UG/PG/PhD), Faculty, Placement UG & PG (graduated/placed/higher-studies/median-salary), Research (patents filed/granted, sponsored projects, research funding).
- Every field stored as {value, source_page, confidence, method}. Overall confidence + coverage computed per doc. Confidence bands: High ≥0.85, Medium ≥0.6, Low <0.6.
- NOTE: NIRF "Data Submitted" PDFs do not contain patent data → patents fields are null/0-confidence by design, flagged for manual entry.
- Stored in MongoDB `nirf_extractions`; batch job tracked in `nirf_extract_jobs`.
- Manual corrections (PATCH) flip field to confidence 1.0/method=manual, set status=Reviewed, recompute scores, and are preserved across re-extraction.
- Admin review screen: `/admin/nirf/review` (`AdminExtract.jsx`) — master list with confidence pills/bars + detail panel with per-field source page, confidence bar, inline edit/save.
- APIs: `/api/admin/nirf/extract` (+jobs), `/api/admin/nirf/extractions` (+/{id}), `/api/admin/nirf/documents/{id}/extract`, PATCH `/api/admin/nirf/extractions/{id}/field`, `/api/admin/nirf/extract/schema`.
- Tests: `/app/backend/tests/test_extraction.py` (9 pass). Full backend+frontend verified (iteration_2.json, 100%).


## Prioritized Backlog
- **DONE (Jun 2026)** — NIRF Acquisition + PDF Extraction + Normalization + Intelligence Engine + **Annual Refresh Workflow (YoY change tracking + trends)**
- **P1**: Hover-tooltip refinements on all factsheet metrics (calculation explainer)
- **P1**: Persistent comparison state via localStorage
- **P2**: Insights streaming (currently non-streaming send_message)
- **P2**: Saved colleges + collections per user (requires auth)
- **P2**: CSV/PDF factsheet export
- **P2**: Real NIRF/AICTE data ingestion pipeline
- **P3**: Early access email capture + admin dashboard
- **P3**: Mobile-first responsive refinements for scatter plot

## Data Sources Management Layer + AICTE Connector (Jul 2025)
- **Goal**: a source-independent data-acquisition platform layered ON TOP of the untouched NIRF engine (NIRF tables/workflows/UI unchanged). NOT a KPI/analytics/ranking engine.
- **Data Sources layer** (`data_sources_service.py`): collections `data_sources` (registered sources) + `sync_runs` (every sync execution: status/history/logs/errors/version). Connector REGISTRY (`CONNECTORS` dict) — adding NAAC/TNEA/AISHE later needs only source registration + a connector entry, no refactor. NIRF connector is READ-ONLY (snapshots counts; never mutates nirf_* collections). Seeds NIRF + AICTE on startup.
  - APIs: GET `/api/admin/sources`(+/{id}), POST `/sources/{id}/sync`, GET `/sources/{id}/runs`, GET `/sync-runs`(+/{id}), GET `/monitoring`.
  - UI `/admin/sources` (`AdminSources.jsx`): Sources table (status/connector/records/years/last sync + Sync & History buttons), live run log panel, History modal, Monitoring tab (by_source + recent runs).
- **AICTE connector** (`aicte_connector.py`): JSON API source. Collections `aicte_api_sources` (endpoints NRI/PIO/FN/CIWG, dynamic), `aicte_raw_payloads` (immutable raw JSON, versioned), `aicte_records` (normalized). Flow: fetch JSON → store raw → normalize (case-insensitive multi-candidate field mapper) → validate → publish. Live httpx fetch first; AICTE upstream is geo/IP-blocked from this infra so it falls back to a clearly-labelled SIMULATED payload (data_origin=simulated) — switches to live automatically when reachable. Re-sync replaces normalized records per (year,category); raw payloads accumulate as immutable history.
  - APIs: GET `/api/admin/aicte/overview`, `/sources`(GET+POST), PATCH `/sources/{id}`, POST `/aicte/sync`, GET `/records`, `/payloads`(+/{id}), `/years`.
  - UI `/admin/aicte` (`AdminAICTE.jsx`): Overview, Endpoints (toggle active), Records (filters/search), Raw Payloads (view JSON), Sync History; year picker + Manual Sync with live progress + simulated-origin banner.
- Admin hub (`AdminHome.jsx`) gains a "Data Sources Platform" section (Data Sources + AICTE cards); NIRF cards untouched.
- Verified: backend 12/12 PASSED (incl. NIRF read-only regression + idempotency). Testing agent also fixed a pre-existing `security.py` MutableHeaders.pop bug. Frontend not yet tested (awaiting user approval).
