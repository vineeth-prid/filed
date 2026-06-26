#!/usr/bin/env python3
"""
Regression Test - Middleware Timeout Change
Tests that the path-aware timeout middleware doesn't break any endpoints.
LLM endpoints (/api/assistant, /api/insights) get 150s, others get 30s.
"""
import requests
import json
import time
import sys

# Backend URL from frontend/.env
BASE_URL = "https://data-intake-hub-4.preview.emergentagent.com/api"

# Browser User-Agent header (CRITICAL: anti-bot middleware blocks curl/tool UAs)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Content-Type": "application/json",
}

# Admin credentials from test_credentials.md
ADMIN_EMAIL = "vini.roks@gmail.com"
ADMIN_PASSWORD = "Admin!123@"

# Test results tracking
test_results = []
access_token = None


def log_test(test_name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = f"{status} - {test_name}"
    if details:
        result += f"\n    Details: {details}"
    print(result)
    test_results.append({"test": test_name, "passed": passed, "details": details})


def get_admin_token():
    """Get JWT token for admin endpoints"""
    global access_token
    print("\n=== Getting Admin JWT Token ===")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            headers=HEADERS,
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            access_token = data.get("access_token")
            log_test("Admin Login", True, f"Token obtained: {access_token[:20]}...")
            return access_token
        else:
            log_test("Admin Login", False, f"Status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        log_test("Admin Login", False, f"Exception: {str(e)}")
        return None


def test_1_assistant_chat():
    """Test 1: POST /api/assistant/chat - MUST return 200 (NOT 500) even with Ollama down"""
    print("\n=== Test 1: POST /api/assistant/chat (LLM endpoint, 150s timeout) ===")
    try:
        response = requests.post(
            f"{BASE_URL}/assistant/chat",
            headers=HEADERS,
            json={"session_id": "reg-1", "message": "hello"},
            timeout=30
        )
        
        if response.status_code == 500:
            log_test("Test 1: /api/assistant/chat", False, 
                    f"CRITICAL: Returns 500 (should be 200 with fallback). Response: {response.text}")
            return False
        
        if response.status_code != 200:
            log_test("Test 1: /api/assistant/chat", False, 
                    f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        
        # Validate response structure
        if "reply" not in data or not data["reply"]:
            log_test("Test 1: /api/assistant/chat", False, "Missing or empty 'reply' in response")
            return False
        
        # Check if it's a fallback (Ollama down) - this is EXPECTED
        llm_ok = data.get("llm_ok", True)
        if not llm_ok:
            details = f"✅ Graceful fallback working (Ollama down, EXPECTED). Reply: '{data['reply'][:80]}...'"
        else:
            details = f"LLM reply: '{data['reply'][:80]}...'"
        
        log_test("Test 1: /api/assistant/chat", True, details)
        return True
        
    except Exception as e:
        log_test("Test 1: /api/assistant/chat", False, f"Exception: {str(e)}")
        return False


def test_2_admin_sources():
    """Test 2: GET /api/admin/sources - returns NIRF + AICTE + NAAC"""
    print("\n=== Test 2: GET /api/admin/sources ===")
    
    if not access_token:
        log_test("Test 2: /api/admin/sources", False, "No access token")
        return False
    
    auth_headers = {**HEADERS, "Authorization": f"Bearer {access_token}"}
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/sources",
            headers=auth_headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 2: /api/admin/sources", False, 
                    f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        sources = data.get("sources", [])
        
        if len(sources) < 3:
            log_test("Test 2: /api/admin/sources", False, 
                    f"Expected 3 sources (NIRF+AICTE+NAAC), got {len(sources)}")
            return False
        
        source_types = [s.get("source_type") for s in sources]
        expected = ["NIRF", "AICTE", "NAAC"]
        for exp in expected:
            if exp not in source_types:
                log_test("Test 2: /api/admin/sources", False, f"Missing source type '{exp}'")
                return False
        
        log_test("Test 2: /api/admin/sources", True, f"All 3 sources present: {source_types}")
        return True
        
    except Exception as e:
        log_test("Test 2: /api/admin/sources", False, f"Exception: {str(e)}")
        return False


def test_3_nirf_overview():
    """Test 3: GET /api/admin/nirf/overview?year=2024&category=Engineering"""
    print("\n=== Test 3: GET /api/admin/nirf/overview ===")
    
    if not access_token:
        log_test("Test 3: /api/admin/nirf/overview", False, "No access token")
        return False
    
    auth_headers = {**HEADERS, "Authorization": f"Bearer {access_token}"}
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/nirf/overview?year=2024&category=Engineering",
            headers=auth_headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 3: /api/admin/nirf/overview", False, 
                    f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        
        # Check required keys
        required_keys = ["institutions", "downloaded", "extractions", "years_tracked"]
        missing_keys = [k for k in required_keys if k not in data]
        
        if missing_keys:
            log_test("Test 3: /api/admin/nirf/overview", False, 
                    f"Missing required keys: {missing_keys}")
            return False
        
        log_test("Test 3: /api/admin/nirf/overview", True, 
                f"All required keys present. institutions={data['institutions']}, "
                f"downloaded={data['downloaded']}, extractions={data['extractions']}, "
                f"years_tracked={data['years_tracked']}")
        return True
        
    except Exception as e:
        log_test("Test 3: /api/admin/nirf/overview", False, f"Exception: {str(e)}")
        return False


def test_4_nirf_sync():
    """Test 4: POST /api/admin/nirf/sync with extra fields (mode, state) - should accept/ignore"""
    print("\n=== Test 4: POST /api/admin/nirf/sync (with extra fields) ===")
    
    if not access_token:
        log_test("Test 4: /api/admin/nirf/sync", False, "No access token")
        return False
    
    auth_headers = {**HEADERS, "Authorization": f"Bearer {access_token}"}
    
    try:
        # POST with extra fields that should be ignored (Pydantic ignores extras)
        response = requests.post(
            f"{BASE_URL}/admin/nirf/sync",
            headers=auth_headers,
            json={
                "year": 2024,
                "category": "Engineering",
                "limit": 3,
                "mode": "full",      # Extra field - should be ignored
                "state": "ALL"       # Extra field - should be ignored
            },
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 4: /api/admin/nirf/sync", False, 
                    f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        
        if "job_id" not in data or "status" not in data:
            log_test("Test 4: /api/admin/nirf/sync", False, 
                    f"Missing job_id or status in response: {data}")
            return False
        
        job_id = data["job_id"]
        
        log_test("Test 4: /api/admin/nirf/sync", True, 
                f"Sync started. job_id={job_id}, status={data['status']}")
        
        # Poll the job once or twice
        print("\n    Polling job status...")
        time.sleep(2)
        
        poll_response = requests.get(
            f"{BASE_URL}/admin/nirf/jobs/{job_id}",
            headers=auth_headers,
            timeout=30
        )
        
        if poll_response.status_code != 200:
            log_test("Test 4: Poll /api/admin/nirf/jobs/{job_id}", False, 
                    f"Expected 200, got {poll_response.status_code}")
            return False
        
        job_data = poll_response.json()
        
        if "id" not in job_data or "status" not in job_data:
            log_test("Test 4: Poll /api/admin/nirf/jobs/{job_id}", False, 
                    f"Invalid job document: {job_data}")
            return False
        
        log_test("Test 4: Poll /api/admin/nirf/jobs/{job_id}", True, 
                f"Job exists. status={job_data['status']}")
        
        return True
        
    except Exception as e:
        log_test("Test 4: /api/admin/nirf/sync", False, f"Exception: {str(e)}")
        return False


def test_5_nirf_jobs_and_documents():
    """Test 5: GET /api/admin/nirf/jobs?limit=5 and GET /api/admin/nirf/documents"""
    print("\n=== Test 5: GET /api/admin/nirf/jobs and /documents ===")
    
    if not access_token:
        log_test("Test 5: /api/admin/nirf/jobs", False, "No access token")
        return False
    
    auth_headers = {**HEADERS, "Authorization": f"Bearer {access_token}"}
    
    # 5a: GET /api/admin/nirf/jobs?limit=5
    try:
        response = requests.get(
            f"{BASE_URL}/admin/nirf/jobs?limit=5",
            headers=auth_headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 5a: /api/admin/nirf/jobs", False, 
                    f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        
        if not isinstance(data, list):
            log_test("Test 5a: /api/admin/nirf/jobs", False, 
                    f"Expected list, got {type(data)}")
            return False
        
        log_test("Test 5a: /api/admin/nirf/jobs", True, f"Returns list with {len(data)} jobs")
        
    except Exception as e:
        log_test("Test 5a: /api/admin/nirf/jobs", False, f"Exception: {str(e)}")
        return False
    
    # 5b: GET /api/admin/nirf/documents?year=2024&category=Engineering
    try:
        response = requests.get(
            f"{BASE_URL}/admin/nirf/documents?year=2024&category=Engineering",
            headers=auth_headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 5b: /api/admin/nirf/documents", False, 
                    f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        
        if "documents" not in data or "counts" not in data:
            log_test("Test 5b: /api/admin/nirf/documents", False, 
                    f"Missing documents or counts in response")
            return False
        
        log_test("Test 5b: /api/admin/nirf/documents", True, 
                f"documents={len(data['documents'])}, counts={data['counts']}")
        return True
        
    except Exception as e:
        log_test("Test 5b: /api/admin/nirf/documents", False, f"Exception: {str(e)}")
        return False


def test_6_leads_and_monitoring():
    """Test 6: GET /api/admin/leads and GET /api/admin/monitoring"""
    print("\n=== Test 6: GET /api/admin/leads and /monitoring ===")
    
    if not access_token:
        log_test("Test 6: /api/admin/leads", False, "No access token")
        return False
    
    auth_headers = {**HEADERS, "Authorization": f"Bearer {access_token}"}
    
    # 6a: GET /api/admin/leads
    try:
        response = requests.get(
            f"{BASE_URL}/admin/leads",
            headers=auth_headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 6a: /api/admin/leads", False, 
                    f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        
        if "leads" not in data or "total" not in data:
            log_test("Test 6a: /api/admin/leads", False, 
                    f"Missing leads or total in response")
            return False
        
        log_test("Test 6a: /api/admin/leads", True, f"total={data['total']}")
        
    except Exception as e:
        log_test("Test 6a: /api/admin/leads", False, f"Exception: {str(e)}")
        return False
    
    # 6b: GET /api/admin/monitoring
    try:
        response = requests.get(
            f"{BASE_URL}/admin/monitoring",
            headers=auth_headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 6b: /api/admin/monitoring", False, 
                    f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        
        # Check for expected keys
        expected_keys = ["sources", "total_runs", "by_source"]
        missing_keys = [k for k in expected_keys if k not in data]
        
        if missing_keys:
            log_test("Test 6b: /api/admin/monitoring", False, 
                    f"Missing keys: {missing_keys}")
            return False
        
        log_test("Test 6b: /api/admin/monitoring", True, 
                f"sources={data['sources']}, total_runs={data['total_runs']}")
        return True
        
    except Exception as e:
        log_test("Test 6b: /api/admin/monitoring", False, f"Exception: {str(e)}")
        return False


def test_7_aicte_overview():
    """Test 7: GET /api/admin/aicte/overview (fast endpoint, 30s timeout)"""
    print("\n=== Test 7: GET /api/admin/aicte/overview (fast endpoint, 30s timeout) ===")
    
    if not access_token:
        log_test("Test 7: /api/admin/aicte/overview", False, "No access token")
        return False
    
    auth_headers = {**HEADERS, "Authorization": f"Bearer {access_token}"}
    
    try:
        start_time = time.time()
        response = requests.get(
            f"{BASE_URL}/admin/aicte/overview",
            headers=auth_headers,
            timeout=30
        )
        elapsed = time.time() - start_time
        
        if response.status_code != 200:
            log_test("Test 7: /api/admin/aicte/overview", False, 
                    f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        
        # Check for expected keys
        expected_keys = ["endpoints", "records_imported", "raw_payloads", "academic_years", "categories"]
        missing_keys = [k for k in expected_keys if k not in data]
        
        if missing_keys:
            log_test("Test 7: /api/admin/aicte/overview", False, 
                    f"Missing keys: {missing_keys}")
            return False
        
        log_test("Test 7: /api/admin/aicte/overview", True, 
                f"Fast endpoint working. Response time: {elapsed:.2f}s (under 30s budget). "
                f"endpoints={data['endpoints']}, records_imported={data['records_imported']}")
        return True
        
    except Exception as e:
        log_test("Test 7: /api/admin/aicte/overview", False, f"Exception: {str(e)}")
        return False


def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("REGRESSION TEST SUMMARY - Middleware Timeout Change")
    print("="*80)
    
    passed = sum(1 for r in test_results if r["passed"])
    total = len(test_results)
    
    print(f"\nTotal Tests: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {total - passed}")
    print(f"Success Rate: {(passed/total*100):.1f}%")
    
    if total - passed > 0:
        print("\n❌ FAILED TESTS:")
        for r in test_results:
            if not r["passed"]:
                print(f"  - {r['test']}")
                if r["details"]:
                    print(f"    {r['details']}")
    else:
        print("\n✅ ALL TESTS PASSED - No breakage from middleware change")
    
    print("\n" + "="*80)
    
    return passed == total


def main():
    """Run all regression tests"""
    print("="*80)
    print("Regression Test - Middleware Timeout Change")
    print("Context: Request-timeout middleware made path-aware")
    print("LLM endpoints (/api/assistant, /api/insights) get 150s, others get 30s")
    print("="*80)
    print(f"Backend URL: {BASE_URL}")
    print(f"User-Agent: {HEADERS['User-Agent'][:80]}...")
    print("="*80)
    
    # Get admin token first
    if not get_admin_token():
        print("\n❌ CRITICAL: Failed to get admin token. Cannot proceed with admin tests.")
        sys.exit(1)
    
    # Run tests in sequence
    test_1_assistant_chat()
    test_2_admin_sources()
    test_3_nirf_overview()
    test_4_nirf_sync()
    test_5_nirf_jobs_and_documents()
    test_6_leads_and_monitoring()
    test_7_aicte_overview()
    
    # Print summary
    all_passed = print_summary()
    
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
