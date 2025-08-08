#!/bin/bash

echo "======================================"
echo "Testing AI-Driven Security Platform"
echo "Target: sweetspotgov.com"
echo "======================================"

# Start backend
cd backend
echo "Starting backend server..."
npm run dev > ../ai-test.log 2>&1 &
BACKEND_PID=$!

cd ..

# Wait for backend to start
echo "Waiting for backend to initialize..."
sleep 5

# Check if backend is running
if ! curl -s http://localhost:3001/health > /dev/null; then
    echo "❌ Backend failed to start"
    cat ai-test.log
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

echo "✅ Backend is running"
echo ""

# Create the test request
cat > sweetspot-ai-test.json << 'EOF'
{
  "target": "sweetspotgov.com",
  "userIntent": "I want you to test against all subdomains and dirs. Test all access, stuff like sql injection, sending JWT tokens, catching any leaky apis stuff like this.",
  "constraints": {
    "environment": "development",
    "timeLimit": 600000
  }
}
EOF

echo "Executing AI-driven security test..."
echo "The AI will:"
echo "1. Analyze your intent"
echo "2. Plan a strategic approach"
echo "3. Start with subdomain enumeration"
echo "4. Adapt based on findings"
echo "5. Test for SQL injection, JWT issues, and API vulnerabilities"
echo ""

# Execute the test
RESPONSE=$(curl -s -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -d @sweetspot-ai-test.json)

# Extract workflow ID
WORKFLOW_ID=$(echo "$RESPONSE" | jq -r '.result.workflowId' 2>/dev/null)

if [ -z "$WORKFLOW_ID" ] || [ "$WORKFLOW_ID" = "null" ]; then
    echo "❌ Failed to start workflow"
    echo "Response: $RESPONSE"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

echo "✅ Workflow started: $WORKFLOW_ID"
echo ""
echo "Monitoring AI decisions in real-time..."
echo ""

# Monitor the backend log for AI activity
tail -f ai-test.log | grep -E "(Strategic|Planning|Adapting|AI decision|Phase:|Finding:|Executing tool)" &
TAIL_PID=$!

# Give it some time to run
sleep 30

# Kill the tail process
kill $TAIL_PID 2>/dev/null || true

echo ""
echo "Retrieving results..."

# Get workflow status
STATUS=$(curl -s http://localhost:3001/api/v2/workflow/$WORKFLOW_ID/status | jq -r '.status' 2>/dev/null)
echo "Workflow status: $STATUS"

# Get audit report
AUDIT=$(curl -s http://localhost:3001/api/v2/workflow/$WORKFLOW_ID/audit)

if echo "$AUDIT" | jq . > /dev/null 2>&1; then
    echo ""
    echo "=== AI DECISION SUMMARY ==="
    echo "Total Decisions: $(echo "$AUDIT" | jq '.totalDecisions')"
    echo "Average Confidence: $(echo "$AUDIT" | jq '.averageConfidence')"
    echo ""
    echo "Decision Types:"
    echo "$AUDIT" | jq '.decisionsByType'
    echo ""
    echo "AI Timeline:"
    echo "$AUDIT" | jq '.timeline[] | {time: .timestamp, type: .type, summary: .summary}'
fi

# Save full results
echo "$AUDIT" | jq . > "ai-test-results-$WORKFLOW_ID.json"

# Clean up
kill $BACKEND_PID 2>/dev/null || true
rm -f sweetspot-ai-test.json

echo ""
echo "Test complete! Check ai-test-results-$WORKFLOW_ID.json for full details"
echo ""
echo "What to look for:"
echo "- AI reasoning for each phase"
echo "- Dynamic test selection based on discoveries"
echo "- Adaptive strategy changes"
echo "- No templates - pure AI decision making!"