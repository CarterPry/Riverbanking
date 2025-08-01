#!/bin/bash

# SOC2 Testing Platform - Docker Database Setup Script
# This script initializes the PostgreSQL database with pgvector in Docker

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 SOC2 Testing Platform - Docker Database Setup"
echo "============================================="

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: docker-compose is not installed${NC}"
    exit 1
fi

# Function to wait for database to be ready
wait_for_db() {
    echo -e "${YELLOW}Waiting for database to be ready...${NC}"
    local retries=30
    while [ $retries -gt 0 ]; do
        if docker-compose exec -T db pg_isready -U user -d soc2db &> /dev/null; then
            echo -e "${GREEN}Database is ready!${NC}"
            return 0
        fi
        retries=$((retries - 1))
        echo -n "."
        sleep 1
    done
    echo -e "${RED}Database failed to start${NC}"
    return 1
}

# Start database service
echo "Starting database service..."
docker-compose up -d db

# Wait for database to be ready
if ! wait_for_db; then
    exit 1
fi

# Run migrations
echo -e "${YELLOW}Running database migrations...${NC}"

# Create pgvector extension
docker-compose exec -T db psql -U user -d soc2db << EOF
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EOF

# Run migration files
for migration in database/migrations/*.sql; do
    if [ -f "$migration" ]; then
        echo "Running migration: $(basename $migration)"
        docker-compose exec -T db psql -U user -d soc2db < "$migration"
    fi
done

# Insert embeddings if available
if [ -f "scripts/insert_embeddings.sql" ]; then
    echo -e "${YELLOW}Loading embeddings...${NC}"
    docker-compose exec -T db psql -U user -d soc2db < scripts/insert_embeddings.sql
    echo -e "${GREEN}Embeddings loaded successfully${NC}"
fi

# Verify setup
echo -e "${YELLOW}Verifying database setup...${NC}"
docker-compose exec -T db psql -U user -d soc2db << EOF
SELECT COUNT(*) as table_count FROM information_schema.tables 
WHERE table_schema = 'public';

SELECT COUNT(*) as embedding_count FROM embeddings;
EOF

echo -e "${GREEN}✅ Database setup complete!${NC}"
echo ""
echo "Database connection details:"
echo "  Host: localhost"
echo "  Port: 5432"
echo "  Database: soc2db"
echo "  User: user"
echo "  Password: password"
echo ""