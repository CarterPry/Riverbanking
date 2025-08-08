#!/bin/bash

echo "🔄 Restarting backend with all fixes..."
echo "====================================="

# Kill any existing backend process
echo "Stopping current backend..."
pkill -f "npm run dev" || true
pkill -f "tsx watch" || true

# Give it a moment to clean up
sleep 2

# Start the backend with logging
echo "Starting backend with logging..."
cd backend
npm run dev 2>&1 | tee ../logs/backend-live.log &

echo "Waiting for backend to start..."
sleep 10

# Check if backend is running
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Backend is running!"
else
    echo "⚠️  Backend might still be starting. Waiting more..."
    sleep 10
fi

echo ""
echo "🚀 Ready to test! Run:"
echo "   ./trigger-all-sweetspot-tests.sh"
echo ""
echo "📊 Monitor with:"
echo "   ./MONITOR-EVERYTHING-NOW.sh"