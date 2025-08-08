#!/bin/bash

# Comprehensive Enumeration Test using Updated AI Prompts
# This ensures the AI enumerates all discovered assets exhaustively

set -e

echo "=================================================="
echo "🎯 Comprehensive Enumeration Test with Updated AI"
echo "=================================================="
echo ""
echo "This test uses the updated Chain of Thought prompts that require:"
echo "- Exhaustive enumeration of ALL discovered items"
echo "- Directory scanning on EVERY subdomain found"
echo "- Comprehensive OWASP mapping"
echo "- Structured reasoning for each decision"
echo ""

# Create output directory
OUTPUT_DIR="./ai-test-outputs"
mkdir -p "$OUTPUT_DIR"

# Generate unique workflow ID
WORKFLOW_ID="comprehensive-$(date +%s)-$$"
OUTPUT_FILE="$OUTPUT_DIR/comprehensive-enum-${WORKFLOW_ID}.json"

echo "📤 Creating comprehensive test request..."
echo "Workflow ID: $WORKFLOW_ID"
echo "--------------------------------------------------"

# Create request emphasizing comprehensive coverage
cat > /tmp/comprehensive-request.json << EOJSON
{
  "target": "https://sweetspotgov.com",
  "userIntent": "Perform EXHAUSTIVE security testing. For EVERY subdomain found, run directory enumeration. For EVERY directory found, check for vulnerabilities. Test ALL endpoints for: SQL injection, XSS, authentication bypass, JWT vulnerabilities, API security issues, information disclosure. Do NOT skip any discovered asset - treat each subdomain, directory, and endpoint as a separate target requiring full testing.",
  "constraints": {
    "environment": "development",
    "scope": ["/*"],
    "comprehensiveMode": true,
    "requireExhaustiveTesting": true,
    "skipTimeLimit": true
  }
}
EOJSON

# Check if backend is running
echo "🔍 Checking backend status..."
if ! curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "❌ Backend not running on port 3001"
    echo "Please start it with: cd backend && npm run dev"
    exit 1
fi

# Send request to backend
echo "🚀 Sending comprehensive enumeration request..."
echo "Note: The updated AI prompts will ensure exhaustive testing"
echo ""

RESPONSE=$(curl -s -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -H "X-Workflow-Id: $WORKFLOW_ID" \
  -d @/tmp/comprehensive-request.json 2>&1)

# Check response
if [ -z "$RESPONSE" ] || [[ "$RESPONSE" == *"error"* ]]; then
    echo "❌ Request failed. Response: $RESPONSE"
    exit 1
fi

echo "📥 Initial Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

# Extract workflow ID
ACTUAL_WORKFLOW_ID=$(echo "$RESPONSE" | jq -r '.result.workflowId // .workflowId' 2>/dev/null || echo "")

# Save initial response
echo "$RESPONSE" > "$OUTPUT_FILE"

echo ""
echo "=================================================="
echo "✅ Test Request Sent Successfully"
echo "=================================================="
echo "Workflow ID: $ACTUAL_WORKFLOW_ID"
echo "Output: $OUTPUT_FILE"
echo ""
echo "The updated AI will now:"
echo "1. List ALL discovered subdomains explicitly"
echo "2. Plan directory enumeration for EACH subdomain"
echo "3. Map all tests to OWASP categories"
echo "4. Provide detailed Chain of Thought reasoning"
echo ""
echo "Monitor progress with:"
echo "  curl -s http://localhost:3001/api/v2/workflow/${ACTUAL_WORKFLOW_ID}/status | jq"
echo ""
echo "Or check the backend logs for AI decisions"

# Clean up
rm -f /tmp/comprehensive-request.json
