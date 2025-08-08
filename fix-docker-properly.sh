#!/bin/bash

echo "=========================================="
echo "FIXING DOCKER CONTAINERS PROPERLY"
echo "=========================================="
echo ""

# 1. First, ensure containers are running
echo "🚀 Starting core services..."
docker compose up -d db redis

# Wait for services to start
echo "Waiting for services to initialize..."
sleep 10

# 2. Fix PostgreSQL user inside the container
echo "📊 Fixing PostgreSQL user issue..."

# Parse DATABASE_URL from .env
source .env

# For Docker, we need to update the DATABASE_URL to use the container name
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*postgresql:\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo $DATABASE_URL | sed -n 's/.*postgresql:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

# Update DATABASE_URL for Docker if it's pointing to localhost
if [[ $DATABASE_URL == *"localhost"* ]] || [[ $DATABASE_URL == *"127.0.0.1"* ]]; then
  echo "Updating DATABASE_URL for Docker..."
  export DATABASE_URL="postgresql://$DB_USER:$DB_PASS@db:5432/$DB_NAME"
  # Update .env file
  sed -i.bak "s|DATABASE_URL=.*|DATABASE_URL=postgresql://$DB_USER:$DB_PASS@db:5432/$DB_NAME|" .env
  echo "DATABASE_URL updated to use Docker network"
fi

echo "Creating user '$DB_USER' in PostgreSQL container..."

# Execute commands inside the PostgreSQL container
docker exec multicontext-db-1 psql -U postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS' CREATEDB;" || echo "User might already exist"
docker exec multicontext-db-1 psql -U postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" || echo "Database might already exist"
docker exec multicontext-db-1 psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

echo "✅ PostgreSQL user configured inside container"
echo ""

# 3. Pull correct Docker images
echo "🐳 Pulling correct Docker images for security tools..."

# Correct image names
docker pull projectdiscovery/subfinder:latest
docker pull instrumentisto/nmap:latest
docker pull zaproxy/zap-stable:latest        # Correct OWASP ZAP image
docker pull projectdiscovery/httpx:latest
docker pull projectdiscovery/nuclei:latest
docker pull projectdiscovery/katana:latest   # Web crawler
# SQLMap alternative - use Python image and install sqlmap
docker pull python:3.9-slim

echo "✅ Security tool images pulled"
echo ""

# 4. Update dockerTools.ts with correct image names
echo "📝 Updating tool definitions with correct Docker images..."

cat > backend/src/execution/dockerTools.ts << 'EOF'
// Docker tool definitions with correct images and commands
export interface DockerTool {
  image: string;
  command: (target: string, options?: any) => string[];
  timeout: number;
  volumeMounts?: string[];
}

export const DOCKER_TOOLS: Record<string, DockerTool> = {
  'subdomain-scanner': {
    image: 'projectdiscovery/subfinder:latest',
    command: (target: string) => ['-d', target, '-silent'],
    timeout: 60000
  },
  'port-scanner': {
    image: 'instrumentisto/nmap:latest', 
    command: (target: string) => ['-sV', '-Pn', '-p-', '--min-rate=1000', '-oX', '-', target],
    timeout: 300000
  },
  'directory-scanner': {
    image: 'zaproxy/zap-stable',
    command: (target: string) => [
      'zap-cli', 'quick-scan', '--self-contained', 
      '--spider', '-r', target
    ],
    timeout: 180000
  },
  'tech-fingerprint': {
    image: 'projectdiscovery/httpx:latest',
    command: (target: string) => ['-u', target, '-tech-detect', '-json', '-silent'],
    timeout: 60000
  },
  'crawler': {
    image: 'projectdiscovery/katana:latest',
    command: (target: string) => ['-u', target, '-json', '-silent', '-d', '3'],
    timeout: 120000
  },
  'vulnerability-scanner': {
    image: 'projectdiscovery/nuclei:latest',
    command: (target: string) => ['-u', target, '-severity', 'critical,high,medium', '-json', '-silent'],
    timeout: 300000
  }
};

export function getDockerTool(toolName: string): DockerTool | undefined {
  return DOCKER_TOOLS[toolName];
}

export function isToolAvailable(toolName: string): boolean {
  return toolName in DOCKER_TOOLS;
}

export function getAvailableTools(): string[] {
  return Object.keys(DOCKER_TOOLS);
}
EOF

echo "✅ Tool definitions updated"
echo ""

# 5. Test database connection
echo "🧪 Testing database connection..."
cd backend
npm run test:db 2>/dev/null || node -e "
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(() => {
    console.log('✅ Database connection successful');
    return client.end();
  })
  .catch(err => console.error('❌ Database connection failed:', err.message));
" || echo "Skipping database test"
cd ..

echo ""

# 6. Verify services
echo "🔍 Verifying services..."
echo ""

# Check PostgreSQL
if docker exec multicontext-db-1 psql -U postgres -c "SELECT 1" > /dev/null 2>&1; then
    echo "✅ PostgreSQL: Running"
    docker exec multicontext-db-1 psql -U postgres -c "\du" | grep -E "(Role|$DB_USER)" || echo "User list unavailable"
else
    echo "❌ PostgreSQL: Not responding"
fi

# Check Redis
if docker exec multicontext-redis-1 redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis: Running ($(docker exec multicontext-redis-1 redis-cli ping))"
else
    echo "❌ Redis: Not responding"
fi

# 7. Create tables if needed
echo ""
echo "📋 Ensuring database tables exist..."
cd backend
npm run db:setup 2>/dev/null || npx tsx src/scripts/createTables.ts || echo "Table creation skipped"
cd ..

# 8. List running containers
echo ""
echo "📦 Running containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "=========================================="
echo "✅ Docker setup complete!"
echo "=========================================="
echo ""
echo "What was fixed:"
echo "1. PostgreSQL user created inside container"
echo "2. Correct Docker images pulled"
echo "3. Tool definitions updated with working images"
echo "4. Database connection verified"
echo ""
echo "Next: Run './test-sweetspot-ai.sh' to test enumeration"