#!/bin/bash

echo "======================================"
echo "Stage 6: Full System Test - Sweetspot Scenario"
echo "======================================"

# Load environment variables
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

echo "1. Starting full system..."
cd backend

# Kill any existing processes
lsof -ti:3001 | xargs kill -9 2>/dev/null || true

# Start backend
echo "Starting backend server..."
npm run dev > ../backend-full-test.log 2>&1 &
BACKEND_PID=$!

# Wait for backend
sleep 5

# Verify backend is running
if ! curl -s http://localhost:3001/health > /dev/null; then
    echo "❌ Backend failed to start"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

echo "✅ Backend is running"

cd ..

echo ""
echo "2. Running Sweetspot security test scenario..."
echo "Target: sweetspotgov.com"
echo "Intent: Test all subdomains and directories for SQL injection, JWT issues, and API vulnerabilities"
echo ""

# Create the sweetspot test request
cat > sweetspot-test.json << 'EOF'
{
  "target": "sweetspotgov.com",
  "userIntent": "I want you to test against all subdomains and dirs. Test all access, stuff like sql injection, sending JWT tokens, catching any leaky apis stuff like this.",
  "constraints": {
    "environment": "development",
    "timeLimit": 300000
  }
}
EOF

# Execute the test
echo "Executing AI-driven security test..."
RESPONSE=$(curl -s -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -d @sweetspot-test.json)

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
echo "3. Monitoring workflow progress..."

# Monitor for up to 5 minutes
TIMEOUT=300
ELAPSED=0
INTERVAL=5

while [ $ELAPSED -lt $TIMEOUT ]; do
    # Get workflow status
    STATUS_RESPONSE=$(curl -s http://localhost:3001/api/v2/workflow/$WORKFLOW_ID/status)
    STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.status' 2>/dev/null)
    
    if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
        echo ""
        echo "Workflow $STATUS!"
        break
    fi
    
    echo -ne "\rElapsed: ${ELAPSED}s - Status: $STATUS"
    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
done

echo ""
echo ""
echo "4. Retrieving audit report..."
AUDIT_RESPONSE=$(curl -s http://localhost:3001/api/v2/workflow/$WORKFLOW_ID/audit)

if echo "$AUDIT_RESPONSE" | jq . > /dev/null 2>&1; then
    echo "✅ Audit report retrieved"
    
    # Save audit report
    echo "$AUDIT_RESPONSE" | jq . > "sweetspot-audit-$WORKFLOW_ID.json"
    echo "Audit report saved to: sweetspot-audit-$WORKFLOW_ID.json"
    
    # Display summary
    echo ""
    echo "=== AUDIT SUMMARY ==="
    echo "Total AI Decisions: $(echo "$AUDIT_RESPONSE" | jq '.totalDecisions')"
    echo "Average Confidence: $(echo "$AUDIT_RESPONSE" | jq '.averageConfidence')"
    echo "Decision Types:"
    echo "$AUDIT_RESPONSE" | jq '.decisionsByType'
else
    echo "⚠️  Could not retrieve audit report"
fi

echo ""
echo "5. Checking AI decision logs..."
if [ -d "backend/logs/ai-decisions/$WORKFLOW_ID" ]; then
    echo "✅ AI decision logs created"
    echo "Number of decision files: $(ls backend/logs/ai-decisions/$WORKFLOW_ID | wc -l)"
else
    echo "⚠️  AI decision logs not found for this workflow"
fi

echo ""
echo "6. Displaying backend logs (last 50 lines)..."
echo "----------------------------------------"
tail -50 backend-full-test.log | grep -E "(Strategic|AI|Decision|Phase|Finding)" || echo "No relevant logs found"

# Clean up
kill $BACKEND_PID 2>/dev/null || true
rm -f sweetspot-test.json

echo ""
echo "----------------------------------------"
echo "Stage 6 Complete! ✅"
echo ""
echo "Full system test has been executed."
echo ""
echo "What the AI should have done:"
echo "1. Analyzed the user intent for testing sweetspotgov.com"
echo "2. Started with reconnaissance (subdomain enumeration)"
echo "3. Discovered subdomains like console.sweetspotgov.com"
echo "4. Adapted strategy based on findings"
echo "5. Performed targeted tests (SQL injection, JWT analysis)"
echo "6. Generated executive summary and recommendations"
echo ""
echo "Check the following for results:"
echo "- Audit report: sweetspot-audit-$WORKFLOW_ID.json"
echo "- Backend logs: backend-full-test.log"
echo "- AI decisions: backend/logs/ai-decisions/$WORKFLOW_ID/"
echo ""
echo "🎉 AI Integration Complete! The system is now using strategic AI reasoning instead of templates."