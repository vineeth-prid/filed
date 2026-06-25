"""
Backend API Testing for NAAC Connector Framework
Tests the NAAC connector integration with the Data Sources Management Layer.
"""
import requests
import time
import json

# Configuration
BACKEND_URL = "https://data-intake-hub-4.preview.emergentagent.com/api"
ADMIN_EMAIL = "vini.roks@gmail.com"
ADMIN_PASSWORD = "Admin!123@"

# IMPORTANT: Browser-like User-Agent required to bypass anti-bot middleware
HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
}

def log_test(test_name, status, details=""):
    """Log test results"""
    symbol = "✅" if status == "PASS" else "❌"
    print(f"\n{symbol} {test_name}")
    if details:
        print(f"   {details}")

def authenticate():
    """Authenticate and get access token"""
    print("\n" + "="*80)
    print("AUTHENTICATING...")
    print("="*80)
    
    response = requests.post(
        f"{BACKEND_URL}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers=HEADERS
    )
    
    if response.status_code == 200:
        token = response.json().get("access_token")
        log_test("Authentication", "PASS", f"Token obtained")
        return token
    else:
        log_test("Authentication", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
        return None

def test_sources_list(token):
    """Test 1: GET /api/admin/sources - must include NAAC"""
    print("\n" + "="*80)
    print("TEST 1: Data Sources List (must include NAAC)")
    print("="*80)
    
    headers = {**HEADERS, "Authorization": f"Bearer {token}"}
    response = requests.get(f"{BACKEND_URL}/admin/sources", headers=headers)
    
    if response.status_code != 200:
        log_test("GET /api/admin/sources", "FAIL", f"Status: {response.status_code}")
        return False
    
    data = response.json()
    sources = data.get("sources", [])
    
    # Check for all three sources
    source_types = [s.get("source_type") for s in sources]
    
    if "NIRF" not in source_types:
        log_test("GET /api/admin/sources", "FAIL", "NIRF source missing")
        return False
    
    if "AICTE" not in source_types:
        log_test("GET /api/admin/sources", "FAIL", "AICTE source missing")
        return False
    
    if "NAAC" not in source_types:
        log_test("GET /api/admin/sources", "FAIL", "NAAC source missing")
        return False
    
    # Find NAAC source and validate fields
    naac_source = next((s for s in sources if s.get("source_type") == "NAAC"), None)
    
    if not naac_source:
        log_test("GET /api/admin/sources", "FAIL", "NAAC source not found")
        return False
    
    # Validate NAAC source fields
    required_fields = ["id", "source_name", "source_type", "connector_type", "status", "records", "years_available"]
    missing_fields = [f for f in required_fields if f not in naac_source]
    
    if missing_fields:
        log_test("GET /api/admin/sources", "FAIL", f"NAAC source missing fields: {missing_fields}")
        return False
    
    if naac_source.get("connector_type") != "hybrid_web":
        log_test("GET /api/admin/sources", "FAIL", f"NAAC connector_type is '{naac_source.get('connector_type')}', expected 'hybrid_web'")
        return False
    
    log_test("GET /api/admin/sources", "PASS", 
             f"Found 3 sources: NIRF, AICTE, NAAC. NAAC connector_type=hybrid_web, status={naac_source.get('status')}")
    return True

def test_naac_overview(token):
    """Test 2: GET /api/admin/naac/overview"""
    print("\n" + "="*80)
    print("TEST 2: NAAC Overview")
    print("="*80)
    
    headers = {**HEADERS, "Authorization": f"Bearer {token}"}
    response = requests.get(f"{BACKEND_URL}/admin/naac/overview", headers=headers)
    
    if response.status_code != 200:
        log_test("GET /api/admin/naac/overview", "FAIL", f"Status: {response.status_code}")
        return False
    
    data = response.json()
    
    # Check required keys
    required_keys = [
        "institutions", "assessments", "document_links", "pdfs_downloaded",
        "extraction_success", "extraction_failed", "raw_html", "raw_pdf",
        "states", "last_run", "monitoring"
    ]
    
    missing_keys = [k for k in required_keys if k not in data]
    
    if missing_keys:
        log_test("GET /api/admin/naac/overview", "FAIL", f"Missing keys: {missing_keys}")
        return False
    
    # Check monitoring object structure
    monitoring = data.get("monitoring", {})
    monitoring_keys = [
        "institutions_synced", "assessments_imported", "pdfs_downloaded",
        "extraction_success", "failed_downloads", "failed_parsing"
    ]
    
    missing_monitoring = [k for k in monitoring_keys if k not in monitoring]
    
    if missing_monitoring:
        log_test("GET /api/admin/naac/overview", "FAIL", f"Missing monitoring keys: {missing_monitoring}")
        return False
    
    log_test("GET /api/admin/naac/overview", "PASS", 
             f"institutions={data['institutions']}, assessments={data['assessments']}, states={len(data['states'])}")
    return True

def test_naac_sync_graceful_failure(token):
    """Test 3: POST /api/admin/naac/sync - expect graceful failure due to geo-block"""
    print("\n" + "="*80)
    print("TEST 3: NAAC Sync (expect graceful failure - geo-blocked)")
    print("="*80)
    
    headers = {**HEADERS, "Authorization": f"Bearer {token}"}
    
    # Trigger sync
    sync_payload = {
        "mode": "manual",
        "limit": 3,
        "download_pdfs": False,
        "extract_pdfs": False
    }
    
    response = requests.post(
        f"{BACKEND_URL}/admin/naac/sync",
        json=sync_payload,
        headers=headers
    )
    
    if response.status_code != 200:
        log_test("POST /api/admin/naac/sync", "FAIL", f"Status: {response.status_code}")
        return None
    
    data = response.json()
    run_id = data.get("run_id")
    
    if not run_id:
        log_test("POST /api/admin/naac/sync", "FAIL", "No run_id returned")
        return None
    
    log_test("POST /api/admin/naac/sync", "PASS", f"run_id={run_id}, status={data.get('status')}")
    
    # Poll for completion
    print("\n   Polling sync run status...")
    max_polls = 20
    poll_interval = 2
    
    for i in range(max_polls):
        time.sleep(poll_interval)
        
        poll_response = requests.get(
            f"{BACKEND_URL}/admin/sync-runs/{run_id}",
            headers=headers
        )
        
        if poll_response.status_code != 200:
            log_test("GET /api/admin/sync-runs/{run_id}", "FAIL", f"Status: {poll_response.status_code}")
            return None
        
        run_data = poll_response.json()
        status = run_data.get("status")
        
        print(f"   Poll {i+1}/{max_polls}: status={status}")
        
        if status in ["Completed", "Failed", "Interrupted"]:
            # Terminal state reached
            if status == "Failed":
                # This is EXPECTED due to geo-block
                errors = run_data.get("errors", [])
                source_type = run_data.get("source_type")
                
                if source_type != "NAAC":
                    log_test("NAAC Sync Graceful Failure", "FAIL", f"source_type is '{source_type}', expected 'NAAC'")
                    return None
                
                if not errors:
                    log_test("NAAC Sync Graceful Failure", "FAIL", "status=Failed but errors list is empty")
                    return None
                
                log_test("NAAC Sync Graceful Failure", "PASS", 
                         f"status=Failed (EXPECTED - geo-blocked), source_type=NAAC, errors captured: {len(errors)} error(s)")
                return run_id
            
            elif status == "Completed":
                # Unexpected - should fail due to geo-block
                log_test("NAAC Sync Graceful Failure", "FAIL", 
                         "status=Completed (unexpected - should fail due to geo-block)")
                return None
            
            else:
                log_test("NAAC Sync Graceful Failure", "FAIL", f"Unexpected terminal status: {status}")
                return None
    
    log_test("NAAC Sync Graceful Failure", "FAIL", "Sync did not reach terminal state within timeout")
    return None

def test_naac_empty_endpoints(token):
    """Test 4: GET /api/admin/naac/* endpoints - should return valid empty structures"""
    print("\n" + "="*80)
    print("TEST 4: NAAC Empty Data Endpoints")
    print("="*80)
    
    headers = {**HEADERS, "Authorization": f"Bearer {token}"}
    all_pass = True
    
    # Test institutions
    response = requests.get(f"{BACKEND_URL}/admin/naac/institutions", headers=headers)
    if response.status_code != 200:
        log_test("GET /api/admin/naac/institutions", "FAIL", f"Status: {response.status_code}")
        all_pass = False
    else:
        data = response.json()
        if "institutions" not in data or "total" not in data:
            log_test("GET /api/admin/naac/institutions", "FAIL", "Missing 'institutions' or 'total' key")
            all_pass = False
        else:
            log_test("GET /api/admin/naac/institutions", "PASS", f"total={data['total']}")
    
    # Test institutions with query
    response = requests.get(f"{BACKEND_URL}/admin/naac/institutions?q=test", headers=headers)
    if response.status_code != 200:
        log_test("GET /api/admin/naac/institutions?q=test", "FAIL", f"Status: {response.status_code}")
        all_pass = False
    else:
        log_test("GET /api/admin/naac/institutions?q=test", "PASS", "Query parameter works")
    
    # Test assessments
    response = requests.get(f"{BACKEND_URL}/admin/naac/assessments", headers=headers)
    if response.status_code != 200:
        log_test("GET /api/admin/naac/assessments", "FAIL", f"Status: {response.status_code}")
        all_pass = False
    else:
        data = response.json()
        if "assessments" not in data or "total" not in data:
            log_test("GET /api/admin/naac/assessments", "FAIL", "Missing 'assessments' or 'total' key")
            all_pass = False
        else:
            log_test("GET /api/admin/naac/assessments", "PASS", f"total={data['total']}")
    
    # Test documents
    response = requests.get(f"{BACKEND_URL}/admin/naac/documents", headers=headers)
    if response.status_code != 200:
        log_test("GET /api/admin/naac/documents", "FAIL", f"Status: {response.status_code}")
        all_pass = False
    else:
        data = response.json()
        if "documents" not in data or "total" not in data:
            log_test("GET /api/admin/naac/documents", "FAIL", "Missing 'documents' or 'total' key")
            all_pass = False
        else:
            log_test("GET /api/admin/naac/documents", "PASS", f"total={data['total']}")
    
    # Test document-links
    response = requests.get(f"{BACKEND_URL}/admin/naac/document-links", headers=headers)
    if response.status_code != 200:
        log_test("GET /api/admin/naac/document-links", "FAIL", f"Status: {response.status_code}")
        all_pass = False
    else:
        data = response.json()
        if "document_links" not in data:
            log_test("GET /api/admin/naac/document-links", "FAIL", "Missing 'document_links' key")
            all_pass = False
        else:
            log_test("GET /api/admin/naac/document-links", "PASS", f"links={len(data['document_links'])}")
    
    return all_pass

def test_naac_single_institution_sync(token):
    """Test 5: Single-institution sync - also fails gracefully"""
    print("\n" + "="*80)
    print("TEST 5: NAAC Single-Institution Sync (expect graceful failure)")
    print("="*80)
    
    headers = {**HEADERS, "Authorization": f"Bearer {token}"}
    
    sync_payload = {
        "mode": "single",
        "hei_assessment_id": 16164,
        "status": 5,
        "download_pdfs": False,
        "extract_pdfs": False
    }
    
    response = requests.post(
        f"{BACKEND_URL}/admin/naac/sync",
        json=sync_payload,
        headers=headers
    )
    
    if response.status_code != 200:
        log_test("POST /api/admin/naac/sync (single)", "FAIL", f"Status: {response.status_code}")
        return False
    
    data = response.json()
    run_id = data.get("run_id")
    
    if not run_id:
        log_test("POST /api/admin/naac/sync (single)", "FAIL", "No run_id returned")
        return False
    
    log_test("POST /api/admin/naac/sync (single)", "PASS", f"run_id={run_id}")
    
    # Poll for completion
    print("\n   Polling single-institution sync...")
    max_polls = 20
    poll_interval = 2
    
    for i in range(max_polls):
        time.sleep(poll_interval)
        
        poll_response = requests.get(
            f"{BACKEND_URL}/admin/sync-runs/{run_id}",
            headers=headers
        )
        
        if poll_response.status_code != 200:
            log_test("Single-institution sync poll", "FAIL", f"Status: {poll_response.status_code}")
            return False
        
        run_data = poll_response.json()
        status = run_data.get("status")
        
        print(f"   Poll {i+1}/{max_polls}: status={status}")
        
        if status in ["Completed", "Failed", "Interrupted"]:
            if status == "Failed":
                log_test("Single-institution Sync Graceful Failure", "PASS", 
                         "status=Failed (EXPECTED - geo-blocked)")
                return True
            else:
                log_test("Single-institution Sync Graceful Failure", "FAIL", 
                         f"Unexpected status: {status}")
                return False
    
    log_test("Single-institution Sync Graceful Failure", "FAIL", "Did not reach terminal state")
    return False

def test_naac_schedule(token):
    """Test 6: Schedule configuration"""
    print("\n" + "="*80)
    print("TEST 6: NAAC Schedule Configuration")
    print("="*80)
    
    headers = {**HEADERS, "Authorization": f"Bearer {token}"}
    
    # GET default schedule
    response = requests.get(f"{BACKEND_URL}/admin/naac/schedule", headers=headers)
    
    if response.status_code != 200:
        log_test("GET /api/admin/naac/schedule", "FAIL", f"Status: {response.status_code}")
        return False
    
    data = response.json()
    
    # Check defaults
    if "enabled" not in data or "interval_hours" not in data:
        log_test("GET /api/admin/naac/schedule", "FAIL", "Missing 'enabled' or 'interval_hours'")
        return False
    
    log_test("GET /api/admin/naac/schedule", "PASS", 
             f"enabled={data.get('enabled')}, interval_hours={data.get('interval_hours')}")
    
    # PUT to enable schedule
    update_payload = {
        "enabled": True,
        "interval_hours": 12,
        "params": {
            "mode": "manual",
            "limit": 5
        }
    }
    
    response = requests.put(
        f"{BACKEND_URL}/admin/naac/schedule",
        json=update_payload,
        headers=headers
    )
    
    if response.status_code != 200:
        log_test("PUT /api/admin/naac/schedule (enable)", "FAIL", f"Status: {response.status_code}")
        return False
    
    data = response.json()
    
    if data.get("enabled") != True or data.get("interval_hours") != 12:
        log_test("PUT /api/admin/naac/schedule (enable)", "FAIL", 
                 f"Values not persisted: enabled={data.get('enabled')}, interval_hours={data.get('interval_hours')}")
        return False
    
    log_test("PUT /api/admin/naac/schedule (enable)", "PASS", "enabled=True, interval_hours=12")
    
    # GET again to confirm persistence
    response = requests.get(f"{BACKEND_URL}/admin/naac/schedule", headers=headers)
    
    if response.status_code != 200:
        log_test("GET /api/admin/naac/schedule (verify)", "FAIL", f"Status: {response.status_code}")
        return False
    
    data = response.json()
    
    if data.get("enabled") != True or data.get("interval_hours") != 12:
        log_test("GET /api/admin/naac/schedule (verify)", "FAIL", "Values not persisted")
        return False
    
    log_test("GET /api/admin/naac/schedule (verify)", "PASS", "Values persisted correctly")
    
    # PUT to disable schedule (important: leave disabled)
    disable_payload = {
        "enabled": False,
        "interval_hours": 24,
        "params": {}
    }
    
    response = requests.put(
        f"{BACKEND_URL}/admin/naac/schedule",
        json=disable_payload,
        headers=headers
    )
    
    if response.status_code != 200:
        log_test("PUT /api/admin/naac/schedule (disable)", "FAIL", f"Status: {response.status_code}")
        return False
    
    data = response.json()
    
    if data.get("enabled") != False:
        log_test("PUT /api/admin/naac/schedule (disable)", "FAIL", "Schedule not disabled")
        return False
    
    log_test("PUT /api/admin/naac/schedule (disable)", "PASS", "Schedule disabled successfully")
    
    return True

def test_monitoring_includes_naac(token):
    """Test 7: GET /api/admin/monitoring - should include NAAC"""
    print("\n" + "="*80)
    print("TEST 7: Monitoring includes NAAC")
    print("="*80)
    
    headers = {**HEADERS, "Authorization": f"Bearer {token}"}
    response = requests.get(f"{BACKEND_URL}/admin/monitoring", headers=headers)
    
    if response.status_code != 200:
        log_test("GET /api/admin/monitoring", "FAIL", f"Status: {response.status_code}")
        return False
    
    data = response.json()
    by_source = data.get("by_source", [])
    
    naac_entry = next((s for s in by_source if s.get("source_type") == "NAAC"), None)
    
    if not naac_entry:
        log_test("GET /api/admin/monitoring", "FAIL", "NAAC entry not found in by_source")
        return False
    
    log_test("GET /api/admin/monitoring", "PASS", 
             f"NAAC entry found: status={naac_entry.get('status')}, runs={naac_entry.get('runs')}")
    return True

def test_regression_nirf_aicte(token):
    """Test 8: REGRESSION - NIRF and AICTE still work"""
    print("\n" + "="*80)
    print("TEST 8: REGRESSION - NIRF and AICTE unaffected")
    print("="*80)
    
    headers = {**HEADERS, "Authorization": f"Bearer {token}"}
    all_pass = True
    
    # Test NIRF overview
    response = requests.get(f"{BACKEND_URL}/admin/nirf/overview", headers=headers)
    
    if response.status_code != 200:
        log_test("GET /api/admin/nirf/overview", "FAIL", f"Status: {response.status_code}")
        all_pass = False
    else:
        log_test("GET /api/admin/nirf/overview", "PASS", "NIRF overview still works")
    
    # Test AICTE sync
    sync_payload = {
        "academic_year": "2025-2026",
        "run_type": "manual"
    }
    
    response = requests.post(
        f"{BACKEND_URL}/admin/aicte/sync",
        json=sync_payload,
        headers=headers
    )
    
    if response.status_code != 200:
        log_test("POST /api/admin/aicte/sync", "FAIL", f"Status: {response.status_code}")
        all_pass = False
        return all_pass
    
    data = response.json()
    run_id = data.get("run_id")
    
    if not run_id:
        log_test("POST /api/admin/aicte/sync", "FAIL", "No run_id returned")
        all_pass = False
        return all_pass
    
    log_test("POST /api/admin/aicte/sync", "PASS", f"run_id={run_id}")
    
    # Poll AICTE sync
    print("\n   Polling AICTE sync...")
    max_polls = 15
    poll_interval = 2
    
    for i in range(max_polls):
        time.sleep(poll_interval)
        
        poll_response = requests.get(
            f"{BACKEND_URL}/admin/sync-runs/{run_id}",
            headers=headers
        )
        
        if poll_response.status_code != 200:
            log_test("AICTE sync poll", "FAIL", f"Status: {poll_response.status_code}")
            all_pass = False
            break
        
        run_data = poll_response.json()
        status = run_data.get("status")
        
        print(f"   Poll {i+1}/{max_polls}: status={status}")
        
        if status == "Completed":
            data_origin = run_data.get("data_origin")
            records = run_data.get("records_processed", 0)
            
            if data_origin != "simulated":
                log_test("AICTE Sync Regression", "FAIL", 
                         f"data_origin is '{data_origin}', expected 'simulated'")
                all_pass = False
            elif records <= 0:
                log_test("AICTE Sync Regression", "FAIL", 
                         f"records_processed={records}, expected > 0")
                all_pass = False
            else:
                log_test("AICTE Sync Regression", "PASS", 
                         f"status=Completed, data_origin=simulated, records={records}")
            break
        
        elif status in ["Failed", "Interrupted"]:
            log_test("AICTE Sync Regression", "FAIL", f"Unexpected status: {status}")
            all_pass = False
            break
    else:
        log_test("AICTE Sync Regression", "FAIL", "Did not complete within timeout")
        all_pass = False
    
    return all_pass

def test_auth_gate(token):
    """Test 9: Auth gate - requests without token should return 401"""
    print("\n" + "="*80)
    print("TEST 9: Auth Gate (401 without token)")
    print("="*80)
    
    # Request without Authorization header
    response = requests.get(
        f"{BACKEND_URL}/admin/naac/overview",
        headers=HEADERS  # No Authorization header
    )
    
    if response.status_code != 401:
        log_test("Auth Gate", "FAIL", f"Expected 401, got {response.status_code}")
        return False
    
    log_test("Auth Gate", "PASS", "Unauthorized request correctly rejected with 401")
    return True

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("NAAC CONNECTOR FRAMEWORK TESTING")
    print("="*80)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Admin Email: {ADMIN_EMAIL}")
    
    # Authenticate
    token = authenticate()
    if not token:
        print("\n❌ AUTHENTICATION FAILED - Cannot proceed with tests")
        return
    
    # Track results
    results = {}
    
    # Run tests
    results["Test 1: Sources List"] = test_sources_list(token)
    results["Test 2: NAAC Overview"] = test_naac_overview(token)
    results["Test 3: NAAC Sync Graceful Failure"] = test_naac_sync_graceful_failure(token) is not None
    results["Test 4: NAAC Empty Endpoints"] = test_naac_empty_endpoints(token)
    results["Test 5: Single-Institution Sync"] = test_naac_single_institution_sync(token)
    results["Test 6: Schedule Configuration"] = test_naac_schedule(token)
    results["Test 7: Monitoring includes NAAC"] = test_monitoring_includes_naac(token)
    results["Test 8: REGRESSION (NIRF + AICTE)"] = test_regression_nirf_aicte(token)
    results["Test 9: Auth Gate"] = test_auth_gate(token)
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        symbol = "✅" if result else "❌"
        print(f"{symbol} {test_name}")
    
    print("\n" + "="*80)
    print(f"TOTAL: {passed}/{total} tests passed ({passed*100//total}%)")
    print("="*80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")

if __name__ == "__main__":
    main()
