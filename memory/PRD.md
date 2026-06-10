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
- **DONE (Jun 2026)** — NIRF Data Acquisition admin (scrape/download/track/retry) + **PDF Extraction Engine**
- **P1**: Hover-tooltip refinements on all factsheet metrics (calculation explainer)
- **P1**: Persistent comparison state via localStorage
- **P2**: Insights streaming (currently non-streaming send_message)
- **P2**: Saved colleges + collections per user (requires auth)
- **P2**: CSV/PDF factsheet export
- **P2**: Real NIRF/AICTE data ingestion pipeline
- **P3**: Early access email capture + admin dashboard
- **P3**: Mobile-first responsive refinements for scatter plot
