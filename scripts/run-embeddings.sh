#!/bin/bash

# Load environment variables from .env file
if [ -f ../.env ]; then
    export $(cat ../.env | grep -v '^#' | xargs)
fi

# Run the embedding generation script
echo "Running embedding generation with OpenAI..."
python3 generate-embeddings.py 