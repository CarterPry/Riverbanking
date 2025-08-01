#!/bin/bash

# Test script for SOC2 Testing Platform API

API_URL="http://localhost:3000/api"

echo "🔍 Testing SOC2 Testing Platform API"
echo "===================================="

# Check API status
echo -e "\n1. Checking API status..."
curl -s "$API_URL/status" | jq .

# Check API health
echo -e "\n2. Checking API health..."
curl -s "$API_URL/health" | jq .

# Run a test workflow
echo -e "\n3. Starting a test workflow..."
RESPONSE=$(curl -s -X POST "$API_URL/run-soc2-workflow" \
  -H "Content-Type: application/json" \
  -d '{
    "target": "https://example.com",
    "scope": "security",
    "description": "Test security scan for example.com",
    "options": {
      "progressive": true,
      "maxConcurrent": 4
    }
  }')

echo "$RESPONSE" | jq .

# Extract workflow ID
WORKFLOW_ID=$(echo "$RESPONSE" | jq -r .workflowId)

if [ "$WORKFLOW_ID" != "null" ]; then
  echo -e "\n4. Checking workflow status..."
  sleep 2
  curl -s "$API_URL/workflows/$WORKFLOW_ID/status" | jq .
fi

# Test with IP address
echo -e "\n5. Testing with IP address..."
curl -s -X POST "$API_URL/run-soc2-workflow" \
  -H "Content-Type: application/json" \
  -d '{
    "target": "192.168.1.1",
    "scope": "comprehensive"
  }' | jq .

# Test invalid request
echo -e "\n6. Testing invalid request (should fail)..."
curl -s -X POST "$API_URL/run-soc2-workflow" \
  -H "Content-Type: application/json" \
  -d '{
    "target": "not-a-valid-url"
  }' | jq .

echo -e "\n✅ API test complete!" 