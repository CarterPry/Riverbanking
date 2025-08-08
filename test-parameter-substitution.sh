#!/bin/bash

echo "========================================"
echo "PARAMETER SUBSTITUTION TEST"
echo "========================================"
echo ""

# Kill any existing backend
pkill -f "tsx watch" || true
sleep 2

# Start backend with debug logging
cd backend
echo "Starting backend with debug logging..."
NODE_ENV=development DEBUG=* npm run dev > ../param-test.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait for backend
echo "Waiting for backend to initialize..."
sleep 5

# Verify backend is running
if ! curl -s http://localhost:3001/health > /dev/null; then
    echo "❌ Backend failed to start"
    tail -20 param-test.log
    exit 1
fi

echo "✅ Backend is running"
echo ""

# Test with simpler request
cat > param-test-request.json << 'EOF'
{
  "target": "example.com",
  "userIntent": "First find all subdomains, then scan ports on each subdomain found",
  "constraints": {
    "environment": "development"
  }
}
EOF

echo "📋 Sending test request..."
RESPONSE=$(curl -s -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -d @param-test-request.json)

echo "Response: $RESPONSE"
echo ""

WORKFLOW_ID=$(echo "$RESPONSE" | jq -r '.result.workflowId' 2>/dev/null)

if [ -z "$WORKFLOW_ID" ] || [ "$WORKFLOW_ID" = "null" ]; then
    echo "❌ Failed to start workflow"
    echo "Checking logs..."
    tail -50 param-test.log | grep -A5 -B5 "error"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo "✅ Workflow started: $WORKFLOW_ID"
echo ""

# Monitor for parameter substitution
echo "Monitoring for parameter substitution..."
sleep 30

echo ""
echo "Checking logs for substitution..."
grep -i "substitut" param-test.log | tail -20

echo ""
echo "Checking for parameter templates..."
grep "{{" param-test.log | tail -20

# Cleanup
kill $BACKEND_PID 2>/dev/null
rm -f param-test-request.json

echo ""
echo "✅ Test complete!"