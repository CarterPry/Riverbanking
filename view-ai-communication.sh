#!/bin/bash

# Simple script to view AI communication for a workflow

if [ -z "$1" ]; then
    echo "Usage: ./view-ai-communication.sh <workflow-id>"
    echo ""
    echo "Example: ./view-ai-communication.sh fd0dc3d2-7caf-4edb-8893-37cfebdc1944"
    exit 1
fi

WORKFLOW_ID=$1

echo "🧠 AI Communication Data for Workflow: $WORKFLOW_ID"
echo "=" 
echo ""

# Get AI communication data
echo "📊 Fetching AI data..."
curl -s "http://localhost:3000/api/debug/ai-communication/$WORKFLOW_ID" | jq '.' 2>/dev/null

if [ $? -ne 0 ]; then
    echo "❌ Failed to fetch AI communication data"
    echo "Make sure the backend is running and the workflow ID is correct"
    exit 1
fi

echo ""
echo "📝 Recent AI logs for this workflow:"
echo ""

# Search logs for this workflow's AI activity
grep "$WORKFLOW_ID" backend/logs/app.log 2>/dev/null | \
    grep -E "(IntentClassifier|ContextEnrichment|TrustClassifier|EmbeddingService|similarity|classification|enrichment)" | \
    tail -20 | \
    while read -r line; do
        # Try to parse as JSON and extract relevant info
        if echo "$line" | jq -e . >/dev/null 2>&1; then
            timestamp=$(echo "$line" | jq -r '.timestamp // ""')
            module=$(echo "$line" | jq -r '.module // ""')
            message=$(echo "$line" | jq -r '.message // ""')
            
            case "$module" in
                "IntentClassifier")
                    echo "🧠 [$timestamp] $message"
                    ;;
                "ContextEnrichment")
                    echo "🔍 [$timestamp] $message"
                    ;;
                "TrustClassifier")
                    echo "🛡️ [$timestamp] $message"
                    ;;
                "EmbeddingService")
                    echo "🔢 [$timestamp] $message"
                    ;;
                *)
                    echo "📝 [$timestamp] $message"
                    ;;
            esac
        fi
    done