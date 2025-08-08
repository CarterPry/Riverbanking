#!/bin/bash

echo "========================================"
echo "QUICK PARAMETER SUBSTITUTION TEST"
echo "========================================"
echo ""

# Start backend
cd backend
echo "Starting backend..."
npm run dev > ../quick-test.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait for backend
echo "Waiting for backend..."
sleep 5

if ! curl -s http://localhost:3001/health > /dev/null; then
    echo "❌ Backend failed to start"
    tail -20 quick-test.log
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo "✅ Backend is running"
echo ""

# Simple request
echo "📋 Sending enumeration request..."
RESPONSE=$(curl -s -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -d '{
    "target": "example.com",
    "userIntent": "Find subdomains then scan them for open ports"
  }')

WORKFLOW_ID=$(echo "$RESPONSE" | jq -r '.result.workflowId' 2>/dev/null)

if [ -z "$WORKFLOW_ID" ] || [ "$WORKFLOW_ID" = "null" ]; then
    echo "❌ Failed to start workflow: $RESPONSE"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo "✅ Workflow started: $WORKFLOW_ID"
echo ""

# Monitor for 30 seconds
echo "⏳ Running for 30 seconds..."
sleep 30

echo ""
echo "=== Parameter Substitution Logs ==="
grep -i "Starting parameter substitution\|Found template\|Substituted domains" quick-test.log | tail -20

echo ""
echo "=== Template Usage ==="
grep "{{" quick-test.log | grep -v "IMPORTANT:" | tail -10

echo ""
echo "=== Test Results Storage ==="
grep "Stored test result" quick-test.log | tail -10

echo ""
echo "=== Tool Execution ==="
grep "Tool execution completed" quick-test.log | tail -10

# Get final status
STATUS=$(curl -s http://localhost:3001/api/v2/workflow/$WORKFLOW_ID/status | jq -r '.status' 2>/dev/null)
echo ""
echo "Final workflow status: $STATUS"

# Cleanup
kill $BACKEND_PID 2>/dev/null

echo ""
echo "✅ Test complete!"