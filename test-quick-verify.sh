#!/bin/bash

echo "🧪 Quick 10x10 Verification Test"
echo "================================"

# Kill and restart backend
echo "🔄 Restarting backend..."
pkill -f "tsx watch src/index.ts" 2>/dev/null || true
sleep 1

cd backend && npm run dev > backend.log 2>&1 &
BACKEND_PID=$!
cd ..

echo "⏳ Waiting for backend to start..."
sleep 5

# Run a simple test
echo "📤 Sending test request..."
curl -s -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -d '{
    "target": "https://test-10x10.example.com",
    "userIntent": "Find subdomains then test EACH individually with directory brute-forcing",
    "constraints": {
      "environment": "development",
      "minTestsPerPhase": 10
    }
  }' | jq '.result.phases[0].results | length' | xargs -I {} echo "✅ Recon phase tests: {}"

echo ""
echo "📊 Checking backend logs for expansion..."
grep -i "Expanding recommendations\|directory-bruteforce" backend/backend.log | tail -5

# Cleanup
kill $BACKEND_PID 2>/dev/null || true