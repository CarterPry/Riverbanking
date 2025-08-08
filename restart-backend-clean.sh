#!/bin/bash

echo "🛑 Killing ALL backend processes..."

# Kill all node processes on port 3001
echo "Finding processes on port 3001..."
lsof -ti:3001 | while read pid; do
    echo "Killing process $pid"
    kill -9 $pid 2>/dev/null || true
done

# Also kill any npm/tsx processes that might be running the backend
pkill -f "npm run dev" 2>/dev/null || true
pkill -f "tsx watch src/index.ts" 2>/dev/null || true
pkill -f "backend.*index.ts" 2>/dev/null || true

# Wait a moment for processes to fully die
sleep 2

# Verify nothing is on port 3001
if lsof -ti:3001 >/dev/null 2>&1; then
    echo "❌ ERROR: Port 3001 is still in use!"
    lsof -i:3001
    exit 1
else
    echo "✅ Port 3001 is clear!"
fi

echo ""
echo "🚀 Starting fresh backend with 10/10 exhaustive testing..."
cd backend
npm run dev