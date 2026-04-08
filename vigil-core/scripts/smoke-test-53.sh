#!/usr/bin/env bash
set -euo pipefail

# Phase 53 Wave 1 smoke test — validates GET filter + PUT projectId against a one-off
# vigil-core instance. Model: Phase 52-02 smoke test pattern.
# Pitfall P-4: Mac client points at Railway prod. This script tests the same code
# via a local one-off so we catch regressions BEFORE merging to main triggers auto-deploy.

PORT=3098
BASE="http://localhost:${PORT}/v1"
TOKEN="${VIGIL_API_BEARER_TOKEN:?must be set in env — export from ~/.config/dailybrief/config.json}"
DB="${DATABASE_PUBLIC_URL:?must be set in env — Railway proxy URL}"

cd "$(dirname "$0")/.."
npm run build

# Start the server in the background
PORT=$PORT DATABASE_URL="$DB" node dist/index.js &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
sleep 2

auth=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

echo "=== 53a. Create a project to assign to ==="
PROJECT=$(curl -s -X POST "${BASE}/projects" "${auth[@]}" -d '{"name":"Smoke 53","status":"active"}')
echo "$PROJECT"
PID=$(echo "$PROJECT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).id))')
echo "Project id: $PID"

echo "=== 53b. Pick an existing thought (first in the list) ==="
TID=$(curl -s "${BASE}/thoughts?limit=1" "${auth[@]}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data[0].id))')
echo "Thought id: $TID"

echo "=== 53c. PUT projectId=PID (valid FK) ==="
curl -s -o /tmp/53c.json -w "HTTP %{http_code}\n" -X PUT "${BASE}/thoughts/${TID}" "${auth[@]}" -d "{\"projectId\":${PID}}"
cat /tmp/53c.json
grep -q "\"projectId\":${PID}" /tmp/53c.json && echo "✓ projectId round-trips in response" || { echo "✗ projectId missing from response"; exit 1; }

echo "=== 53d. GET /thoughts?projectId=PID returns our thought ==="
curl -s "${BASE}/thoughts?projectId=${PID}" "${auth[@]}" | grep -q "\"id\":${TID}" && echo "✓ filter works" || { echo "✗ filter broken"; exit 1; }

echo "=== 53e. PUT projectId=999999 (nonexistent FK) → expect 400 ==="
CODE=$(curl -s -o /tmp/53e.json -w "%{http_code}" -X PUT "${BASE}/thoughts/${TID}" "${auth[@]}" -d '{"projectId":999999}')
[ "$CODE" = "400" ] || { echo "✗ expected 400, got $CODE"; cat /tmp/53e.json; exit 1; }
grep -q "project not found" /tmp/53e.json && echo "✓ FK check fires" || { echo "✗ wrong error"; exit 1; }

echo "=== 53f. PUT projectId=null (unassign) ==="
curl -s -o /tmp/53f.json -w "HTTP %{http_code}\n" -X PUT "${BASE}/thoughts/${TID}" "${auth[@]}" -d '{"projectId":null}'
grep -q "\"projectId\":null" /tmp/53f.json && echo "✓ unassign works" || { echo "✗ unassign broken"; cat /tmp/53f.json; exit 1; }

echo "=== 53g. GET /thoughts?unassigned=true includes the just-unassigned thought ==="
curl -s "${BASE}/thoughts?unassigned=true&limit=500" "${auth[@]}" | grep -q "\"id\":${TID}" && echo "✓ unassigned filter works" || { echo "✗ unassigned filter broken"; exit 1; }

echo "=== 53h. GET /thoughts?projectId=${PID}&unassigned=true → expect 400 ==="
CODE=$(curl -s -o /tmp/53h.json -w "%{http_code}" "${BASE}/thoughts?projectId=${PID}&unassigned=true" "${auth[@]}")
[ "$CODE" = "400" ] || { echo "✗ expected 400, got $CODE"; exit 1; }
grep -q "mutually exclusive" /tmp/53h.json && echo "✓ mutex check fires" || { echo "✗ wrong error"; exit 1; }

echo "=== 53i. GET /thoughts?projectId=abc → expect 400 ==="
CODE=$(curl -s -o /tmp/53i.json -w "%{http_code}" "${BASE}/thoughts?projectId=abc" "${auth[@]}")
[ "$CODE" = "400" ] || { echo "✗ expected 400, got $CODE"; exit 1; }
grep -q "positive integer" /tmp/53i.json && echo "✓ projectId validation fires" || { echo "✗ wrong error"; exit 1; }

echo "=== 53j. Cleanup — DELETE test project ==="
curl -s -X DELETE "${BASE}/projects/${PID}" "${auth[@]}"
echo ""

echo "✓ ALL PHASE 53 WAVE 1 SMOKE TESTS PASSED"
