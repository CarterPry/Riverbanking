#!/bin/bash

echo "=================================================="
echo "🔄 Restarting Backend with Exhaustive AI Prompt"
echo "=================================================="
echo ""

# Kill existing backend process
echo "Stopping existing backend..."
pkill -f "tsx watch" || true
pkill -f "node.*index.ts" || true

# Wait a moment
sleep 2

# Start backend
echo "Starting backend with new exhaustive prompt..."
cd backend && npm run dev &

# Wait for backend to start
echo "Waiting for backend to initialize..."
sleep 5

# Check if running
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo ""
    echo "✅ Backend is running with the new exhaustive AI prompt!"
    echo ""
    echo "The AI will now:"
    echo "- List every finding individually"
    echo "- Plan tests for each subdomain separately"
    echo "- Self-critique to ensure nothing is missed"
    echo "- Consider all OWASP categories"
    echo ""
    echo "Run tests with:"
    echo "  ./test-exhaustive-ai.sh"
    echo "  ./test-directory-enumeration.sh"
    echo "  ./test-ai-direct.sh"
else
    echo "❌ Backend failed to start. Check logs."
fi
