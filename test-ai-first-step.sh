#!/bin/bash

# Test AI's First Step Planning
# This script sends a specific security test request and captures the AI's initial planning

set -e

echo "=================================================="
echo "🧪 AI First Step Planning Test"
echo "=================================================="
echo "Target: https://sweetspotgov.com"
echo "Objective: Test all subdomains, directories, SQL injection, JWT tokens, API leaks"
echo ""

# Ensure backend is running
echo "🔍 Checking backend status..."
if ! curl -s http://localhost:8001/health > /dev/null 2>&1; then
    echo "⚠️  Backend not running. Starting it now..."
    cd backend && npm start &
    BACKEND_PID=$!
    echo "Waiting for backend to start..."
    sleep 10
fi

# Create output directory
OUTPUT_DIR="./ai-test-outputs"
mkdir -p "$OUTPUT_DIR"

# Generate unique workflow ID
WORKFLOW_ID="test-$(date +%s)-$$"
OUTPUT_FILE="$OUTPUT_DIR/ai-first-step-${WORKFLOW_ID}.json"

echo ""
echo "📤 Sending test request..."
echo "Workflow ID: $WORKFLOW_ID"
echo "--------------------------------------------------"

# Create the request payload
cat > /tmp/ai-test-request.json << EOF
{
  "target": "https://sweetspotgov.com",
  "scope": "/*",
  "description": "I want you to test against all subdomains and dir's. Test all access, stuff like sql injection, sending JWT tokens, catching any leaky api's stuff like this.",
  "testType": "comprehensive",
  "options": {
    "includeRecon": true,
    "includeSubdomains": true,
    "testAuthentication": true,
    "testAPIs": true,
    "verboseLogging": true,
    "captureAIReasoning": true,
    "maxInitialTests": 5
  }
}
EOF

# Send the request and capture response
echo "🚀 Initiating security assessment..."
RESPONSE=$(curl -s -X POST http://localhost:8001/api/workflows/run \
  -H "Content-Type: application/json" \
  -H "X-Workflow-Id: $WORKFLOW_ID" \
  -d @/tmp/ai-test-request.json)

echo ""
echo "📥 Initial Response:"
echo "$RESPONSE" | jq '.' || echo "$RESPONSE"

# Extract workflow ID from response
ACTUAL_WORKFLOW_ID=$(echo "$RESPONSE" | jq -r '.workflowId' || echo "$WORKFLOW_ID")

echo ""
echo "⏳ Waiting for AI to plan first step (10 seconds)..."
sleep 10

# Get workflow status with AI planning details
echo ""
echo "📊 Checking AI Planning Status..."
STATUS_RESPONSE=$(curl -s http://localhost:8001/api/workflows/${ACTUAL_WORKFLOW_ID}/status)

echo ""
echo "🤖 AI Planning Response:"
echo "$STATUS_RESPONSE" | jq '.' || echo "$STATUS_RESPONSE"

# Try to get more detailed AI reasoning
echo ""
echo "🧠 Fetching AI Thought Process..."
AI_THOUGHTS=$(curl -s http://localhost:8001/api/workflows/${ACTUAL_WORKFLOW_ID}/ai-reasoning 2>/dev/null || echo "{}")

if [ "$AI_THOUGHTS" != "{}" ]; then
    echo "$AI_THOUGHTS" | jq '.' || echo "$AI_THOUGHTS"
fi

# Save all outputs
cat > "$OUTPUT_FILE" << EOF
{
  "workflowId": "$ACTUAL_WORKFLOW_ID",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "request": $(cat /tmp/ai-test-request.json),
  "initialResponse": $RESPONSE,
  "statusResponse": $STATUS_RESPONSE,
  "aiThoughts": $AI_THOUGHTS
}
EOF

echo ""
echo "=================================================="
echo "✅ Test Complete"
echo "=================================================="
echo "Output saved to: $OUTPUT_FILE"
echo ""
echo "To view the AI's first step plan:"
echo "  cat $OUTPUT_FILE | jq '.statusResponse.aiPlan'"
echo ""
echo "To monitor live updates:"
echo "  curl -s http://localhost:8001/api/workflows/${ACTUAL_WORKFLOW_ID}/stream"

# Clean up
rm -f /tmp/ai-test-request.json