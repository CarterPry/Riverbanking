#!/bin/bash

# Directory Enumeration Focused Test
# This script ensures directory scanning happens on all discovered subdomains

set -e

echo "=================================================="
echo "🎯 Directory Enumeration Security Test"
echo "=================================================="
echo ""

# Create output directory
OUTPUT_DIR="./ai-test-outputs"
mkdir -p "$OUTPUT_DIR"

# Generate unique workflow ID
WORKFLOW_ID="dir-enum-$(date +%s)-$$"
OUTPUT_FILE="$OUTPUT_DIR/directory-enum-${WORKFLOW_ID}.json"

echo "📤 Creating test request..."
echo "Workflow ID: $WORKFLOW_ID"
echo "--------------------------------------------------"

# Create the request with explicit directory enumeration requirements
cat > /tmp/dir-enum-request.json << EOJSON
{
  "target": "https://sweetspotgov.com",
  "userIntent": "First, find all subdomains. Then, YOU MUST perform comprehensive directory brute-forcing on EACH subdomain found using the directory-bruteforce tool with SecLists wordlists. Use /seclists/Discovery/Web-Content/common.txt for quick scans, then /seclists/Discovery/Web-Content/directory-list-2.3-medium.txt for thorough coverage. For API endpoints, use /seclists/Discovery/Web-Content/api/api-endpoints-mazen160.txt. After directory discovery, test for SQL injection, JWT vulnerabilities, and API security issues on all discovered endpoints.",
  "constraints": {
    "environment": "development",
    "scope": ["/*"],
    "mandatoryTests": [
      "subdomain-scanner",
      "directory-bruteforce with SecLists on each subdomain",
      "api-discovery on each subdomain",
      "form-finder on discovered paths"
    ],
    "testPriority": {
      "recon": ["subdomain-scanner", "directory-bruteforce", "crawler"],
      "analyze": ["api-discovery", "form-finder", "header-analyzer"],
      "exploit": ["sql-injection", "jwt-analyzer", "api-fuzzer"]
    },
    "skipTimeLimit": true,
    "comprehensiveMode": true,
    "useSecListsWordlists": true
  }
}
EOJSON

# Send request to backend
echo "🚀 Sending comprehensive directory enumeration request..."
RESPONSE=$(curl -s -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -H "X-Workflow-Id: $WORKFLOW_ID" \
  -d @/tmp/dir-enum-request.json 2>&1)

# Check response
if [ -z "$RESPONSE" ] || [[ "$RESPONSE" == *"error"* ]]; then
    echo "❌ Request failed. Response: $RESPONSE"
    echo ""
    echo "Make sure the backend is running:"
    echo "  cd backend && npm run dev"
    exit 1
fi

echo ""
echo "📥 Initial Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

# Save response
echo "$RESPONSE" > "$OUTPUT_FILE"

echo ""
echo "=================================================="
echo "✅ Test Request Sent"
echo "=================================================="
echo "Output saved to: $OUTPUT_FILE"
echo ""
echo "Note: Directory enumeration can take 20-30 minutes to complete."
echo "Monitor progress with: ./monitor-system.sh"

# Clean up
rm -f /tmp/dir-enum-request.json
