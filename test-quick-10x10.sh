#!/bin/bash

echo "🧪 Quick 10x10 Test with Monitoring"
echo "==================================="

# Run test and capture the workflow ID
RESPONSE=$(curl -s -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -d '{
    "target": "https://quick-test.example.com",
    "userIntent": "Test each subdomain individually with all tools",
    "constraints": {
      "environment": "development",
      "minTestsPerPhase": 20
    }
  }')

WORKFLOW_ID=$(echo "$RESPONSE" | jq -r '.result.workflowId')
echo "📝 Workflow ID: $WORKFLOW_ID"

# Check recon tests
echo ""
echo "🔍 Recon Phase Tests:"
echo "$RESPONSE" | jq '.result.phases[0].results | length' | xargs -I {} echo "  - Total tests: {}"
echo "$RESPONSE" | jq -r '.result.phases[0].results[].tool' | sort | uniq -c

# Check analyze tests  
echo ""
echo "🔬 Analyze Phase Tests:"
echo "$RESPONSE" | jq '.result.phases[1].results | length' 2>/dev/null | xargs -I {} echo "  - Total tests: {}"
echo "$RESPONSE" | jq -r '.result.phases[1].results[].tool' 2>/dev/null | sort | uniq -c

# Show AI reasoning excerpts
echo ""
echo "🤖 AI Reasoning:"
echo "$RESPONSE" | jq -r '.result.phases[0].aiReasoning' | head -3
echo "$RESPONSE" | jq -r '.result.phases[1].aiReasoning' 2>/dev/null | head -3