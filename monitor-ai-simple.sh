#!/bin/bash

# Simple AI monitoring without complex jq filters
# This avoids the parsing errors

echo "=== Simple AI Communication Monitor ==="
echo "Watching for AI-related activity..."
echo ""
echo "Press Ctrl+C to exit"
echo ""

# Monitor the log file with simple grep filters
tail -f backend/logs/app.log | while read line; do
    # Check if line contains AI-related keywords
    if echo "$line" | grep -E "IntentClassifier|EmbeddingService|embedding_generation|embedding_query|classification|AI Request|AI Response" > /dev/null 2>&1; then
        # Try to parse as JSON, if it fails just print the line
        parsed=$(echo "$line" | jq -r '"\(.timestamp // "NO_TIME") [\(.level // "INFO")] \(.module // "APP"): \(.message // .event // "NO_MSG")"' 2>/dev/null)
        
        if [ -n "$parsed" ] && [ "$parsed" != "null" ]; then
            echo "$parsed"
        else
            # If JSON parsing fails, just show the line
            echo "$line"
        fi
    fi
done