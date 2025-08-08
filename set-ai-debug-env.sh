#!/bin/bash
# Set environment variables for verbose AI logging

export LOG_LEVEL=debug
export AI_DEBUG=true
export LOG_AI_REQUESTS=true
export LOG_AI_RESPONSES=true
export LOG_EMBEDDING_DETAILS=true

echo "AI debug logging environment variables set:"
echo "  LOG_LEVEL=debug"
echo "  AI_DEBUG=true"
echo "  LOG_AI_REQUESTS=true"
echo "  LOG_AI_RESPONSES=true"
echo "  LOG_EMBEDDING_DETAILS=true"
echo ""
echo "Now start the backend with: npm run dev"
