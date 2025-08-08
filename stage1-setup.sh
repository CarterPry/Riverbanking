#!/bin/bash

echo "======================================"
echo "Stage 1: Dependencies & Environment Setup"
echo "======================================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "Error: Not in project root directory"
    echo "Please run this script from the project root"
    exit 1
fi

echo "1. Installing npm dependencies..."
cd backend

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "Error: backend/package.json not found"
    exit 1
fi

# Add @anthropic-ai/sdk to package.json
echo "Adding @anthropic-ai/sdk to dependencies..."
npm install @anthropic-ai/sdk@latest --save

echo "2. Creating required directories..."
mkdir -p logs/ai-decisions
mkdir -p logs/workflows
mkdir -p ../tmp
echo "Directories created."

echo "3. Setting up environment variables..."
cd ..

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    touch .env
fi

# Check if ANTHROPIC_API_KEY is already set
if ! grep -q "ANTHROPIC_API_KEY" .env; then
    echo "" >> .env
    echo "# AI Integration Configuration" >> .env
    echo "ANTHROPIC_API_KEY=your-anthropic-api-key-here" >> .env
    echo "ANTHROPIC_MODEL=claude-3-opus-20240229" >> .env
    echo "ENABLE_AI_MONITORING=true" >> .env
    echo "AI_DECISION_LOG_PATH=./logs/ai-decisions" >> .env
    echo "ENABLE_REAL_TIME_UPDATES=true" >> .env
    echo "" >> .env
    echo "⚠️  IMPORTANT: Please update ANTHROPIC_API_KEY in .env file with your actual key"
else
    echo "ANTHROPIC_API_KEY already exists in .env"
fi

# Check if OPENAI_API_KEY exists
if ! grep -q "OPENAI_API_KEY" .env; then
    echo "⚠️  WARNING: OPENAI_API_KEY not found in .env (needed for embeddings)"
fi

echo ""
echo "Stage 1 Complete! ✅"
echo ""
echo "Next steps:"
echo "1. Update ANTHROPIC_API_KEY in .env with your actual API key"
echo "2. Ensure OPENAI_API_KEY is set in .env"
echo "3. Run stage2-database.sh to continue"