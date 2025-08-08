#!/bin/bash

echo "========================================"
echo "DEBUG PARAMETER SUBSTITUTION"
echo "========================================"
echo ""

# Kill any existing backend
pkill -f "tsx watch" || true
sleep 2

# Start backend with debug logging enabled
cd backend
echo "Starting backend with DEBUG logging..."
NODE_ENV=development LOG_LEVEL=debug npm run dev > ../debug-substitution.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait for backend
echo "Waiting for backend to initialize..."
sleep 5

# Verify backend is running
if ! curl -s http://localhost:3001/health > /dev/null; then
    echo "❌ Backend failed to start"
    tail -20 debug-substitution.log
    exit 1
fi

echo "✅ Backend is running"
echo ""

# Test with simpler request
cat > debug-request.json << 'EOF'
{
  "target": "example.com",
  "userIntent": "First find subdomains, then scan ports on those subdomains",
  "constraints": {
    "environment": "development"
  }
}
EOF

echo "📋 Sending test request..."
RESPONSE=$(curl -s -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -d @debug-request.json)

WORKFLOW_ID=$(echo "$RESPONSE" | jq -r '.result.workflowId' 2>/dev/null)

if [ -z "$WORKFLOW_ID" ] || [ "$WORKFLOW_ID" = "null" ]; then
    echo "❌ Failed to start workflow"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo "✅ Workflow started: $WORKFLOW_ID"
echo ""

# Monitor for 20 seconds
echo "Monitoring for parameter substitution..."
sleep 20

echo ""
echo "=== Checking for substitution logs ==="
grep -i "before substitution\|after substitution" debug-substitution.log | tail -20

echo ""
echo "=== Checking for template patterns ==="
grep "{{" debug-substitution.log | tail -20

echo ""
echo "=== Checking for 'Stored test result' ==="
grep "Stored test result" debug-substitution.log | tail -10

echo ""
echo "=== Checking for 'Substituted domains' ==="
grep "Substituted domains" debug-substitution.log | tail -10

# Cleanup
kill $BACKEND_PID 2>/dev/null
rm -f debug-request.json

echo ""
echo "✅ Debug complete!"