#!/bin/bash

# FIND ACTIVE LOGS - Locates where logs are actually being written

echo "=== FINDING ACTIVE LOG FILES ==="
echo ""

# Check common log locations
echo "1. Checking logs/ directory:"
if [ -d "logs" ]; then
    echo "   Found logs/ directory"
    ls -la logs/*.log 2>/dev/null | tail -5
    echo ""
    echo "   Most recent entry:"
    tail -1 logs/*.log 2>/dev/null
else
    echo "   No logs/ directory in current path"
fi
echo ""

# Check backend/logs/
echo "2. Checking backend/logs/ directory:"
if [ -d "backend/logs" ]; then
    echo "   Found backend/logs/ directory"
    ls -la backend/logs/*.log 2>/dev/null
    echo ""
    echo "   Most recent app.log entry:"
    tail -1 backend/logs/app.log 2>/dev/null
else
    echo "   No backend/logs/ directory"
fi
echo ""

# Check for any recently modified log files
echo "3. Recently modified log files (last hour):"
find . -name "*.log" -type f -mmin -60 2>/dev/null | while read file; do
    echo "   $file ($(wc -l < "$file") lines)"
    echo "   Last entry: $(tail -1 "$file" | cut -c1-100)..."
done
echo ""

# Check if backend is logging to stdout
echo "4. Checking if backend is running:"
BACKEND_PID=$(lsof -i :3000 -t 2>/dev/null)
if [ -n "$BACKEND_PID" ]; then
    echo "   Backend is running (PID: $BACKEND_PID)"
    echo "   Backend may be logging to console instead of files"
    echo ""
    echo "   To capture console logs, restart backend with:"
    echo "   cd backend && npm run dev 2>&1 | tee ../backend-live.log"
else
    echo "   Backend is not running on port 3000"
fi
echo ""

# Look for the main logs directory
echo "5. Searching for 'logs' directories with recent activity:"
find . -type d -name "logs" 2>/dev/null | while read dir; do
    recent=$(find "$dir" -type f -mmin -1440 2>/dev/null | wc -l)
    if [ "$recent" -gt 0 ]; then
        echo "   $dir (${recent} files modified in last 24h)"
    fi
done
echo ""

# Suggest the proper log location
echo "=== RECOMMENDATION ==="
echo "Based on your backend configuration, logs should be in:"
echo "  ./logs/app.log (project root)"
echo ""
echo "To ensure logs are captured:"
echo "1. Create logs directory: mkdir -p logs"
echo "2. Start backend with logging: cd backend && npm run dev"
echo "3. Or capture console output: cd backend && npm run dev 2>&1 | tee ../logs/backend-live.log"