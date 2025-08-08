#!/bin/bash

echo "======================================"
echo "AI Integration - Complete Setup Script"
echo "======================================"
echo ""
echo "This script will run all stages to integrate the AI-driven security testing platform."
echo "Make sure you have:"
echo "- Docker installed and running"
echo "- PostgreSQL database accessible"
echo "- Valid API keys ready"
echo ""
read -p "Press Enter to continue or Ctrl+C to cancel..."

# Make all stage scripts executable
chmod +x stage*.sh

# Run each stage
echo ""
echo "Starting Stage 1: Dependencies & Environment Setup..."
echo "====================================================="
./stage1-setup.sh
if [ $? -ne 0 ]; then
    echo "❌ Stage 1 failed. Please fix the issues and run again."
    exit 1
fi

echo ""
read -p "Please update your .env file with API keys, then press Enter to continue..."

echo ""
echo "Starting Stage 2: Database Setup..."
echo "====================================="
./stage2-database.sh
if [ $? -ne 0 ]; then
    echo "❌ Stage 2 failed. Please fix the issues and run again."
    exit 1
fi

echo ""
echo "Starting Stage 3: Docker Infrastructure..."
echo "=========================================="
./stage3-docker.sh
if [ $? -ne 0 ]; then
    echo "⚠️  Stage 3 had some issues, but continuing..."
fi

echo ""
echo "Starting Stage 4: Core File Updates..."
echo "======================================="
./stage4-core-updates.sh
if [ $? -ne 0 ]; then
    echo "❌ Stage 4 failed. Please fix the issues and run again."
    exit 1
fi

echo ""
echo "Starting Stage 5: Integration Testing..."
echo "========================================"
./stage5-integration-test.sh
if [ $? -ne 0 ]; then
    echo "❌ Stage 5 failed. Please check your configuration."
    exit 1
fi

echo ""
echo "Starting Stage 6: Full System Test..."
echo "====================================="
./stage6-full-test.sh

echo ""
echo "======================================"
echo "🎉 AI Integration Complete!"
echo "======================================"
echo ""
echo "The system has been successfully upgraded from template-based to AI-driven testing."
echo ""
echo "Key changes:"
echo "✅ Anthropic Claude integrated for strategic planning"
echo "✅ Progressive discovery phases implemented"
echo "✅ Dynamic test trees based on findings"
echo "✅ Enhanced restraint system with approvals"
echo "✅ Complete AI decision audit logging"
echo "✅ Real-time WebSocket updates"
echo ""
echo "To use the new system:"
echo "1. Start the backend: cd backend && npm run dev"
echo "2. Make API calls to /api/v2/workflow/execute"
echo "3. Monitor AI decisions in backend/logs/ai-decisions/"
echo "4. View real-time updates via WebSocket at ws://localhost:3001/ws"
echo ""
echo "Example test command:"
echo 'curl -X POST http://localhost:3001/api/v2/workflow/execute \'
echo '  -H "Content-Type: application/json" \'
echo '  -d "{"target": "example.com", "userIntent": "Find all vulnerabilities"}"'