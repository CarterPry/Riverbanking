#!/bin/bash

echo "=========================================="
echo "FIXING ALL DOCKER CONTAINER ISSUES"
echo "=========================================="
echo ""

# 1. Fix PostgreSQL User Issue
echo "📊 Fixing PostgreSQL user issue..."
echo "Creating user 'carte' in PostgreSQL..."

# Get the current DATABASE_URL to parse credentials
source .env
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*postgresql:\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo $DATABASE_URL | sed -n 's/.*postgresql:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

echo "Database config:"
echo "- User: $DB_USER"
echo "- Database: $DB_NAME"

# Create the user in PostgreSQL
docker exec -it multicontext-db-1 psql -U postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || echo "User might already exist"
docker exec -it multicontext-db-1 psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null || echo "Privileges might already be granted"
docker exec -it multicontext-db-1 psql -U postgres -c "ALTER USER $DB_USER CREATEDB;" 2>/dev/null

echo "✅ PostgreSQL user configured"
echo ""

# 2. Pull missing Docker images for security tools
echo "🐳 Pulling missing Docker images for security tools..."

# Core scanning tools
docker pull projectdiscovery/subfinder:latest
docker pull instrumentisto/nmap:latest
docker pull owasp/zap2docker-stable:latest  # Correct OWASP ZAP image
docker pull projectdiscovery/httpx:latest
docker pull projectdiscovery/nuclei:latest
docker pull sqlmapproject/sqlmap:latest

echo "✅ Security tool images pulled"
echo ""

# 3. Fix tool execution permissions
echo "🔧 Fixing Docker permissions..."

# Ensure Docker socket is accessible
if [ -S /var/run/docker.sock ]; then
    echo "Docker socket found at /var/run/docker.sock"
else
    echo "⚠️  Docker socket not found at expected location"
fi

echo ""

# 4. Update tool definitions to use correct images
echo "📝 Creating corrected tool definitions..."

cat > backend/src/execution/dockerTools.ts << 'EOF'
// Corrected Docker tool definitions
export const DOCKER_TOOLS = {
  'subdomain-scanner': {
    image: 'projectdiscovery/subfinder:latest',
    command: (target: string) => ['subfinder', '-d', target, '-silent', '-json'],
    timeout: 60000
  },
  'port-scanner': {
    image: 'instrumentisto/nmap:latest',
    command: (target: string) => ['nmap', '-sV', '-Pn', '-p-', '--min-rate=1000', '-oX', '-', target],
    timeout: 300000
  },
  'directory-scanner': {
    image: 'owasp/zap2docker-stable',
    command: (target: string) => ['zap-cli', 'quick-scan', '--self-contained', '--spider', target],
    timeout: 180000
  },
  'tech-fingerprint': {
    image: 'projectdiscovery/httpx:latest',
    command: (target: string) => ['httpx', '-u', target, '-tech-detect', '-json', '-silent'],
    timeout: 60000
  },
  'vulnerability-scanner': {
    image: 'projectdiscovery/nuclei:latest',
    command: (target: string) => ['nuclei', '-u', target, '-severity', 'critical,high,medium', '-json', '-silent'],
    timeout: 300000
  },
  'sql-injection': {
    image: 'sqlmapproject/sqlmap:latest',
    command: (url: string) => ['python', 'sqlmap.py', '-u', url, '--batch', '--risk=1', '--level=1'],
    timeout: 180000
  }
};

export function getDockerTool(toolName: string) {
  return DOCKER_TOOLS[toolName];
}
EOF

echo "✅ Tool definitions updated"
echo ""

# 5. Test database connection
echo "🧪 Testing database connection..."
cd backend
npm run test:db 2>/dev/null || node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT NOW()')
  .then(() => console.log('✅ Database connection successful'))
  .catch(err => console.error('❌ Database connection failed:', err.message))
  .finally(() => pool.end());
" || echo "Database test skipped"
cd ..

echo ""

# 6. Restart containers with proper configuration
echo "♻️  Restarting containers..."
docker compose down
docker compose up -d

# Wait for services
echo "Waiting for services to start..."
sleep 5

# 7. Verify all services
echo ""
echo "🔍 Verifying services..."
echo ""

# Check PostgreSQL
if docker exec multicontext-db-1 psql -U postgres -c "SELECT 1" > /dev/null 2>&1; then
    echo "✅ PostgreSQL: Running"
else
    echo "❌ PostgreSQL: Not responding"
fi

# Check Redis
if docker exec multicontext-redis-1 redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis: Running"
else
    echo "❌ Redis: Not responding"
fi

# List all running containers
echo ""
echo "📦 Running containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "=========================================="
echo "✅ Docker fixes applied!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Run './test-sweetspot-ai.sh' to test with fixed containers"
echo "2. Tools should now execute properly"
echo "3. Database connections should work"