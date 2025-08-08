#!/bin/bash

# Test the enhanced 10/10 exhaustive AI behavior
# This should now generate 40+ individual tests for 8 subdomains

echo "🚀 Testing Enhanced 10/10 Exhaustive AI Behavior..."
echo "=================================================="

# Generate unique test ID
TEST_ID="enhanced-$(date +%s)-$$"
OUTPUT_DIR="ai-test-outputs"
mkdir -p "$OUTPUT_DIR"

# Test with explicit requirements for exhaustive testing
curl -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -d '{
    "target": "https://sweetspotgov.com",
    "userIntent": "I want exhaustive testing on ALL subdomains. For EVERY subdomain found, run individual directory brute-forcing with SecLists, port scanning, and tech fingerprinting. Test all SQL injection points, JWT vulnerabilities, and API security. Do NOT group tests - create separate recommendations for each asset.",
    "constraints": {
      "environment": "development",
      "scope": ["/*"],
      "minTestsPerPhase": 10,
      "forceAllPhases": true
    }
  }' > "$OUTPUT_DIR/test-$TEST_ID.json"

echo ""
echo "✅ Test submitted with ID: $TEST_ID"
echo "📄 Response saved to: $OUTPUT_DIR/test-$TEST_ID.json"
echo ""

# Pretty print the response
echo "📊 Initial Response:"
cat "$OUTPUT_DIR/test-$TEST_ID.json" | jq '.'

# Extract workflow ID
WORKFLOW_ID=$(cat "$OUTPUT_DIR/test-$TEST_ID.json" | jq -r '.workflowId // .result.workflowId // "null"')

if [ "$WORKFLOW_ID" != "null" ]; then
    echo ""
    echo "🔄 Workflow ID: $WORKFLOW_ID"
    echo "⏳ Waiting for completion..."
    
    # Poll for status
    sleep 5
    curl -s -X GET "http://localhost:3001/api/v2/workflow/$WORKFLOW_ID/status" | jq '.'
else
    echo "❌ No workflow ID found in response"
fi

echo ""
echo "🎯 Expected Behavior:"
echo "- Should find ~8 subdomains"
echo "- Should generate 8+ directory-bruteforce tests (one per subdomain)"
echo "- Should generate 8+ port-scanner tests (one per subdomain)"
echo "- Should generate 8+ tech-fingerprint tests (one per subdomain)"
echo "- Should add combo tests (SSRF between subdomains)"
echo "- Total recon phase: 30+ individual tests"
echo "- Analyze phase: 10+ tests meeting minTestsPerPhase"
echo ""
echo "🔍 Check the AI reasoning for:"
echo "- Dual self-critique loops"
echo "- Individual test generation"
echo "- No grouping of assets"
echo "- Meeting minTestsPerPhase requirements"