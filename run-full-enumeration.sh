#!/bin/bash

echo "=========================================="
echo "AI-DRIVEN FULL ENUMERATION TEST"
echo "Target: sweetspotgov.com"
echo "Start Time: $(date)"
echo "=========================================="
echo ""

# Kill any existing backend
pkill -f "tsx watch" || true
sleep 2

# Start backend with detailed logging
cd backend
echo "Starting AI backend with detailed logging..."
npm run dev > ../enumeration-test.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait for backend
echo "Waiting for backend to initialize..."
sleep 5

# Verify backend is running
if ! curl -s http://localhost:3001/health > /dev/null; then
    echo "❌ Backend failed to start"
    cat enumeration-test.log | tail -20
    exit 1
fi

echo "✅ Backend is running"
echo ""

# Create comprehensive enumeration request
cat > enumeration-request.json << 'EOF'
{
  "target": "sweetspotgov.com",
  "userIntent": "Perform a comprehensive enumeration scan on sweetspotgov.com. I want you to: 1) Enumerate ALL subdomains, 2) Scan all discovered subdomains for open ports and services, 3) Identify all directories and endpoints, 4) Discover all API endpoints, 5) Fingerprint all technologies in use. Focus on thorough discovery before moving to vulnerability testing.",
  "constraints": {
    "environment": "development",
    "timeLimit": 1800000,
    "scope": ["sweetspotgov.com", "*.sweetspotgov.com"]
  }
}
EOF

echo "📋 Request Details:"
echo "- Comprehensive enumeration requested"
echo "- Full subdomain discovery"
echo "- Port and service scanning"
echo "- Directory and endpoint enumeration"
echo "- Technology fingerprinting"
echo ""

# Start log monitoring in background
echo "📊 Starting real-time monitoring..."
echo ""

# Monitor logs with timestamps
tail -f enumeration-test.log | while read line; do
    echo "[$(date '+%H:%M:%S')] $line"
done | grep -E "(Strategic|Planning|AI strategy|phase|Executing tool|Finding|subdomain|port|directory|technology|decision|reasoning|confidence)" &
MONITOR_PID=$!

# Execute the request
echo "🚀 Sending enumeration request..."
echo "=========================================="
echo ""

RESPONSE=$(curl -s -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -d @enumeration-request.json)

WORKFLOW_ID=$(echo "$RESPONSE" | jq -r '.result.workflowId' 2>/dev/null)

if [ -z "$WORKFLOW_ID" ] || [ "$WORKFLOW_ID" = "null" ]; then
    echo "❌ Failed to start workflow"
    echo "$RESPONSE" | jq .
    kill $MONITOR_PID $BACKEND_PID 2>/dev/null
    exit 1
fi

echo "✅ Workflow started: $WORKFLOW_ID"
echo ""
echo "🔍 Monitoring AI decisions and tool execution..."
echo "=========================================="
echo ""

# Monitor for specific time periods
PHASES=("RECONNAISSANCE (0-60s)" "ANALYSIS (60-120s)" "DEEP SCAN (120-180s)")
for i in {0..2}; do
    echo ""
    echo "⏱️  Phase: ${PHASES[$i]}"
    echo "----------------------------------------"
    sleep 60
    
    # Check current status
    STATUS=$(curl -s http://localhost:3001/api/v2/workflow/$WORKFLOW_ID/status)
    echo "Current workflow status: $(echo "$STATUS" | jq -r '.status // "running"')"
    
    # Show recent AI decisions
    echo ""
    echo "Recent AI activity:"
    tail -20 enumeration-test.log | grep -E "(decision|Finding|Executing)" | tail -5
done

echo ""
echo "🏁 Stopping monitoring after 3 minutes..."
kill $MONITOR_PID 2>/dev/null

# Get final results
echo ""
echo "=========================================="
echo "📊 FINAL RESULTS"
echo "=========================================="
echo ""

# Get audit report
AUDIT=$(curl -s http://localhost:3001/api/v2/workflow/$WORKFLOW_ID/audit)

if echo "$AUDIT" | jq . > /dev/null 2>&1; then
    echo "AI Decision Summary:"
    echo "- Total Decisions: $(echo "$AUDIT" | jq '.totalDecisions // 0')"
    echo "- Average Confidence: $(echo "$AUDIT" | jq '.averageConfidence // 0')"
    echo "- Decision Types: $(echo "$AUDIT" | jq -c '.decisionsByType // {}')"
    
    echo ""
    echo "Timeline of AI Decisions:"
    echo "$AUDIT" | jq -r '.timeline[]? | "[\(.timestamp | split("T")[1] | split(".")[0])] \(.type): \(.summary)"' 2>/dev/null || echo "No timeline data"
    
    echo ""
    echo "Compliance Summary:"
    echo "$AUDIT" | jq '.complianceSummary // {}' 2>/dev/null
fi

# Check for findings
echo ""
echo "Enumeration Findings:"
FINDINGS_DIR="backend/logs/ai-decisions/$WORKFLOW_ID"
if [ -d "$FINDINGS_DIR" ]; then
    echo "Decision files created: $(ls -1 "$FINDINGS_DIR" | wc -l)"
    
    # Show first decision file
    FIRST_DECISION=$(ls -1 "$FINDINGS_DIR" | head -1)
    if [ ! -z "$FIRST_DECISION" ]; then
        echo ""
        echo "Sample AI Decision:"
        cat "$FINDINGS_DIR/$FIRST_DECISION" | jq '.output.reasoning // .output.decision' 2>/dev/null | head -10
    fi
fi

# Save complete results
echo "$AUDIT" | jq . > "enumeration-results-$WORKFLOW_ID.json"
echo ""
echo "✅ Complete results saved to: enumeration-results-$WORKFLOW_ID.json"

# Show execution summary from logs
echo ""
echo "=========================================="
echo "📋 EXECUTION SUMMARY"
echo "=========================================="
echo ""
echo "Tools executed:"
grep "Executing tool" enumeration-test.log | grep -o "tool.*" | sort | uniq -c || echo "No tools executed"

echo ""
echo "Findings summary:"
grep -i "finding" enumeration-test.log | tail -10 || echo "No findings logged"

# Cleanup
kill $BACKEND_PID 2>/dev/null
rm -f enumeration-request.json

echo ""
echo "=========================================="
echo "✅ Test Complete!"
echo "End Time: $(date)"
echo "=========================================="
echo ""
echo "What to look for:"
echo "1. AI reasoning for enumeration strategy"
echo "2. Progressive discovery (subdomains → ports → directories)"
echo "3. Timestamp progression showing actual scanning"
echo "4. Decision confidence levels"
echo "5. Tool selection based on findings"