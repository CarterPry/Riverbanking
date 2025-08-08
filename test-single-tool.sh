#!/bin/bash

echo "========================================"
echo "TESTING SINGLE TOOL EXECUTION"
echo "========================================"
echo ""

# Kill any existing backend
pkill -f "tsx watch" || true
sleep 2

# Start backend
cd backend
echo "Starting backend..."
npm run dev > ../single-tool-test.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait for backend
echo "Waiting for backend to initialize..."
sleep 5

# Verify backend is running
if ! curl -s http://localhost:3001/health > /dev/null; then
    echo "❌ Backend failed to start"
    tail -20 single-tool-test.log
    exit 1
fi

echo "✅ Backend is running"
echo ""

# Test just subdomain scanning
cat > subdomain-request.json << 'EOF'
{
  "target": "sweetspotgov.com",
  "userIntent": "Just find all subdomains of sweetspotgov.com. Nothing else.",
  "constraints": {
    "environment": "development"
  }
}
EOF

echo "📋 Sending simple subdomain enumeration request..."
RESPONSE=$(curl -s -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -d @subdomain-request.json)

echo "Response: $RESPONSE"
echo ""

WORKFLOW_ID=$(echo "$RESPONSE" | jq -r '.result.workflowId' 2>/dev/null)

if [ -z "$WORKFLOW_ID" ] || [ "$WORKFLOW_ID" = "null" ]; then
    echo "❌ Failed to start workflow"
    echo "Checking logs..."
    tail -50 single-tool-test.log | grep -A5 -B5 "error"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo "✅ Workflow started: $WORKFLOW_ID"
echo ""

# Monitor execution
echo "Monitoring execution for 30 seconds..."
for i in {1..6}; do
    sleep 5
    echo -n "."
    
    # Check status
    STATUS=$(curl -s http://localhost:3001/api/v2/workflow/$WORKFLOW_ID/status | jq -r '.status' 2>/dev/null)
    if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
        echo ""
        echo "Workflow status: $STATUS"
        break
    fi
done

echo ""
echo ""

# Get results
echo "Getting results..."
AUDIT=$(curl -s http://localhost:3001/api/v2/workflow/$WORKFLOW_ID/audit)

echo "Audit report:"
echo "$AUDIT" | jq . 2>/dev/null || echo "$AUDIT"

echo ""
echo "Checking execution logs..."
grep -E "(Executing tool|execution|Docker|container)" single-tool-test.log | tail -20

# Cleanup
kill $BACKEND_PID 2>/dev/null
rm -f subdomain-request.json

echo ""
echo "✅ Test complete!"