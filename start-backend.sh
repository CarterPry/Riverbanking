#!/bin/bash
echo "🚀 Starting enhanced backend..."
cd backend

# Kill existing processes
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Copy fixed version
cp src/index-fixed.ts src/index.ts

# Start backend
npm run dev
