#!/bin/bash

# COMPREHENSIVE LOG VIEWER - Shows EVERYTHING
# No filtering, no parsing errors, just raw logs with highlighting

echo "=== SHOWING ALL BACKEND ACTIVITY ==="
echo "This will display EVERYTHING: AI calls, Docker containers, API requests, tool executions"
echo ""
echo "Starting in 3 seconds..."
sleep 3

# Use tail with grep to highlight important terms but show ALL lines
tail -f backend/logs/app.log | while IFS= read -r line; do
    # Print timestamp if available
    timestamp=$(echo "$line" | grep -o '"timestamp":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$timestamp" ]; then
        printf "\033[90m[%s]\033[0m " "$timestamp"
    fi
    
    # Highlight different types of events with colors
    if echo "$line" | grep -q "IntentClassifier"; then
        echo -e "\033[36m[CLASSIFIER]\033[0m $line"
    elif echo "$line" | grep -q "embedding"; then
        echo -e "\033[34m[EMBEDDING]\033[0m $line"
    elif echo "$line" | grep -q "attack_execution"; then
        echo -e "\033[31m[ATTACK]\033[0m $line"
    elif echo "$line" | grep -q "DockerService"; then
        echo -e "\033[35m[DOCKER]\033[0m $line"
    elif echo "$line" | grep -q "ToolHandler"; then
        echo -e "\033[33m[TOOL]\033[0m $line"
    elif echo "$line" | grep -q "workflow"; then
        echo -e "\033[32m[WORKFLOW]\033[0m $line"
    elif echo "$line" | grep -q "error"; then
        echo -e "\033[91m[ERROR]\033[0m $line"
    else
        # Just print the line as-is
        echo "$line"
    fi
done