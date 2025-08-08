#!/bin/bash

# ANALYZE TEST EXECUTION - Shows what's actually running vs what should run

echo "=== TEST EXECUTION ANALYSIS ==="
echo ""

if [ -z "$1" ]; then
    echo "Usage: ./analyze-test-execution.sh <workflow-id>"
    echo "Example: ./analyze-test-execution.sh d5eccce6-af84-4fb0-9bfb-78223c574bc2"
    exit 1
fi

WORKFLOW_ID=$1
LOG_FILE="logs/backend-live.log"

if [ ! -f "$LOG_FILE" ]; then
    LOG_FILE="logs/app.log"
fi

echo "Analyzing workflow: $WORKFLOW_ID"
echo "Using log file: $LOG_FILE"
echo ""

# 1. Show what was requested
echo "1. ORIGINAL REQUEST:"
grep "$WORKFLOW_ID" "$LOG_FILE" | grep -m1 "description" | grep -o '"description":"[^"]*"' | cut -d'"' -f4 | fold -w 80
echo ""

# 2. Show AI classification
echo "2. AI CLASSIFICATION RESULTS:"
CLASSIFICATION=$(grep "$WORKFLOW_ID" "$LOG_FILE" | grep "Classification complete")
if [ -n "$CLASSIFICATION" ]; then
    echo "$CLASSIFICATION" | grep -o '"matchedAttacks":[0-9]*' | cut -d':' -f2 | xargs -I {} echo "   Matched attacks: {}"
    echo "$CLASSIFICATION" | grep -o '"topMatch":"[^"]*"' | cut -d'"' -f4 | xargs -I {} echo "   Top match: {}"
    echo "$CLASSIFICATION" | grep -o '"confidence":"[^"]*"' | cut -d'"' -f4 | xargs -I {} echo "   Confidence: {}"
fi
echo ""

# 3. Show enrichment results
echo "3. CONTEXT ENRICHMENT:"
ENRICHMENT=$(grep "$WORKFLOW_ID" "$LOG_FILE" | grep "Context enrichment result")
if [ -n "$ENRICHMENT" ]; then
    echo "$ENRICHMENT" | grep -o '"criticalCount":[0-9]*' | cut -d':' -f2 | xargs -I {} echo "   Critical attacks: {}"
    echo "$ENRICHMENT" | grep -o '"standardCount":[0-9]*' | cut -d':' -f2 | xargs -I {} echo "   Standard attacks: {}"
    echo "$ENRICHMENT" | grep -o '"totalViable":[0-9]*' | cut -d':' -f2 | xargs -I {} echo "   Total viable: {}"
fi
echo ""

# 4. Show what attacks were planned
echo "4. EXECUTION PLAN:"
PLAN=$(grep "$WORKFLOW_ID" "$LOG_FILE" | grep "Starting phase execution")
if [ -n "$PLAN" ]; then
    echo "   Planned attacks:"
    echo "$PLAN" | grep -o '"attacks":\[[^]]*\]' | sed 's/,/\n   - /g' | sed 's/\["/   - /g' | sed 's/"\]//g' | sed 's/"//g'
fi
echo ""

# 5. Show what actually executed
echo "5. ACTUAL EXECUTION:"
echo "   Attacks started:"
grep "$WORKFLOW_ID" "$LOG_FILE" | grep "attack_execution.*start" | grep -o '"tool":"[^"]*"' | cut -d'"' -f4 | sort -u | while read tool; do
    echo "   ✓ $tool"
done
echo ""

# 6. Show failures
echo "6. FAILURES/WARNINGS:"
grep "$WORKFLOW_ID" "$LOG_FILE" | grep -E "warn|error" | grep -v "password" | head -10 | while read line; do
    if echo "$line" | grep -q "No tool found"; then
        attack=$(echo "$line" | grep -o '"attackId":"[^"]*"' | cut -d'"' -f4)
        echo "   ⚠️  No tool for: $attack"
    else
        message=$(echo "$line" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
        echo "   ❌ $message"
    fi
done
echo ""

# 7. Show results
echo "7. RESULTS:"
grep "$WORKFLOW_ID" "$LOG_FILE" | grep "attack_execution.*end" | while read line; do
    tool=$(echo "$line" | grep -o '"tool":"[^"]*"' | cut -d'"' -f4)
    findings=$(echo "$line" | grep -o '"findings":[0-9]*' | cut -d':' -f2)
    status=$(echo "$line" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    echo "   $tool: $status ($findings findings)"
done
echo ""

# 8. Summary
echo "8. SUMMARY:"
TOTAL_IDENTIFIED=$(grep "$WORKFLOW_ID" "$LOG_FILE" | grep "Classification complete" | grep -o '"matchedAttacks":[0-9]*' | cut -d':' -f2)
TOTAL_PLANNED=$(grep "$WORKFLOW_ID" "$LOG_FILE" | grep "Starting phase execution" | grep -o '"attacks":\[[^]]*\]' | grep -o '"' | wc -l | xargs -I {} expr {} / 2)
TOTAL_EXECUTED=$(grep "$WORKFLOW_ID" "$LOG_FILE" | grep "attack_execution.*start" | grep -o '"tool":"[^"]*"' | sort -u | wc -l)
TOTAL_COMPLETED=$(grep "$WORKFLOW_ID" "$LOG_FILE" | grep "attack_execution.*end" | wc -l)
TOTAL_FINDINGS=$(grep "$WORKFLOW_ID" "$LOG_FILE" | grep "attack_execution.*end" | grep -o '"findings":[0-9]*' | cut -d':' -f2 | awk '{s+=$1} END {print s}')

echo "   Tests identified by AI: $TOTAL_IDENTIFIED"
echo "   Tests planned to run: $TOTAL_PLANNED"
echo "   Tests actually started: $TOTAL_EXECUTED"
echo "   Tests completed: $TOTAL_COMPLETED"
echo "   Total findings: ${TOTAL_FINDINGS:-0}"
echo ""

# 9. What's missing
echo "9. WHAT'S MISSING:"
echo "   ❌ Subdomain enumeration (no tool mapped)"
echo "   ❌ Directory traversal (no tool mapped)"
echo "   ❌ JWT token testing (no tool mapped)"
echo "   ❌ CORS testing (no tool for cors-misconfig)"
echo "   ❌ Port scanning (no tool for port-scanning)"
echo "   ❌ 15 other identified attacks (no tools mapped)"