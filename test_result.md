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

frontend:
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
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "Data Sources Management Layer (data_sources + sync_runs, connector registry, monitoring)"
    - "AICTE Connector (fetch JSON -> raw payload -> normalize -> validate -> publish)"
    - "Existing NIRF engine unchanged (regression)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -message: |
      Please test the NEW backend only (do NOT modify NIRF). Admin auth required (Bearer) — creds in /app/memory/test_credentials.md (vini.roks@gmail.com / Admin!123@). All routes under /api/admin/* need the token.
      Focus:
      1) GET /api/admin/sources returns NIRF + AICTE with records/years_available/connector_type/status.
      2) POST /api/admin/aicte/sync {academic_year:"2025-2026"} -> returns run_id; poll GET /api/admin/sync-runs/{run_id} until Completed. Expect data_origin="simulated" (AICTE is geo-blocked from this infra) and records_processed > 0.
      3) After AICTE sync: GET /api/admin/aicte/records?academic_year=2025-2026 returns normalized records with fields (colid, collegename, state, course_name, approved_intake, special_intake, source_category). GET /api/admin/aicte/payloads + /payloads/{id} return immutable raw JSON. GET /api/admin/aicte/overview shows counts.
      4) POST /api/admin/sources/{nirf_id}/sync -> read-only snapshot Completed; verify NIRF collections counts unchanged before/after (regression). Existing /api/admin/nirf/overview still works.
      5) GET /api/admin/monitoring returns by_source + recent_runs.
      6) Re-running AICTE sync for same year should REPLACE normalized records (no duplicate growth) while raw payloads accumulate.
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
