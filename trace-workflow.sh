#!/bin/bash

# WORKFLOW TRACER - Shows complete workflow execution from start to finish
# Usage: ./trace-workflow.sh [workflow-id]

WORKFLOW_ID=$1

if [ -z "$WORKFLOW_ID" ]; then
    echo "Showing ALL workflow activity. To trace specific workflow, use: ./trace-workflow.sh <workflow-id>"
    echo ""
    # Show all workflows
    grep -E "workflowId|workflow_" backend/logs/app.log | tail -100
else
    echo "=== TRACING WORKFLOW: $WORKFLOW_ID ==="
    echo "Showing complete execution flow..."
    echo ""
    
    # Extract all logs for this specific workflow
    grep "$WORKFLOW_ID" backend/logs/app.log | while IFS= read -r line; do
        # Extract key information
        if echo "$line" | grep -q "Classification complete"; then
            echo -e "\033[36m[CLASSIFICATION]\033[0m"
            echo "$line" | python3 -m json.tool 2>/dev/null || echo "$line"
            echo ""
        elif echo "$line" | grep -q "attack_execution"; then
            echo -e "\033[31m[ATTACK EXECUTION]\033[0m"
            echo "$line" | python3 -m json.tool 2>/dev/null || echo "$line"
            echo ""
        elif echo "$line" | grep -q "Starting container"; then
            echo -e "\033[35m[DOCKER CONTAINER]\033[0m"
            echo "$line" | python3 -m json.tool 2>/dev/null || echo "$line"
            echo ""
        elif echo "$line" | grep -q "Tool execution"; then
            echo -e "\033[33m[TOOL]\033[0m"
            echo "$line" | python3 -m json.tool 2>/dev/null || echo "$line"
            echo ""
        else
            echo "$line"
        fi
    done
fi