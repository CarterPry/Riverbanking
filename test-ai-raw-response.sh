#!/bin/bash

# Test to see the raw AI response before processing

echo "🔍 Testing Raw AI Response"
echo "========================="

# Create a minimal test to see what AI returns
curl -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -d '{
    "target": "https://raw-test.example.com",
    "userIntent": "Just run subdomain enumeration and show me your raw recommendations",
    "constraints": {
      "environment": "development",
      "minTestsPerPhase": 10
    }
  }' | tee ai-raw-response.json | jq '.'

echo ""
echo "📄 Raw response saved to: ai-raw-response.json"