#!/bin/bash

# Continue WebSocket Fix Implementation
set -e

echo "🔄 Continuing WebSocket Fix Implementation..."

# Step 4: Create database tables
echo "📊 Creating database tables..."
sleep 2  # Give database time
docker exec -i multicontext-db-1 psql -U postgres -d postgres << 'EOF'
-- Create database if not exists
SELECT 'CREATE DATABASE soc2_testing' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'soc2_testing')\gexec
EOF

docker exec -i multicontext-db-1 psql -U postgres -d soc2_testing << 'EOF'
-- Create workflows table if not exists
CREATE TABLE IF NOT EXISTS workflows (
  workflow_id VARCHAR(255) PRIMARY KEY,
  status VARCHAR(50) NOT NULL,
  target TEXT NOT NULL,
  scope VARCHAR(100) NOT NULL,
  description TEXT,
  template VARCHAR(100) NOT NULL,
  start_time BIGINT NOT NULL,
  end_time BIGINT,
  duration INTEGER,
  results JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at);

-- Grant permissions
GRANT ALL PRIVILEGES ON TABLE workflows TO postgres;
EOF

# Step 5: Update environment variables
echo "🔧 Updating environment variables..."
if ! grep -q "DATABASE_URL" .env; then
    echo "" >> .env
    echo "# Database Configuration" >> .env
    echo "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/soc2_testing" >> .env
fi

# Step 6: Apply the new implementation files
echo "📝 Applying new implementation..."
# Copy the new index file
cp backend/src/index-new.ts backend/src/index.ts

# Create imports file to fix module resolution
cat > backend/src/utils/logger.js << 'EOF'
// Re-export from the TypeScript logger
export * from './logger.ts';
EOF

# Step 7: Create startup script
echo "🎯 Creating startup script..."
cat > start-fixed-backend.sh << 'EOF'
#!/bin/bash
echo "Starting enhanced backend with WebSocket fixes..."
cd backend

# Kill any existing backend processes
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Start with the new implementation
export NODE_ENV=development
export LOG_LEVEL=info
npm run dev
EOF

chmod +x start-fixed-backend.sh

echo "✅ WebSocket fix implementation complete!"
echo ""
echo "To start the fixed backend:"
echo "./start-fixed-backend.sh"
echo ""
echo "The WebSocket connection should now remain stable! 🎉"