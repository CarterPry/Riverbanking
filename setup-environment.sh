#!/bin/bash

echo "======================================"
echo "SETTING UP ENVIRONMENT PROPERLY"
echo "======================================"
echo ""

# Backup original .env
cp .env .env.backup 2>/dev/null

# Create two versions of DATABASE_URL
echo "📋 Setting up dual DATABASE_URL configuration..."

# For backend running on host (development)
export DATABASE_URL_HOST="postgresql://user:password@localhost:5432/soc2db"

# For backend running in Docker (production)  
export DATABASE_URL_DOCKER="postgresql://user:password@db:5432/soc2db"

# Update .env for host development
sed -i.docker "s|DATABASE_URL=.*|DATABASE_URL=$DATABASE_URL_HOST|" .env

echo "✅ Environment configured for host development"
echo ""

# Test database connection
echo "🧪 Testing database connection..."
cd backend
npx tsx -e "
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(() => {
    console.log('✅ Database connection successful from host');
    return client.query('SELECT NOW()');
  })
  .then(result => {
    console.log('✅ Database time:', result.rows[0].now);
    return client.end();
  })
  .catch(err => console.error('❌ Database connection failed:', err.message));
"
cd ..

echo ""

# Create tables
echo "📋 Creating database tables..."
cd backend
npx tsx src/scripts/createTables.ts
cd ..

echo ""

# Final verification
echo "🔍 Final verification..."
echo ""

# Check tables were created
docker exec multicontext-db-1 psql -U user -d soc2db -c "\dt" | head -20

echo ""
echo "======================================"
echo "✅ Environment setup complete!"
echo "======================================"
echo ""
echo "Configuration:"
echo "- Backend on host uses: localhost:5432"
echo "- Backend in Docker uses: db:5432"
echo "- Database: soc2db"
echo "- User: user"
echo ""
echo "Next: Run './run-full-enumeration.sh' to test AI enumeration"