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
