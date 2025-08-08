#!/bin/bash

# Direct AI First Step Test - No backend startup
# Just sends the request assuming backend is already running

set -e

echo "=================================================="
echo "🧪 AI First Step Planning Test (Direct)"
echo "=================================================="
echo "Target: https://sweetspotgov.com"
echo "Objective: Test all subdomains, directories, SQL injection, JWT tokens, API leaks"
echo ""

# Create output directory
OUTPUT_DIR="./ai-test-outputs"
mkdir -p "$OUTPUT_DIR"

# Generate unique workflow ID
WORKFLOW_ID="test-$(date +%s)-$$"
OUTPUT_FILE="$OUTPUT_DIR/ai-first-step-${WORKFLOW_ID}.json"

echo "📤 Sending test request..."
echo "Workflow ID: $WORKFLOW_ID"
echo "--------------------------------------------------"

# Create the request payload (v2 API format)
cat > /tmp/ai-test-request.json << EOF
{
  "target": "https://sweetspotgov.com",
  "userIntent": "IMPORTANT: You MUST run directory scanning on EVERY subdomain found. I want you to test against all subdomains and dir's. Test all access, stuff like sql injection, sending JWT tokens, catching any leaky api's stuff like this. Do NOT skip directory enumeration - it is critical to find hidden endpoints.",
  "constraints": {
    "environment": "development",
    "scope": ["/*"],
    "requiredTools": ["subdomain-scanner", "directory-scanner", "crawler"],
    "minTestsPerPhase": 5,
    "forceAllPhases": true
  }
}
EOF

# Backend is on port 3001 with v2 API
echo "🚀 Sending request to backend..."
RESPONSE=$(curl -s -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -H "X-Workflow-Id: $WORKFLOW_ID" \
  -d @/tmp/ai-test-request.json 2>&1)

if [ "$RESPONSE" = "FAILED" ] || [ -z "$RESPONSE" ]; then
    echo "❌ Both ports failed. Backend may not be running correctly."
    echo ""
    echo "Try running the backend with:"
    echo "  cd backend && npm run dev"
    exit 1
fi

echo ""
echo "📥 Initial Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

# Extract workflow ID from response
ACTUAL_WORKFLOW_ID=$(echo "$RESPONSE" | jq -r '.workflowId' 2>/dev/null || echo "$WORKFLOW_ID")

echo ""
echo "⏳ Waiting for AI to plan first step (10 seconds)..."
sleep 10

# Try to get workflow status
echo ""
echo "📊 Checking AI Planning Status..."

# Get status from port 3001 v2 API
STATUS_RESPONSE=$(curl -s http://localhost:3001/api/v2/workflow/${ACTUAL_WORKFLOW_ID}/status 2>&1)

echo ""
echo "🤖 AI Planning Response:"
echo "$STATUS_RESPONSE" | jq '.' 2>/dev/null || echo "$STATUS_RESPONSE"

# Save all outputs
cat > "$OUTPUT_FILE" << EOF
{
  "workflowId": "$ACTUAL_WORKFLOW_ID",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "request": $(cat /tmp/ai-test-request.json),
  "initialResponse": ${RESPONSE:-{}},
  "statusResponse": ${STATUS_RESPONSE:-{}}
}
EOF

echo ""
echo "=================================================="
echo "✅ Test Complete"
echo "=================================================="
echo "Output saved to: $OUTPUT_FILE"
echo ""
echo "If the backend is not responding, ensure it's running with:"
echo "  cd backend && npm run dev"

# Clean up
rm -f /tmp/ai-test-request.json