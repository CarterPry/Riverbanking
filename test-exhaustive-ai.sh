#!/bin/bash

# Exhaustive AI Security Test
# This script uses the new exhaustive AI prompt for comprehensive testing

set -e

echo "=================================================="
echo "🚀 Exhaustive AI Security Test"
echo "=================================================="
echo ""
echo "This test uses the new Chain-of-Thought (CoT) exhaustive prompt that:"
echo "- Lists EVERY subdomain individually"
echo "- Plans directory scanning for EACH subdomain separately"
echo "- Considers ALL OWASP categories"
echo "- Self-critiques to ensure nothing is missed"
echo ""

# Create output directory
OUTPUT_DIR="./ai-test-outputs"
mkdir -p "$OUTPUT_DIR"

# Generate unique workflow ID
WORKFLOW_ID="exhaustive-$(date +%s)-$$"
OUTPUT_FILE="$OUTPUT_DIR/exhaustive-test-${WORKFLOW_ID}.json"

echo "📤 Creating exhaustive test request..."
echo "Workflow ID: $WORKFLOW_ID"
echo "--------------------------------------------------"

# Create the request
cat > /tmp/exhaustive-request.json << EOJSON
{
  "target": "https://sweetspotgov.com",
  "userIntent": "Perform EXHAUSTIVE security testing. Find ALL subdomains, then test EACH subdomain individually using appropriate SecLists wordlists for comprehensive directory enumeration. Also scan for open ports, technologies. Test for SQL injection on ALL forms/parameters, JWT vulnerabilities on ALL auth endpoints, API security on ALL discovered APIs. Use self-critique to ensure NOTHING is missed.",
  "constraints": {
    "environment": "development",
    "scope": ["/*"],
    "exhaustiveMode": true,
    "requireCompleteCoverage": true,
    "useSecListsWordlists": true
  }
}
EOJSON

# Send request to backend
echo "🚀 Sending exhaustive test request..."
echo ""
echo "Expected behavior with new prompt:"
echo "1. AI will inventory ALL findings explicitly"
echo "2. Will enumerate ALL OWASP categories"
echo "3. Will plan tests for EACH subdomain individually"
echo "4. Will self-critique and add missing tests"
echo ""

RESPONSE=$(curl -s -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -H "X-Workflow-Id: $WORKFLOW_ID" \
  -d @/tmp/exhaustive-request.json 2>&1)

# Check response
if [ -z "$RESPONSE" ] || [[ "$RESPONSE" == *"error"* ]]; then
    echo "❌ Request failed. Response: $RESPONSE"
    echo ""
    echo "Make sure the backend is running with the updated prompt:"
    echo "  cd backend && npm run dev"
    exit 1
fi

echo "📥 Initial Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

# Save response
echo "$RESPONSE" > "$OUTPUT_FILE"

echo ""
echo "=================================================="
echo "✅ Exhaustive Test Request Sent"
echo "=================================================="
echo "Output saved to: $OUTPUT_FILE"
echo ""
echo "The AI should now:"
echo "- List each subdomain individually in its reasoning"
echo "- Plan separate directory scans for EACH subdomain"
echo "- Consider all OWASP categories"
echo "- Self-critique and add any missing tests"
echo ""
echo "Monitor progress with: tail -f backend/logs/app-*.log | grep -E 'strategy|recommendations'"

# Clean up
rm -f /tmp/exhaustive-request.json
