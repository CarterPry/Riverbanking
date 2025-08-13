#!/bin/bash

# Debug test to see what the AI is actually receiving and responding

echo "🔍 AI Debug Test - Checking 10x10 Behavior"
echo "=========================================="

# Generate unique test ID
TEST_ID="debug-$(date +%s)-$$"
OUTPUT_DIR="ai-test-outputs"
mkdir -p "$OUTPUT_DIR"

# Test with explicit debug request
echo "📤 Sending debug test request..."
curl -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -d '{
    "target": "https://debug-test.example.com",
    "userIntent": "DEBUG: Please show me your full reasoning. I need to see 10 individual tests minimum. For any subdomains found, create SEPARATE directory-bruteforce, port-scanner, and tech-fingerprint tests for EACH. Show me your self-critique loops.",
    "constraints": {
      "environment": "development",
      "minTestsPerPhase": 10
    }
  }' > "$OUTPUT_DIR/debug-$TEST_ID.json" 2>&1

echo ""
echo "✅ Response saved to: $OUTPUT_DIR/debug-$TEST_ID.json"
echo ""

# Extract and display key information
echo "📊 Checking AI Response:"
echo "------------------------"

# Count recommendations
RECOMMENDATIONS=$(cat "$OUTPUT_DIR/debug-$TEST_ID.json" | jq -r '.result.phases[0].results | length' 2>/dev/null || echo "0")
echo "Number of tests executed: $RECOMMENDATIONS"

# Show AI reasoning
echo ""
echo "🧠 AI Reasoning:"
cat "$OUTPUT_DIR/debug-$TEST_ID.json" | jq -r '.result.phases[0].aiReasoning' 2>/dev/null || echo "No reasoning found"

# Check for directory-bruteforce tool
echo ""
echo "🔨 Tools Used:"
cat "$OUTPUT_DIR/debug-$TEST_ID.json" | jq -r '.result.phases[0].results[].tool' 2>/dev/null | sort | uniq -c

# Show any errors
echo ""
echo "❌ Errors (if any):"
cat "$OUTPUT_DIR/debug-$TEST_ID.json" | jq -r '.error' 2>/dev/null || echo "No errors"

echo ""
echo "📄 Full response available at: $OUTPUT_DIR/debug-$TEST_ID.json"