#!/bin/bash

echo "🚀 Starting 10x10 Exhaustive Testing Platform"
echo "============================================"

# Kill any existing backend processes
echo "🛑 Cleaning up old processes..."
pkill -f "tsx watch src/index.ts" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
sleep 2

# Check if port is clear
if lsof -ti:3001 >/dev/null 2>&1; then
    echo "❌ Port 3001 is still in use. Killing processes..."
    lsof -ti:3001 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# Start backend
echo "🔧 Starting backend with 10x10 exhaustive testing..."
cd backend
npm run dev &
BACKEND_PID=$!
cd ..

# Wait for backend to be ready
echo "⏳ Waiting for backend to initialize..."
for i in {1..10}; do
    if curl -s http://localhost:3001/health >/dev/null 2>&1; then
        echo "✅ Backend is ready!"
        break
    fi
    sleep 2
    echo "   Still waiting... ($i/10)"
done

echo ""
echo "🎯 10x10 Exhaustive Testing Platform Ready!"
echo "=========================================="
echo ""
echo "Run tests with:"
echo "  ./test-ai-direct.sh"
echo ""
echo "Expected behavior:"
echo "  - 40+ individual tests per run"
echo "  - Each subdomain tested separately"
echo "  - Comprehensive vulnerability scanning"
echo "  - No test omissions"
echo ""
echo "Backend PID: $BACKEND_PID"
echo "To stop: kill $BACKEND_PID"