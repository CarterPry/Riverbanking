#!/bin/bash

echo "===================================================="
echo "🚀 10/10 Exhaustive AI Security Test"
echo "===================================================="
echo ""
echo "This test demonstrates the improved AI with:"
echo "- Dual self-critique loops"
echo "- Individual recommendations per subdomain"
echo "- Valid tool parameters only"
echo "- Automatic expansion if needed"
echo ""

# Generate unique workflow ID
WORKFLOW_ID="exhaustive-10x10-$(date +%s)-$$"

# Create the request
cat > /tmp/exhaustive-request.json << JSON
{
  "workflowId": "$WORKFLOW_ID",
  "target": "https://sweetspotgov.com",
  "userIntent": "EXHAUSTIVE testing: Find ALL subdomains, then for EACH subdomain run: directory-bruteforce with SecLists, port scanning, tech fingerprinting, crawling. Also find ALL forms for SQL injection, ALL auth endpoints for JWT testing, ALL APIs for security testing. Use self-critique to ensure FULL coverage.",
  "constraints": {
    "environment": "development",
    "scope": ["/*"],
    "exhaustiveMode": true,
    "requireCompleteCoverage": true,
    "useSecListsWordlists": true,
    "minRecommendationsPerSubdomain": 3
  }
}
JSON

echo "📤 Sending exhaustive test request..."
echo "Workflow ID: $WORKFLOW_ID"
echo "--------------------------------------------------"

# Send the request
RESPONSE=$(curl -s -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -d @/tmp/exhaustive-request.json)

echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

echo ""
echo "Expected improvements in this test:"
echo "✅ AI generates 8+ individual directory-bruteforce recommendations"
echo "✅ Each subdomain gets its own scan (not grouped)"
echo "✅ Valid SecLists paths used (/seclists/...)"
echo "✅ No tool parameter errors"
echo "✅ AI reasoning shows dual self-critique"
echo ""
echo "⏳ Waiting 15 seconds for initial planning..."
sleep 15

echo ""
echo "📊 Checking workflow status..."
STATUS=$(curl -s http://localhost:3001/api/v2/workflow/${WORKFLOW_ID}/status)
echo "$STATUS" | jq '.' 2>/dev/null || echo "$STATUS"

# Save output
echo "$STATUS" > ./ai-test-outputs/exhaustive-10x10-${WORKFLOW_ID}.json

echo ""
echo "===================================================="
echo "✅ Test Complete"
echo "===================================================="
echo ""
echo "To view AI's reasoning and recommendations:"
echo "  cat ./ai-test-outputs/exhaustive-10x10-${WORKFLOW_ID}.json | jq '.phases[0].aiReasoning'"
echo ""
echo "To count recommendations:"
echo "  cat ./ai-test-outputs/exhaustive-10x10-${WORKFLOW_ID}.json | jq '.phases[0].results | length'"
echo ""

# Clean up
rm -f /tmp/exhaustive-request.json
