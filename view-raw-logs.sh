#!/bin/bash

# RAW LOG VIEWER - Shows logs exactly as they are with minimal processing

echo "=== RAW LOG VIEWER ==="
echo "Showing backend/logs/app.log in real-time"
echo "No filtering, no parsing - just the raw truth"
echo ""
echo "Tips:"
echo "- Each line is a JSON object"
echo "- Look for 'module', 'event', 'message' fields"
echo "- Workflow IDs track individual test runs"
echo ""
echo "Starting in 3 seconds..."
sleep 3

# Simple tail with line numbers
tail -f backend/logs/app.log | nl