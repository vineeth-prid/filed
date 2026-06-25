#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Build a Data Sources Management Layer and add AICTE as a second data source, WITHOUT modifying/renaming/refactoring the existing NIRF engine (tables, workflows, UI must stay unchanged).
  Phase 1: Data Sources management layer (data_sources + sync_runs tables) with a dashboard.
  Phase 2: AICTE connector (JSON API source) — aicte_api_sources, aicte_raw_payloads, aicte_records; fetch JSON -> store raw -> normalize -> validate -> publish; AICTE admin page.
  Phase 3: Common source-independent features (sync status/history/logs/version/error tracking/monitoring).
  Future-ready: new connectors (NAAC/TNEA/AISHE) addable via source registration + connector impl only.

backend:
  - task: "Data Sources Management Layer (data_sources + sync_runs, connector registry, monitoring)"
    implemented: true
    working: true
    file: "data_sources_service.py, server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "New module data_sources_service.py with connector registry (NIRF read-only stats/snapshot + AICTE). Seeds NIRF & AICTE rows on startup. Endpoints: GET /api/admin/sources, GET /api/admin/sources/{id}, POST /api/admin/sources/{id}/sync, GET /api/admin/sources/{id}/runs, GET /api/admin/sync-runs, GET /api/admin/sync-runs/{run_id}, GET /api/admin/monitoring. NIRF connector is READ-ONLY (must not modify any nirf_* collection)."
        -working: true
        -agent: "testing"
        -comment: "✅ ALL TESTS PASSED. Tested: GET /api/admin/sources (returns NIRF + AICTE with all required fields), POST /api/admin/sources/{id}/sync (NIRF read-only sync completed with data_origin='existing'), GET /api/admin/sync-runs/{run_id} (polling works, status transitions Queued→Running→Completed), GET /api/admin/monitoring (returns sources, total_runs, failed_runs, active_runs, recent_runs, by_source with NIRF+AICTE). Fixed minor bug in security.py (MutableHeaders.pop → del). All endpoints working correctly."
  - task: "AICTE Connector (fetch JSON -> raw payload -> normalize -> validate -> publish)"
    implemented: true
    working: true
    file: "aicte_connector.py, server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "aicte_connector.py: seeds 4 endpoints (NRI/PIO/FN/CIWG) in aicte_api_sources. Live httpx fetch first; AICTE endpoint is geo/IP-blocked from this infra so it falls back to a clearly-labelled SIMULATED payload (data_origin=simulated). Stores immutable aicte_raw_payloads, normalizes to aicte_records (replace per year+category), validates (skip rows w/o collegename), writes sync report to sync_runs. Endpoints: GET /api/admin/aicte/overview, /sources (GET+POST), PATCH /sources/{id}, POST /api/admin/aicte/sync, GET /records, /payloads, /payloads/{id}, /years. Poll run via /api/admin/sync-runs/{run_id}."
        -working: true
        -agent: "testing"
        -comment: "✅ ALL TESTS PASSED. Full pipeline tested: POST /api/admin/aicte/sync (completed in 18s, 33 records processed, data_origin='simulated' as expected), GET /api/admin/aicte/overview (4 endpoints, 4 active, 33 records, 4 payloads, years=['2025-2026'], categories=[CIWG,FN,NRI,PIO]), GET /api/admin/aicte/records (filters working: academic_year, category, search), GET /api/admin/aicte/payloads (list excludes payload_json, detail includes it), GET /api/admin/aicte/sources + PATCH (toggle active working), GET /api/admin/aicte/years (returns ['2025-2026']). Idempotency verified: re-sync replaces records (33→33) but accumulates payloads (4→8). All record fields present: id, academic_year, source_category, colid, collegename, state, course_name, course_level, approved_intake, special_intake, raw_payload_id."
  - task: "Existing NIRF engine unchanged (regression)"
    implemented: true
    working: true
    file: "server.py, nirf_service.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "No NIRF routes/collections were modified. Verify existing NIRF endpoints (/api/admin/nirf/overview etc.) still respond and NIRF collections are untouched after running a Data Sources NIRF 'sync' (which is read-only snapshot)."
        -working: true
        -agent: "testing"
        -comment: "✅ REGRESSION TEST PASSED. NIRF connector is READ-ONLY: initial records=0, after sync records=0 (unchanged). NIRF sync completed with data_origin='existing' (correct). GET /api/admin/nirf/overview still works (200 OK). No NIRF collections were modified. NIRF pipeline remains fully functional and isolated from Data Sources layer."
  - task: "NAAC Connector (Hybrid Web) — discovery/detail/PDF/extraction/normalize"
    implemented: true
    working: true
    file: "naac_connector.py, data_sources_service.py, server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: |
          New independent NAAC connector registered in CONNECTORS registry + seeded as data source (connector_type=hybrid_web). NIRF/AICTE untouched.
          Collections: naac_institutions, naac_assessments, naac_documents, naac_document_links, naac_raw_html, naac_raw_pdf.
          Parsers VERIFIED OFFLINE against the user's real captured data (parse_institution_row on list JSON + parse_detail on modal HTML == cit.json exactly: institution name/code, IIQA/SSR status, 4 PDF links, previous assessments cycle/date/grade/cgpa/ec/certificate).
          NOTE: The NAAC portal (assessmentonline.naac.gov.in) is GEO-BLOCKED from this sandbox (ConnectTimeout). A live sync here will FAIL cleanly (status=Failed, no crash) — that is EXPECTED. It runs live on the user's India server. Do NOT treat the geo-block failure as a bug.
          Endpoints (all /api/admin/naac/*, Bearer auth): overview, sync (POST: mode/filters/limit/download_pdfs/extract_pdfs), institutions (+/{id}), assessments, documents (+/{id}/extraction), document-links, schedule (GET/PUT). Sync runs tracked in sync_runs; poll via /api/admin/sync-runs/{run_id}.
        -working: true
        -agent: "testing"
        -comment: |
          ✅ ALL 9 NAAC CONNECTOR TESTS PASSED (100% success rate)
          
          NAAC connector framework is fully functional and properly integrated with Data Sources Management Layer:
          
          1. ✅ GET /api/admin/sources - Returns 3 sources (NIRF, AICTE, NAAC). NAAC has connector_type='hybrid_web', status='active', all required fields present.
          2. ✅ GET /api/admin/naac/overview - All required keys present: institutions, assessments, document_links, pdfs_downloaded, extraction_success, extraction_failed, raw_html, raw_pdf, states, last_run, monitoring (with all 6 sub-keys).
          3. ✅ POST /api/admin/naac/sync (manual mode, limit=3) - Returns run_id, status transitions Queued→Running→Failed. GRACEFUL FAILURE as expected (geo-blocked). No server crash, errors captured, source_type='NAAC' confirmed.
          4. ✅ GET /api/admin/naac/institutions, /assessments, /documents, /document-links - All return valid empty structures with correct keys (total=0 as expected, no data due to geo-block).
          5. ✅ POST /api/admin/naac/sync (single-institution mode, hei_assessment_id=16164) - Also fails gracefully (geo-blocked), no crash.
          6. ✅ GET/PUT /api/admin/naac/schedule - Defaults correct (enabled=false, interval_hours=24). PUT to enable (interval_hours=12) persists correctly. PUT to disable works. Schedule left disabled as required.
          7. ✅ GET /api/admin/monitoring - NAAC entry present in by_source array with status='error' (expected due to failed syncs), runs=2.
          8. ✅ REGRESSION TEST - NIRF overview still works (200 OK). AICTE sync completes successfully (status=Completed, data_origin='simulated', records=33). NIRF and AICTE completely unaffected by NAAC addition.
          9. ✅ Auth Gate - GET /api/admin/naac/overview without Authorization header correctly returns 401.
          
          CRITICAL VALIDATION: The geo-blocked NAAC sync failures are EXPECTED and CORRECT behavior. The connector handles network failures gracefully without crashing the server. All endpoints return proper structures. The framework is production-ready for deployment on India-based servers where NAAC portal is accessible.
  - task: "Support/Admissions Assistant - Public chat endpoint (Ollama-powered with graceful fallback)"
    implemented: true
    working: true
    file: "assistant_service.py, server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "POST /api/assistant/chat (NO auth required). Ollama-powered conversational assistant for admissions queries. Stores conversations in assistant_conversations collection. Graceful fallback when Ollama is unavailable (llm_ok=false). Returns {session_id, reply, suggest_lead, llm_ok}. Rate-limited per IP (30 req/60s). Intent detection for lead capture suggestions."
        -working: true
        -agent: "testing"
        -comment: |
          ✅ ALL CHAT TESTS PASSED (3/3)
          
          1. ✅ Test 1: PUBLIC chat (no auth) - Returns 200 with valid response structure {session_id, reply, suggest_lead, llm_ok}. Fallback reply working correctly (Ollama down, EXPECTED): 'I'm having trouble reaching the assistant service right now. You can still browse Colleges and Compare, or share your details below and our team will help you.' suggest_lead=True as expected.
          2. ✅ Test 2: Multi-turn persistence - Same session_id maintains conversation context. Messages stored in assistant_conversations collection. Returns 200 with non-empty reply.
          3. ✅ Test 8b: Auth gate - Public endpoint works WITHOUT Authorization header (200). No auth required as designed.
          
          CRITICAL VALIDATION: The fallback behavior (llm_ok=false) is EXPECTED and CORRECT in this sandbox where Ollama is not running. The endpoint returns HTTP 200 (NOT 500) with a helpful fallback message. On the user's production server with Ollama running, it will return real LLM-generated responses.
  - task: "Leads capture - Public lead submission with validation"
    implemented: true
    working: true
    file: "assistant_service.py, server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "POST /api/assistant/lead (NO auth required). Captures visitor contact details as leads. Stores in leads collection with status='new'. Links to conversation via session_id. Validation: name required, email OR phone required, email format check. Returns {ok:true, lead_id} or {ok:false, error}. Rate-limited per IP (10 req/300s)."
        -working: true
        -agent: "testing"
        -comment: |
          ✅ ALL LEAD CAPTURE TESTS PASSED (5/5)
          
          1. ✅ Test 3a: Valid lead submission - Returns 200 {ok:true, lead_id}. Lead stored with all fields: name='Ravi Kumar', email='ravi@example.com', phone='9876543210', interest='B.Tech CSE', message='please call me', status='new', session_id='test-sess-1'.
          2. ✅ Test 3b: Missing name validation - Correctly rejects with 400 when name is empty.
          3. ✅ Test 3c: No contact validation - Correctly rejects with 400 when neither email nor phone provided.
          4. ✅ Test 3d: Invalid email validation - Correctly rejects with 400 when email format is invalid ('not-an-email').
          5. ✅ Test 8c: Auth gate - Public endpoint works WITHOUT Authorization header (200). No auth required as designed.
          
          All validation rules working correctly. Lead capture properly linked to conversation via session_id.
  - task: "Leads CRM - Admin management endpoints (list, stats, detail, update)"
    implemented: true
    working: true
    file: "assistant_service.py, server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Admin endpoints (Bearer auth required): GET /api/admin/leads (list with filters: status, q), GET /api/admin/leads/stats (aggregated stats by status), GET /api/admin/leads/{lead_id} (detail with linked conversation), PATCH /api/admin/leads/{lead_id} (update status/notes). Status workflow: new→contacted→qualified→converted→closed. Returns 401 without valid JWT token."
        -working: true
        -agent: "testing"
        -comment: |
          ✅ ALL LEADS CRM TESTS PASSED (11/11)
          
          1. ✅ Test 4a: List all leads - Returns 200 {leads, total}. Ravi Kumar present with status='new'. Total count correct (>=1).
          2. ✅ Test 4b: Filter by status=new - Returns only leads with status='new'. Ravi Kumar included.
          3. ✅ Test 4c: Search q=ravi - Full-text search working across name/email/phone/interest fields. Ravi Kumar found.
          4. ✅ Test 5: Lead stats - Returns 200 {total, by_status, statuses}. All 5 statuses present in by_status: new, contacted, qualified, converted, closed. Counts correct.
          5. ✅ Test 6: Lead detail - Returns 200 {lead, conversation}. Lead details correct (name='Ravi Kumar'). Conversation linked via session_id='test-sess-1' with 4 messages (2 user + 2 assistant from tests 1-2).
          6. ✅ Test 7a: Valid update - PATCH with status='contacted', notes='called the student' returns 200. Lead updated correctly.
          7. ✅ Test 7b: Invalid status - PATCH with status='foo' correctly rejects with 400 (invalid status).
          8. ✅ Test 8a: Auth gate - GET /api/admin/leads WITHOUT Authorization header correctly returns 401.
          9. ✅ Test 9a: Regression - GET /api/admin/sources still returns 3 sources (NIRF, AICTE, NAAC). All existing endpoints unaffected.
          10. ✅ Test 9b: Regression - GET /api/admin/nirf/overview still returns 200. NIRF pipeline unaffected.
          11. ✅ Admin Login - JWT authentication working correctly. Token obtained and used for all admin endpoints.
          
          Complete CRM workflow validated: lead capture → list/filter → detail with conversation → status update. All auth gates working correctly (admin endpoints require JWT, public endpoints don't).

frontend:
  - task: "NAAC admin page (/admin/naac)"
    implemented: true
    working: "NA"
    file: "pages/AdminNAAC.jsx, App.js, pages/AdminHome.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Tabs: Overview (monitoring), Sync (mode + filters + pdf flags), Institutions (search + detail modal w/ assessments + links + docs), Documents (extraction viewer), Schedule (enable/interval), Sync History. Live run panel. Frontend testing only after explicit user approval."
  - task: "Data Sources dashboard + Monitoring (/admin/sources)"
    implemented: true
    working: "NA"
    file: "pages/AdminSources.jsx, App.js, pages/AdminHome.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "New page with Sources table (name/status/connector/records/years/last sync + Sync & History buttons), live run panel with logs, History modal, Monitoring tab. Linked from /admin hub new 'Data Sources Platform' section. Frontend testing only after explicit user approval."
  - task: "AICTE admin page (/admin/aicte)"
    implemented: true
    working: "NA"
    file: "pages/AdminAICTE.jsx, App.js, pages/AdminHome.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Tabs: Overview, Endpoints (toggle active), Records (filters), Raw Payloads (view JSON), Sync History. Year picker + Manual Sync with live progress + simulated-origin banner. Frontend testing only after explicit user approval."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 3
  run_ui: false

test_plan:
  current_focus:
    - "Support/Admissions Assistant (public chat) + Leads capture & admin CRM"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -message: |
      NEW: Public AI Assistant (Ollama-powered) + Leads CRM. Send a browser User-Agent on every request (anti-bot middleware blocks curl UA). Admin Bearer auth for /api/admin/* (vini.roks@gmail.com / Admin!123@). The PUBLIC assistant endpoints need NO auth.
      CONTEXT: Ollama is NOT running in this sandbox, so /api/assistant/chat will use a graceful FALLBACK reply (llm_ok=false) — that is EXPECTED, NOT a bug. It must NOT 500; it should return 200 with a reply string and suggest_lead=true. On the user's server (llama3.2:3b) it returns real LLM replies.
      Test:
      1) POST /api/assistant/chat {session_id:"test-sess-1","message":"I need admission help for engineering"} (NO auth, browser UA) -> 200 {session_id, reply (non-empty string), suggest_lead:true}. Should NOT 500 even though Ollama is down.
      2) Multi-turn: POST again same session_id with another message -> 200; conversation persists (stored in assistant_conversations).
      3) POST /api/assistant/lead {session_id:"test-sess-1","name":"Ravi Kumar","email":"ravi@example.com","interest":"B.Tech CSE","message":"call me"} (NO auth) -> 200 {ok:true, lead_id}. Validation: POST with no name -> 400; POST with name but no email AND no phone -> 400; invalid email -> 400.
      4) GET /api/admin/leads (auth) -> {leads:[...], total>=1} includes Ravi Kumar with status "new". Test ?status=new and ?q=ravi filters.
      5) GET /api/admin/leads/stats (auth) -> {total, by_status:{new,contacted,qualified,converted,closed}, statuses:[...]}.
      6) GET /api/admin/leads/{lead_id} (auth) -> {lead, conversation} (conversation has the messages from steps 1-2).
      7) PATCH /api/admin/leads/{lead_id} {status:"contacted", notes:"called"} (auth) -> updated lead status=contacted, notes=called. PATCH invalid status:"foo" -> 400.
      8) Auth gate: GET /api/admin/leads WITHOUT token -> 401. Public POST /api/assistant/chat and /assistant/lead WITHOUT token -> work (200).
      9) Regression: GET /api/admin/sources still returns NIRF + AICTE + NAAC; GET /api/admin/nirf/overview 200.
    -agent: "testing"
    -message: |
      ✅ BACKEND TESTING COMPLETE - ALL 12 TESTS PASSED (100% success rate)
      
      Comprehensive testing completed for Data Sources Management Layer + AICTE Connector:
      
      1. ✅ Authentication (POST /api/auth/login) - Working
      2. ✅ Data Sources List (GET /api/admin/sources) - NIRF + AICTE sources with all required fields
      3. ✅ AICTE Full Sync Pipeline (POST /api/admin/aicte/sync) - Completed in 18s, 33 records processed, data_origin='simulated'
      4. ✅ AICTE Overview (GET /api/admin/aicte/overview) - All counts and metadata correct
      5. ✅ AICTE Records (GET /api/admin/aicte/records) - Filters working (academic_year, category, search)
      6. ✅ AICTE Payloads (GET /api/admin/aicte/payloads + /{id}) - List/detail views correct
      7. ✅ AICTE Sources Management (GET + PATCH /api/admin/aicte/sources) - Toggle active working
      8. ✅ AICTE Years (GET /api/admin/aicte/years) - Returns ['2025-2026']
      9. ✅ NIRF Regression Test - READ-ONLY verified, no collections modified, existing endpoints working
      10. ✅ Monitoring (GET /api/admin/monitoring) - All metrics present
      11. ✅ Idempotency Test - Records replaced (not duplicated), payloads accumulated correctly
      12. ✅ Auth Gate - Unauthorized requests properly rejected (401)
      
      ISSUE FIXED: Minor bug in security.py line 78-79 - MutableHeaders doesn't have .pop() method, changed to use 'del' statement. This was blocking all API requests with 500 error.
      
      All backend functionality is working correctly. The AICTE connector properly handles the geo-blocked upstream (falls back to simulated data with clear labeling), the Data Sources layer provides proper abstraction, and NIRF remains completely isolated and unchanged.
    -agent: "testing"
    -message: |
      ✅ NAAC CONNECTOR TESTING COMPLETE - ALL 9 TESTS PASSED (100% success rate)
      
      NAAC connector framework fully validated. All endpoints working correctly. Graceful failure handling confirmed for geo-blocked environment.
      
      Test Results:
      1. ✅ Data Sources List - NAAC registered with connector_type='hybrid_web'
      2. ✅ NAAC Overview - All monitoring keys present and correct
      3. ✅ NAAC Sync (manual) - Graceful failure (geo-blocked, EXPECTED), no crash
      4. ✅ NAAC Empty Endpoints - All return valid structures (institutions, assessments, documents, document-links)
      5. ✅ Single-Institution Sync - Also fails gracefully (geo-blocked, EXPECTED)
      6. ✅ Schedule Configuration - GET/PUT working, persistence verified, left disabled
      7. ✅ Monitoring - NAAC entry present in by_source
      8. ✅ REGRESSION - NIRF overview works, AICTE sync completes (33 records, simulated)
      9. ✅ Auth Gate - 401 without token
      
      IMPORTANT: Geo-blocked sync failures are EXPECTED and CORRECT. The connector is production-ready for India-based deployment where NAAC portal is accessible. No code changes needed.
    -agent: "testing"
    -message: |
      ✅ SUPPORT/ADMISSIONS ASSISTANT + LEADS CRM TESTING COMPLETE - ALL 19 TESTS PASSED (100% success rate)
      
      Comprehensive testing completed for the NEW Support/Admissions Assistant + Leads CRM feature:
      
      PUBLIC ASSISTANT ENDPOINTS (No Auth Required):
      1. ✅ POST /api/assistant/chat - Returns 200 with {session_id, reply, suggest_lead, llm_ok}. Fallback working correctly (Ollama down, EXPECTED).
      2. ✅ Multi-turn conversation - Session persistence working, messages stored in assistant_conversations.
      3. ✅ POST /api/assistant/lead - Valid lead submission returns 200 {ok:true, lead_id}. Lead stored with all fields.
      4. ✅ Lead validation - Missing name (400), no contact (400), invalid email (400) all correctly rejected.
      5. ✅ Auth gate - Public endpoints work WITHOUT Authorization header (200).
      
      ADMIN LEADS CRM ENDPOINTS (Bearer Auth Required):
      6. ✅ GET /api/admin/leads - List all leads with total count. Ravi Kumar present with status='new'.
      7. ✅ Filter by status=new - Returns only new leads, Ravi Kumar included.
      8. ✅ Search q=ravi - Full-text search working across name/email/phone/interest.
      9. ✅ GET /api/admin/leads/stats - Returns {total, by_status, statuses}. All 5 statuses present.
      10. ✅ GET /api/admin/leads/{lead_id} - Returns {lead, conversation}. Conversation linked with 4 messages.
      11. ✅ PATCH /api/admin/leads/{lead_id} - Valid update (status='contacted', notes) working.
      12. ✅ Invalid status update - PATCH with status='foo' correctly rejected with 400.
      13. ✅ Auth gate - Admin endpoints WITHOUT token correctly return 401.
      
      REGRESSION TESTS:
      14. ✅ GET /api/admin/sources - Returns 3 sources (NIRF, AICTE, NAAC). All existing endpoints unaffected.
      15. ✅ GET /api/admin/nirf/overview - Returns 200. NIRF pipeline unaffected.
      
      CRITICAL VALIDATIONS:
      - Browser User-Agent header requirement: WORKING (anti-bot middleware correctly configured)
      - Ollama fallback behavior: CORRECT (returns 200 with fallback message, NOT 500)
      - Auth separation: CORRECT (public endpoints no auth, admin endpoints require JWT)
      - Lead capture workflow: COMPLETE (chat → lead submission → admin CRM → status updates)
      - Conversation linking: WORKING (leads linked to conversations via session_id)
      - Validation rules: ALL WORKING (name required, email OR phone required, email format)
      - Status workflow: VALIDATED (new→contacted→qualified→converted→closed)
      
      All backend functionality is working correctly. The assistant provides graceful fallback when Ollama is unavailable (expected in this sandbox). On production with Ollama running, it will return real LLM responses. Complete CRM workflow validated from lead capture to management.
