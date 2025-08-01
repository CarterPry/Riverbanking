#!/bin/bash

# SOC2 Testing Platform - Database Setup Script
# This script initializes the PostgreSQL database with pgvector

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 SOC2 Testing Platform - Database Setup"
echo "========================================"

# Default values
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-soc2user}"
DB_PASSWORD="${DB_PASSWORD:-soc2password}"
DB_NAME="${DB_NAME:-soc2db}"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --host)
      DB_HOST="$2"
      shift 2
      ;;
    --port)
      DB_PORT="$2"
      shift 2
      ;;
    --user)
      DB_USER="$2"
      shift 2
      ;;
    --password)
      DB_PASSWORD="$2"
      shift 2
      ;;
    --database)
      DB_NAME="$2"
      shift 2
      ;;
    --docker)
      USE_DOCKER=true
      shift
      ;;
    --reset)
      RESET_DB=true
      shift
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo "Options:"
      echo "  --host HOST        Database host (default: localhost)"
      echo "  --port PORT        Database port (default: 5432)"
      echo "  --user USER        Database user (default: soc2user)"
      echo "  --password PASS    Database password (default: soc2password)"
      echo "  --database NAME    Database name (default: soc2db)"
      echo "  --docker           Use Docker Compose to start database"
      echo "  --reset            Drop and recreate database"
      echo "  --help             Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Export for psql commands
export PGPASSWORD="$DB_PASSWORD"

# Function to check if PostgreSQL is running
check_postgres() {
  pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" > /dev/null 2>&1
}

# Function to run SQL file
run_sql_file() {
  local file=$1
  local db=$2
  echo -e "${YELLOW}Running: $file${NC}"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$db" -f "$file"
}

# Start Docker Compose if requested
if [ "$USE_DOCKER" = true ]; then
  echo -e "${YELLOW}Starting PostgreSQL with Docker Compose...${NC}"
  docker-compose up -d postgres
  
  # Wait for PostgreSQL to be ready
  echo -n "Waiting for PostgreSQL to be ready..."
  for i in {1..30}; do
    if check_postgres; then
      echo -e " ${GREEN}Ready!${NC}"
      break
    fi
    echo -n "."
    sleep 1
  done
  
  if ! check_postgres; then
    echo -e " ${RED}Failed!${NC}"
    echo "PostgreSQL did not start within 30 seconds"
    exit 1
  fi
fi

# Check if PostgreSQL is accessible
if ! check_postgres; then
  echo -e "${RED}Error: Cannot connect to PostgreSQL at $DB_HOST:$DB_PORT${NC}"
  echo "Make sure PostgreSQL is running and accessible"
  echo "You can use --docker flag to start it with Docker Compose"
  exit 1
fi

echo -e "${GREEN}✓ PostgreSQL is accessible${NC}"

# Create database if it doesn't exist
echo -e "${YELLOW}Checking database...${NC}"
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  echo "Creating database: $DB_NAME"
  createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"
  echo -e "${GREEN}✓ Database created${NC}"
else
  echo -e "${GREEN}✓ Database already exists${NC}"
  
  if [ "$RESET_DB" = true ]; then
    echo -e "${YELLOW}Resetting database...${NC}"
    dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"
    createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"
    echo -e "${GREEN}✓ Database reset complete${NC}"
  fi
fi

# Run initialization script
echo -e "${YELLOW}Initializing database schema...${NC}"
run_sql_file "database/init.sql" "$DB_NAME"
echo -e "${GREEN}✓ Schema initialized${NC}"

# Run migrations
echo -e "${YELLOW}Running migrations...${NC}"
for migration in database/migrations/*.sql; do
  if [ -f "$migration" ]; then
    run_sql_file "$migration" "$DB_NAME"
  fi
done
echo -e "${GREEN}✓ Migrations completed${NC}"

# Verify pgvector extension
echo -e "${YELLOW}Verifying pgvector extension...${NC}"
VECTOR_CHECK=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1 FROM pg_extension WHERE extname='vector'")
if [ "$VECTOR_CHECK" = "1" ]; then
  echo -e "${GREEN}✓ pgvector extension is installed${NC}"
else
  echo -e "${RED}✗ pgvector extension is not installed${NC}"
  echo "Please use a PostgreSQL image with pgvector support"
  exit 1
fi

# Load initial embeddings if available
if [ -f "scripts/embeddings.json" ]; then
  echo -e "${YELLOW}Loading initial embeddings...${NC}"
  python3 scripts/load-embeddings.py --host "$DB_HOST" --port "$DB_PORT" --user "$DB_USER" --password "$DB_PASSWORD" --database "$DB_NAME"
  echo -e "${GREEN}✓ Embeddings loaded${NC}"
elif [ -f "scripts/insert_embeddings.sql" ]; then
  echo -e "${YELLOW}Loading embeddings from SQL...${NC}"
  run_sql_file "scripts/insert_embeddings.sql" "$DB_NAME"
  echo -e "${GREEN}✓ Embeddings loaded${NC}"
else
  echo -e "${YELLOW}⚠ No embeddings file found. Run 'python3 scripts/generate-embeddings.py' to generate them${NC}"
fi

# Create test database if in development
if [ "$NODE_ENV" = "development" ] || [ "$NODE_ENV" = "test" ]; then
  TEST_DB="${DB_NAME}_test"
  echo -e "${YELLOW}Creating test database: $TEST_DB${NC}"
  
  if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$TEST_DB"; then
    createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB"
    run_sql_file "database/init.sql" "$TEST_DB"
    echo -e "${GREEN}✓ Test database created${NC}"
  else
    echo -e "${GREEN}✓ Test database already exists${NC}"
  fi
fi

# Summary
echo ""
echo -e "${GREEN}✅ Database setup complete!${NC}"
echo ""
echo "Connection details:"
echo "  Host:     $DB_HOST"
echo "  Port:     $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User:     $DB_USER"
echo ""
echo "Connection string:"
echo "  postgresql://$DB_USER:****@$DB_HOST:$DB_PORT/$DB_NAME"
echo ""

# Test connection
echo -e "${YELLOW}Testing connection...${NC}"
TEST_RESULT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM soc2.attack_patterns")
echo -e "${GREEN}✓ Connection successful${NC}"
echo "  Attack patterns in database: $TEST_RESULT"

echo ""
echo "Next steps:"
echo "1. Start Ollama: ollama serve"
echo "2. Pull embedding model: ollama pull nomic-embed-text"
echo "3. Generate embeddings: python3 scripts/generate-embeddings.py"
echo "4. Start the backend: cd backend && npm run dev" 