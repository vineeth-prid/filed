#!/usr/bin/env python3
"""
Backend API Testing for Filed Platform - Support/Admissions Assistant + Leads CRM
Tests the NEW assistant and leads management features.
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
lead_id = None
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


def test_1_public_chat():
    """Test 1: PUBLIC chat (no auth) - first message"""
    print("\n=== Test 1: PUBLIC Chat (No Auth) ===")
    try:
        response = requests.post(
            f"{BASE_URL}/assistant/chat",
            headers=HEADERS,
            json={
                "session_id": "test-sess-1",
                "message": "I need admission help for engineering"
            },
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 1: PUBLIC chat", False, f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        
        # Validate response structure
        if "session_id" not in data:
            log_test("Test 1: PUBLIC chat", False, "Missing 'session_id' in response")
            return False
        
        if data["session_id"] != "test-sess-1":
            log_test("Test 1: PUBLIC chat", False, f"session_id mismatch: expected 'test-sess-1', got '{data['session_id']}'")
            return False
        
        if "reply" not in data or not data["reply"]:
            log_test("Test 1: PUBLIC chat", False, "Missing or empty 'reply' in response")
            return False
        
        if "suggest_lead" not in data:
            log_test("Test 1: PUBLIC chat", False, "Missing 'suggest_lead' in response")
            return False
        
        # Check if it's a fallback (Ollama down) - this is EXPECTED
        llm_ok = data.get("llm_ok", True)
        if not llm_ok:
            details = f"Fallback reply (Ollama down, EXPECTED): '{data['reply'][:100]}...', suggest_lead={data['suggest_lead']}"
        else:
            details = f"LLM reply: '{data['reply'][:100]}...', suggest_lead={data['suggest_lead']}"
        
        log_test("Test 1: PUBLIC chat", True, details)
        return True
        
    except Exception as e:
        log_test("Test 1: PUBLIC chat", False, f"Exception: {str(e)}")
        return False


def test_2_multi_turn():
    """Test 2: Multi-turn persistence - same session"""
    print("\n=== Test 2: Multi-turn Persistence ===")
    try:
        response = requests.post(
            f"{BASE_URL}/assistant/chat",
            headers=HEADERS,
            json={
                "session_id": "test-sess-1",
                "message": "What about fewer fees options?"
            },
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 2: Multi-turn persistence", False, f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        
        if data.get("session_id") != "test-sess-1":
            log_test("Test 2: Multi-turn persistence", False, f"session_id mismatch")
            return False
        
        if not data.get("reply"):
            log_test("Test 2: Multi-turn persistence", False, "Empty reply")
            return False
        
        log_test("Test 2: Multi-turn persistence", True, f"Reply: '{data['reply'][:80]}...'")
        return True
        
    except Exception as e:
        log_test("Test 2: Multi-turn persistence", False, f"Exception: {str(e)}")
        return False


def test_3_lead_capture():
    """Test 3: PUBLIC lead capture (no auth) + validation"""
    global lead_id
    print("\n=== Test 3: PUBLIC Lead Capture + Validation ===")
    
    # 3a: Valid lead submission
    print("\n3a: Valid lead submission")
    try:
        response = requests.post(
            f"{BASE_URL}/assistant/lead",
            headers=HEADERS,
            json={
                "session_id": "test-sess-1",
                "name": "Ravi Kumar",
                "email": "ravi@example.com",
                "phone": "9876543210",
                "interest": "B.Tech CSE",
                "message": "please call me"
            },
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 3a: Valid lead", False, f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        
        if not data.get("ok"):
            log_test("Test 3a: Valid lead", False, f"ok=false: {data.get('error')}")
            return False
        
        if "lead_id" not in data:
            log_test("Test 3a: Valid lead", False, "Missing 'lead_id' in response")
            return False
        
        lead_id = data["lead_id"]
        log_test("Test 3a: Valid lead", True, f"lead_id={lead_id}")
        
    except Exception as e:
        log_test("Test 3a: Valid lead", False, f"Exception: {str(e)}")
        return False
    
    # 3b: Missing name (should return 400)
    print("\n3b: Validation - missing name")
    try:
        response = requests.post(
            f"{BASE_URL}/assistant/lead",
            headers=HEADERS,
            json={"name": "", "email": "a@b.com"},
            timeout=30
        )
        
        if response.status_code != 400:
            log_test("Test 3b: Missing name validation", False, f"Expected 400, got {response.status_code}")
            return False
        
        log_test("Test 3b: Missing name validation", True, "Correctly rejected with 400")
        
    except Exception as e:
        log_test("Test 3b: Missing name validation", False, f"Exception: {str(e)}")
        return False
    
    # 3c: No contact info (no email AND no phone - should return 400)
    print("\n3c: Validation - no contact info")
    try:
        response = requests.post(
            f"{BASE_URL}/assistant/lead",
            headers=HEADERS,
            json={"name": "NoContact"},
            timeout=30
        )
        
        if response.status_code != 400:
            log_test("Test 3c: No contact validation", False, f"Expected 400, got {response.status_code}")
            return False
        
        log_test("Test 3c: No contact validation", True, "Correctly rejected with 400")
        
    except Exception as e:
        log_test("Test 3c: No contact validation", False, f"Exception: {str(e)}")
        return False
    
    # 3d: Invalid email format (should return 400)
    print("\n3d: Validation - invalid email")
    try:
        response = requests.post(
            f"{BASE_URL}/assistant/lead",
            headers=HEADERS,
            json={"name": "BadEmail", "email": "not-an-email"},
            timeout=30
        )
        
        if response.status_code != 400:
            log_test("Test 3d: Invalid email validation", False, f"Expected 400, got {response.status_code}")
            return False
        
        log_test("Test 3d: Invalid email validation", True, "Correctly rejected with 400")
        return True
        
    except Exception as e:
        log_test("Test 3d: Invalid email validation", False, f"Exception: {str(e)}")
        return False


def test_4_admin_leads_list():
    """Test 4: ADMIN leads list (auth) with filters"""
    print("\n=== Test 4: ADMIN Leads List (Auth) ===")
    
    if not access_token:
        log_test("Test 4: Admin leads list", False, "No access token available")
        return False
    
    auth_headers = {**HEADERS, "Authorization": f"Bearer {access_token}"}
    
    # 4a: List all leads
    print("\n4a: List all leads")
    try:
        response = requests.get(
            f"{BASE_URL}/admin/leads",
            headers=auth_headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 4a: List all leads", False, f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        
        if "leads" not in data or "total" not in data:
            log_test("Test 4a: List all leads", False, "Missing 'leads' or 'total' in response")
            return False
        
        if data["total"] < 1:
            log_test("Test 4a: List all leads", False, f"Expected total>=1, got {data['total']}")
            return False
        
        # Check if Ravi Kumar is present
        ravi_found = any(lead.get("name") == "Ravi Kumar" for lead in data["leads"])
        if not ravi_found:
            log_test("Test 4a: List all leads", False, "Ravi Kumar not found in leads list")
            return False
        
        # Check if Ravi has status "new"
        ravi_lead = next((lead for lead in data["leads"] if lead.get("name") == "Ravi Kumar"), None)
        if ravi_lead.get("status") != "new":
            log_test("Test 4a: List all leads", False, f"Ravi Kumar status is '{ravi_lead.get('status')}', expected 'new'")
            return False
        
        log_test("Test 4a: List all leads", True, f"total={data['total']}, Ravi Kumar found with status='new'")
        
    except Exception as e:
        log_test("Test 4a: List all leads", False, f"Exception: {str(e)}")
        return False
    
    # 4b: Filter by status=new
    print("\n4b: Filter by status=new")
    try:
        response = requests.get(
            f"{BASE_URL}/admin/leads?status=new",
            headers=auth_headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 4b: Filter status=new", False, f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        ravi_found = any(lead.get("name") == "Ravi Kumar" for lead in data["leads"])
        
        if not ravi_found:
            log_test("Test 4b: Filter status=new", False, "Ravi Kumar not in status=new results")
            return False
        
        log_test("Test 4b: Filter status=new", True, f"Ravi Kumar found in {len(data['leads'])} new leads")
        
    except Exception as e:
        log_test("Test 4b: Filter status=new", False, f"Exception: {str(e)}")
        return False
    
    # 4c: Search by name (q=ravi)
    print("\n4c: Search q=ravi")
    try:
        response = requests.get(
            f"{BASE_URL}/admin/leads?q=ravi",
            headers=auth_headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 4c: Search q=ravi", False, f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        ravi_found = any(lead.get("name") == "Ravi Kumar" for lead in data["leads"])
        
        if not ravi_found:
            log_test("Test 4c: Search q=ravi", False, "Ravi Kumar not in search results")
            return False
        
        log_test("Test 4c: Search q=ravi", True, f"Ravi Kumar found in {len(data['leads'])} results")
        return True
        
    except Exception as e:
        log_test("Test 4c: Search q=ravi", False, f"Exception: {str(e)}")
        return False


def test_5_admin_stats():
    """Test 5: ADMIN stats (auth)"""
    print("\n=== Test 5: ADMIN Lead Stats (Auth) ===")
    
    if not access_token:
        log_test("Test 5: Admin stats", False, "No access token available")
        return False
    
    auth_headers = {**HEADERS, "Authorization": f"Bearer {access_token}"}
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/leads/stats",
            headers=auth_headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 5: Admin stats", False, f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        
        # Validate structure
        required_keys = ["total", "by_status", "statuses"]
        for key in required_keys:
            if key not in data:
                log_test("Test 5: Admin stats", False, f"Missing '{key}' in response")
                return False
        
        if data["total"] < 1:
            log_test("Test 5: Admin stats", False, f"Expected total>=1, got {data['total']}")
            return False
        
        # Check by_status has all required statuses
        expected_statuses = ["new", "contacted", "qualified", "converted", "closed"]
        for status in expected_statuses:
            if status not in data["by_status"]:
                log_test("Test 5: Admin stats", False, f"Missing status '{status}' in by_status")
                return False
        
        log_test("Test 5: Admin stats", True, f"total={data['total']}, by_status={data['by_status']}")
        return True
        
    except Exception as e:
        log_test("Test 5: Admin stats", False, f"Exception: {str(e)}")
        return False


def test_6_admin_lead_detail():
    """Test 6: ADMIN lead detail (auth) - includes conversation"""
    print("\n=== Test 6: ADMIN Lead Detail (Auth) ===")
    
    if not access_token:
        log_test("Test 6: Admin lead detail", False, "No access token available")
        return False
    
    if not lead_id:
        log_test("Test 6: Admin lead detail", False, "No lead_id available from Test 3")
        return False
    
    auth_headers = {**HEADERS, "Authorization": f"Bearer {access_token}"}
    
    try:
        response = requests.get(
            f"{BASE_URL}/admin/leads/{lead_id}",
            headers=auth_headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 6: Admin lead detail", False, f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        
        # Validate structure
        if "lead" not in data:
            log_test("Test 6: Admin lead detail", False, "Missing 'lead' in response")
            return False
        
        if "conversation" not in data:
            log_test("Test 6: Admin lead detail", False, "Missing 'conversation' in response")
            return False
        
        lead = data["lead"]
        if lead.get("name") != "Ravi Kumar":
            log_test("Test 6: Admin lead detail", False, f"Expected name='Ravi Kumar', got '{lead.get('name')}'")
            return False
        
        # Check conversation has messages from test 1 and 2
        conversation = data["conversation"]
        if conversation:
            messages = conversation.get("messages", [])
            if len(messages) < 2:
                log_test("Test 6: Admin lead detail", False, f"Expected at least 2 messages (from tests 1-2), got {len(messages)}")
                return False
            
            # Check if session_id matches
            if conversation.get("id") != "test-sess-1":
                log_test("Test 6: Admin lead detail", False, f"Conversation session_id mismatch: expected 'test-sess-1', got '{conversation.get('id')}'")
                return False
            
            log_test("Test 6: Admin lead detail", True, f"Lead: {lead['name']}, Conversation: {len(messages)} messages")
        else:
            log_test("Test 6: Admin lead detail", False, "Conversation is None/empty")
            return False
        
        return True
        
    except Exception as e:
        log_test("Test 6: Admin lead detail", False, f"Exception: {str(e)}")
        return False


def test_7_admin_update_lead():
    """Test 7: ADMIN update lead (auth) - valid and invalid status"""
    print("\n=== Test 7: ADMIN Update Lead (Auth) ===")
    
    if not access_token:
        log_test("Test 7: Admin update lead", False, "No access token available")
        return False
    
    if not lead_id:
        log_test("Test 7: Admin update lead", False, "No lead_id available from Test 3")
        return False
    
    auth_headers = {**HEADERS, "Authorization": f"Bearer {access_token}"}
    
    # 7a: Valid update (status=contacted, notes)
    print("\n7a: Valid update - status=contacted")
    try:
        response = requests.patch(
            f"{BASE_URL}/admin/leads/{lead_id}",
            headers=auth_headers,
            json={"status": "contacted", "notes": "called the student"},
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 7a: Valid update", False, f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        
        if data.get("status") != "contacted":
            log_test("Test 7a: Valid update", False, f"Expected status='contacted', got '{data.get('status')}'")
            return False
        
        if data.get("notes") != "called the student":
            log_test("Test 7a: Valid update", False, f"Expected notes='called the student', got '{data.get('notes')}'")
            return False
        
        log_test("Test 7a: Valid update", True, f"status={data['status']}, notes={data['notes']}")
        
    except Exception as e:
        log_test("Test 7a: Valid update", False, f"Exception: {str(e)}")
        return False
    
    # 7b: Invalid status (should return 400)
    print("\n7b: Invalid status - status=foo")
    try:
        response = requests.patch(
            f"{BASE_URL}/admin/leads/{lead_id}",
            headers=auth_headers,
            json={"status": "foo"},
            timeout=30
        )
        
        if response.status_code != 400:
            log_test("Test 7b: Invalid status", False, f"Expected 400, got {response.status_code}")
            return False
        
        log_test("Test 7b: Invalid status", True, "Correctly rejected with 400")
        return True
        
    except Exception as e:
        log_test("Test 7b: Invalid status", False, f"Exception: {str(e)}")
        return False


def test_8_auth_gate():
    """Test 8: Auth gate - admin endpoints require auth, public endpoints don't"""
    print("\n=== Test 8: Auth Gate ===")
    
    # 8a: Admin endpoint without auth (should return 401)
    print("\n8a: Admin endpoint without auth")
    try:
        response = requests.get(
            f"{BASE_URL}/admin/leads",
            headers=HEADERS,  # No Authorization header
            timeout=30
        )
        
        if response.status_code != 401:
            log_test("Test 8a: Admin without auth", False, f"Expected 401, got {response.status_code}")
            return False
        
        log_test("Test 8a: Admin without auth", True, "Correctly rejected with 401")
        
    except Exception as e:
        log_test("Test 8a: Admin without auth", False, f"Exception: {str(e)}")
        return False
    
    # 8b: Public chat endpoint without auth (should return 200)
    print("\n8b: Public chat without auth")
    try:
        response = requests.post(
            f"{BASE_URL}/assistant/chat",
            headers=HEADERS,  # No Authorization header
            json={"session_id": "test-auth-gate", "message": "test"},
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 8b: Public chat without auth", False, f"Expected 200, got {response.status_code}")
            return False
        
        log_test("Test 8b: Public chat without auth", True, "Works without auth (200)")
        
    except Exception as e:
        log_test("Test 8b: Public chat without auth", False, f"Exception: {str(e)}")
        return False
    
    # 8c: Public lead endpoint without auth (should return 200)
    print("\n8c: Public lead without auth")
    try:
        response = requests.post(
            f"{BASE_URL}/assistant/lead",
            headers=HEADERS,  # No Authorization header
            json={"name": "Test Auth Gate", "email": "test@example.com"},
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 8c: Public lead without auth", False, f"Expected 200, got {response.status_code}")
            return False
        
        log_test("Test 8c: Public lead without auth", True, "Works without auth (200)")
        return True
        
    except Exception as e:
        log_test("Test 8c: Public lead without auth", False, f"Exception: {str(e)}")
        return False


def test_9_regression():
    """Test 9: Regression - existing endpoints still work"""
    print("\n=== Test 9: Regression Tests ===")
    
    if not access_token:
        log_test("Test 9: Regression", False, "No access token available")
        return False
    
    auth_headers = {**HEADERS, "Authorization": f"Bearer {access_token}"}
    
    # 9a: GET /api/admin/sources (should return NIRF + AICTE + NAAC)
    print("\n9a: GET /api/admin/sources")
    try:
        response = requests.get(
            f"{BASE_URL}/admin/sources",
            headers=auth_headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 9a: Sources list", False, f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        sources = data.get("sources", [])
        
        if len(sources) < 3:
            log_test("Test 9a: Sources list", False, f"Expected 3 sources (NIRF+AICTE+NAAC), got {len(sources)}")
            return False
        
        source_types = [s.get("source_type") for s in sources]
        expected = ["NIRF", "AICTE", "NAAC"]
        for exp in expected:
            if exp not in source_types:
                log_test("Test 9a: Sources list", False, f"Missing source type '{exp}'")
                return False
        
        log_test("Test 9a: Sources list", True, f"All 3 sources present: {source_types}")
        
    except Exception as e:
        log_test("Test 9a: Sources list", False, f"Exception: {str(e)}")
        return False
    
    # 9b: GET /api/admin/nirf/overview
    print("\n9b: GET /api/admin/nirf/overview")
    try:
        response = requests.get(
            f"{BASE_URL}/admin/nirf/overview",
            headers=auth_headers,
            timeout=30
        )
        
        if response.status_code != 200:
            log_test("Test 9b: NIRF overview", False, f"Expected 200, got {response.status_code}")
            return False
        
        log_test("Test 9b: NIRF overview", True, "NIRF endpoint still working")
        return True
        
    except Exception as e:
        log_test("Test 9b: NIRF overview", False, f"Exception: {str(e)}")
        return False


def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
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
    
    print("\n" + "="*80)
    
    return passed == total


def main():
    """Run all tests in sequence"""
    print("="*80)
    print("Filed Platform - Support/Admissions Assistant + Leads CRM Testing")
    print("="*80)
    print(f"Backend URL: {BASE_URL}")
    print(f"User-Agent: {HEADERS['User-Agent'][:80]}...")
    print("="*80)
    
    # Get admin token first
    if not get_admin_token():
        print("\n❌ CRITICAL: Failed to get admin token. Cannot proceed with admin tests.")
        sys.exit(1)
    
    # Run tests in sequence
    test_1_public_chat()
    test_2_multi_turn()
    test_3_lead_capture()
    test_4_admin_leads_list()
    test_5_admin_stats()
    test_6_admin_lead_detail()
    test_7_admin_update_lead()
    test_8_auth_gate()
    test_9_regression()
    
    # Print summary
    all_passed = print_summary()
    
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
