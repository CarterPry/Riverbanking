import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { WorkflowController } from './api/controllers/workflowController.js';
import { createWorkflowRoutes, createPublicRoutes, createAdminRoutes } from './api/routes/workflowRoutes.js';
import { createLogger } from './utils/logger.js';
import path from 'path';

// Use a different variable name to avoid conflicts in CommonJS
const rootDir = path.resolve();

// Load environment variables
dotenv.config({ path: path.join(rootDir, '../../.env') });

// Create logger
const logger = createLogger('Server');

// Create Express app
const app = express();
const PORT = process.env.API_PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  });
  
  next();
});

// Initialize workflow controller
const workflowController = new WorkflowController();

// Setup routes
app.use('/api', createPublicRoutes());
app.use('/api', createWorkflowRoutes(workflowController));
app.use('/api/admin', createAdminRoutes(workflowController));

// Health check endpoint at root
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'soc2-testing-platform-backend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { 
    error: err.message, 
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  res.status(err.status || 500).json({ 
    error: err.name || 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
  });
});

// Create HTTP server
const server = createServer(app);

// Create WebSocket server for real-time updates
const wss = new WebSocketServer({ server, path: '/ws' });

// Track WebSocket clients by workflow
const wsClients = new Map<string, Set<any>>();

wss.on('connection', (ws, req) => {
  logger.info('WebSocket client connected', { 
    url: req.url,
    headers: req.headers
  });
  
  let workflowId: string | null = null;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'subscribe' && data.workflowId) {
        workflowId = data.workflowId;
        const wfId = workflowId as string;
        
        if (!wsClients.has(wfId)) {
          wsClients.set(wfId, new Set());
        }
        wsClients.get(wfId)!.add(ws);
        
        ws.send(JSON.stringify({ 
          type: 'subscribed', 
          workflowId,
          message: `Subscribed to workflow ${workflowId}` 
        }));
      }
    } catch (error) {
      logger.error('WebSocket message error', { error });
    }
  });
  
  ws.on('close', () => {
    logger.info('WebSocket client disconnected');
    
    // Remove from all workflow subscriptions
    if (workflowId) {
      const clients = wsClients.get(workflowId);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) {
          wsClients.delete(workflowId);
        }
      }
    }
  });
  
  ws.on('error', (error) => {
    logger.error('WebSocket error', { error });
  });
  
  // Send initial connection message
  ws.send(JSON.stringify({ 
    type: 'connected', 
    message: 'Connected to SOC2 Testing Platform',
    timestamp: new Date().toISOString()
  }));
});

// Broadcast workflow updates to subscribed clients
function broadcastWorkflowUpdate(workflowId: string, update: any) {
  const clients = wsClients.get(workflowId);
  if (clients) {
    const message = JSON.stringify({
      type: 'workflow-update',
      workflowId,
      update,
      timestamp: new Date().toISOString()
    });
    
    clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    });
  }
}

// Initialize services and start server
async function startServer() {
  try {
    logger.info('Initializing services...');
    
    // Set MOCK_DOCKER=true for development without Docker
    if (!process.env.DOCKER_HOST && process.env.NODE_ENV !== 'production') {
      process.env.MOCK_DOCKER = 'true';
      logger.warn('Docker not available, using mock mode');
    }
    
    // Initialize the workflow controller
    await workflowController.initialize();
    
    // Set up workflow event broadcasting
    const mcpServer = (workflowController as any).mcpServer;
    if (mcpServer) {
      mcpServer.on('workflow:start', (data: any) => broadcastWorkflowUpdate(data.workflowId, { event: 'start', ...data }));
      mcpServer.on('workflow:classified', (data: any) => broadcastWorkflowUpdate(data.workflowId, { event: 'classified', ...data }));
      mcpServer.on('workflow:enriched', (data: any) => broadcastWorkflowUpdate(data.workflowId, { event: 'enriched', ...data }));
      mcpServer.on('workflow:phase:start', (data: any) => broadcastWorkflowUpdate(data.workflowId, { event: 'phase:start', ...data }));
      mcpServer.on('workflow:phase:complete', (data: any) => broadcastWorkflowUpdate(data.workflowId, { event: 'phase:complete', ...data }));
    }
    
    // Set up periodic cleanup
    setInterval(() => {
      workflowController.cleanupOldWorkflows();
    }, 60 * 60 * 1000); // Every hour
    
    // Start server
    server.listen(PORT, () => {
      logger.info(`Backend server running on http://localhost:${PORT}`);
      logger.info(`WebSocket server available at ws://localhost:${PORT}/ws`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Mock Docker: ${process.env.MOCK_DOCKER === 'true' ? 'enabled' : 'disabled'}`);
    });
    
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  wss.close(() => {
    logger.info('WebSocket server closed');
  });
  
  await workflowController.cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  wss.close(() => {
    logger.info('WebSocket server closed');
  });
  
  await workflowController.cleanup();
  process.exit(0);
});

// Start the server
startServer(); 