#!/bin/bash

# Apply WebSocket Fix
set -e

echo "🚀 Applying WebSocket Fix..."

# Step 1: Check if database is running
if ! docker ps | grep -q "multicontext-db-1"; then
    echo "❌ Database is not running. Please ensure docker-compose is up."
    exit 1
fi

# Step 2: Create database tables using correct credentials
echo "📊 Setting up database..."
docker exec -i multicontext-db-1 psql -U user -d soc2db << 'EOF'
-- Create workflows table
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
GRANT ALL PRIVILEGES ON TABLE workflows TO "user";

-- Verify table creation
\dt workflows
EOF

# Step 3: Update environment variables
echo "🔧 Updating environment variables..."
if ! grep -q "DATABASE_URL" .env; then
    echo "" >> .env
    echo "# Database Configuration" >> .env
    echo "DATABASE_URL=postgresql://user:password@localhost:5432/soc2db" >> .env
fi

# Step 4: Update TypeScript imports
echo "📝 Fixing imports..."
# Fix the import issues in the new files
sed -i '' 's/\.js"/"/g' backend/src/index-new.ts 2>/dev/null || true
sed -i '' "s/import { logger }/import { createLogger }/g" backend/src/index-new.ts 2>/dev/null || true
sed -i '' "s/const logger = createLogger/const logger = createLogger/g" backend/src/index-new.ts 2>/dev/null || true

# Fix workflow controller imports
sed -i '' "s/import workflowController/import { default as workflowController }/g" backend/src/index-new.ts 2>/dev/null || true

# Step 5: Create a minimal working version
echo "🔨 Creating minimal working version..."
cat > backend/src/index-fixed.ts << 'EOF'
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import path from 'path';
import { EnhancedWebSocketServer } from './websocket/websocket-server.js';
import workflowRoutes from './api/routes/workflowRoutes.js';
import workflowController from './api/controllers/workflowController.js';
import { createLogger } from './utils/logger.js';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '../.env') });

const logger = createLogger('Server');
const app = express();
const PORT = process.env.API_PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api', workflowRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wsServer = new EnhancedWebSocketServer(server);

// Initialize and start
async function startServer() {
  try {
    await workflowController.initialize();
    
    // Connect workflow events to WebSocket
    const mcpServer = (workflowController as any).mcpServer;
    if (mcpServer && wsServer) {
      mcpServer.on('workflow:completed', (data: any) => {
        logger.info('Workflow completed, updating WebSocket clients');
        const workflow = workflowController.getWorkflow(data.workflowId);
        if (workflow) {
          wsServer.sendWorkflowStatus(data.workflowId, workflow);
        }
      });
    }
    
    server.listen(PORT, () => {
      logger.info(`Backend running on http://localhost:${PORT}`);
      logger.info(`WebSocket available at ws://localhost:${PORT}/ws`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
  logger.info('Shutting down...');
  server.close();
  wsServer.shutdown();
  process.exit(0);
}

startServer();
EOF

# Step 6: Create start script
echo "🎯 Creating start script..."
cat > start-backend.sh << 'EOF'
#!/bin/bash
echo "🚀 Starting enhanced backend..."
cd backend

# Kill existing processes
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Copy fixed version
cp src/index-fixed.ts src/index.ts

# Start backend
npm run dev
EOF

chmod +x start-backend.sh

echo "✅ WebSocket fix applied!"
echo ""
echo "To start the fixed backend:"
echo "./start-backend.sh"