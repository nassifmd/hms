#!/usr/bin/env bash
# ==============================================================================
# HMS Smoke Test — quick health check for the Hospital Management System API
# Usage:  bash smoke-test.sh [base_url]
# Default base_url: http://localhost:3000/api/v1
# ==============================================================================

BASE="${1:-http://localhost:3000/api/v1}"
PASS=0
FAIL=0
SECONDS=0

green() { printf "  \033[32m✓\033[0m %s\n" "$1"; }
red()   { printf "  \033[31m✗\033[0m %s\n" "$1"; }
bold()  { printf "\033[1m%s\033[0m\n" "$1"; }

check() {
  local desc="$1" method="$2" path="$3" expected_code="$4" data="${5:-}"
  local url="${BASE}${path}"
  local resp=""

  if [ -n "${TOKEN:-}" ]; then
    if [ "$method" = "GET" ]; then
      resp=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$url" 2>&1)
    else
      resp=$(curl -s -w "\n%{http_code}" -X "$method" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$data" "$url" 2>&1)
    fi
  else
    if [ "$method" = "GET" ]; then
      resp=$(curl -s -w "\n%{http_code}" "$url" 2>&1)
    else
      resp=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$url" 2>&1)
    fi
  fi

  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')

  if [ "$code" = "$expected_code" ]; then
    green "$desc [$code]"
    PASS=$((PASS + 1))
  else
    local msg
    msg=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',{}).get('message',''))" 2>/dev/null || echo "parse error")
    red "$desc [got $code, expected $expected_code] — $msg"
    FAIL=$((FAIL + 1))
  fi
}

bold ""
bold "╔══════════════════════════════════════════════════════════════╗"
bold "║    HMS Smoke Test                                          ║"
bold "║    $(date)                         ║"
bold "╚══════════════════════════════════════════════════════════════╝"
bold ""

# 1. Check server is alive
bold "─── 1. Server Health ───"
check "GET /docs" "GET" "/docs" 200

# 2. Login
bold "─── 2. Authentication ───"
LOGIN_RESP=$(curl -s -X POST "${BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@hospital.local","password":"Admin@HMS2026!"}')
TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  red "Login failed"
  FAIL=$((FAIL + 1))
  bold "Cannot continue without auth token."
  bold ""
  bold "╔══════════════════════════════════════════════════════════════╗"
  bold "║    Smoke Test Failed                                       ║"
  bold "╚══════════════════════════════════════════════════════════════╝"
  exit 1
fi
green "Login successful (token: ${#TOKEN} chars)"
PASS=$((PASS + 1))

check "GET /auth/me" "GET" "/auth/me" 200

# 3. Core modules
bold "─── 3. Core Modules ───"
check "GET /dashboard/executive" "GET" "/dashboard/executive" 200
check "GET /users" "GET" "/users" 200
check "GET /patients" "GET" "/patients" 200
check "GET /appointments/today" "GET" "/appointments/today" 200
check "GET /branches" "GET" "/branches" 200
check "GET /modules/status" "GET" "/modules/status" 200

# 4. Clinical
bold "─── 4. Clinical ───"
check "GET /clinical" "GET" "/clinical" 200
check "GET /clinical/visits" "GET" "/clinical/visits" 200
check "GET /clinical/visits/active" "GET" "/clinical/visits/active" 200

# 5. Pharmacy
bold "─── 5. Pharmacy ───"
check "GET /pharmacy" "GET" "/pharmacy" 200
check "GET /pharmacy/drugs/search?q=para" "GET" "/pharmacy/drugs/search?q=para" 200
check "GET /pharmacy/inventory" "GET" "/pharmacy/inventory" 200

# 6. Lab
bold "─── 6. Laboratory ───"
check "GET /lab" "GET" "/lab" 200
check "GET /lab/tests" "GET" "/lab/tests" 200

# 7. Billing
bold "─── 7. Billing ───"
check "GET /billing" "GET" "/billing" 200
check "GET /billing/invoices" "GET" "/billing/invoices" 200
check "GET /billing/service-prices" "GET" "/billing/service-prices" 200
check "GET /billing/dashboard" "GET" "/billing/dashboard" 200

# 8. Inventory
bold "─── 8. Inventory ───"
check "GET /inventory" "GET" "/inventory" 200
check "GET /inventory/catalog" "GET" "/inventory/catalog" 200
check "GET /inventory/items" "GET" "/inventory/items" 200
check "GET /inventory/dashboard" "GET" "/inventory/dashboard" 200

# 9. Insurance
bold "─── 9. Insurance ───"
check "GET /insurance" "GET" "/insurance" 200
check "GET /insurance/claims/pending" "GET" "/insurance/claims/pending" 200

# 10. Reports
bold "─── 10. Reports ───"
check "GET /reports" "GET" "/reports" 200
check "GET /reports/templates" "GET" "/reports/templates" 200

# 11. Admin
bold "─── 11. Admin ───"
check "GET /admin" "GET" "/admin" 200
check "GET /admin/settings" "GET" "/admin/settings" 200
check "GET /admin/health" "GET" "/admin/health" 200
check "GET /admin/config" "GET" "/admin/config" 200

# 12. Dental
bold "─── 12. Dental ───"
check "GET /dental" "GET" "/dental" 200
check "GET /dental/drugs/search?q=para" "GET" "/dental/drugs/search?q=para" 200
check "GET /dental/catalog" "GET" "/dental/catalog" 200
check "GET /dental/dashboard" "GET" "/dental/dashboard" 200

# 13. Eye
bold "─── 13. Eye Clinic ───"
check "GET /eye" "GET" "/eye" 200
check "GET /eye/dashboard" "GET" "/eye/dashboard" 200
check "GET /eye/inventory" "GET" "/eye/inventory" 200

# Summary
bold ""
bold "╔══════════════════════════════════════════════════════════════╗"
total=$((PASS + FAIL))
elapsed=$SECONDS
bold "║    Smoke Test Complete                                      ║"
bold "║    Passed: $PASS / $total  |  Time: ${elapsed}s                    ║"
if [ "$FAIL" -eq 0 ]; then
  bold "║    Status: ✅ ALL CHECKS PASSED                               ║"
else
  bold "║    Status: ⚠️  $FAIL check(s) FAILED                               ║"
fi
bold "╚══════════════════════════════════════════════════════════════╝"
bold ""
