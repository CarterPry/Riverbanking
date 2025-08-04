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
dotenv.config({ path: path.join(rootDir, '../.env') });

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
const wss = new WebSocketServer({ 
  server, 
  path: '/ws',
  perMessageDeflate: true,
  clientTracking: true
});

// Track WebSocket clients by workflow
const wsClients = new Map<string, Set<any>>();

// Add error handling for WebSocket server
wss.on('error', (error) => {
  logger.error('WebSocket server error', { error });
});

// WebSocket server handles upgrades automatically when attached to HTTP server

wss.on('connection', (ws, req) => {
  logger.info('WebSocket client connected', { 
    url: req.url,
    headers: req.headers 
  });
  
  // Declare pingInterval at the top to avoid reference errors
  let pingInterval: NodeJS.Timeout;
  
  // Extract workflowId from URL if provided
  const urlParams = new URLSearchParams(req.url?.split('?')[1] || '');
  let workflowId: string | null = urlParams.get('workflowId');
  
  // Auto-subscribe if workflowId is in URL
  if (workflowId) {
    const wfId = workflowId as string;
    if (!wsClients.has(wfId)) {
      wsClients.set(wfId, new Set());
    }
    wsClients.get(wfId)!.add(ws);
    
    logger.info('Auto-subscribed to workflow', { workflowId });
    
    // Send initial connection message
    try {
      ws.send(JSON.stringify({ 
        type: 'connected', 
        message: 'Connected to SOC2 Testing Platform',
        workflowId,
        timestamp: new Date().toISOString()
      }));
      logger.info('Sent connected message', { workflowId });
    } catch (error) {
      logger.error('Failed to send connected message', { error, workflowId });
    }
    
    // Check if workflow exists
    const workflow = workflowController.getWorkflow(workflowId);
    if (workflow) {
      logger.info('Workflow found', { workflowId, status: workflow.status });
      
      // Send status update
      try {
        const statusMessage = {
          type: 'workflow-status',
          workflowId,
          status: workflow.status,
          message: `Workflow is ${workflow.status}`,
          timestamp: new Date().toISOString(),
          // Include results if workflow is completed
          ...(workflow.status === 'completed' && workflow.results ? { result: workflow.results } : {})
        };
        
        const messageStr = JSON.stringify(statusMessage);
        logger.info('Sending workflow status message', { 
          workflowId, 
          messageSize: messageStr.length,
          status: workflow.status 
        });
        
        ws.send(messageStr);
        logger.info('Sent workflow status', { workflowId, status: workflow.status });
        
        // If the workflow is completed, do NOT close the connection
        // Let the client decide when to close
        if (workflow.status === 'completed') {
          logger.info('Workflow is completed, keeping connection open', { workflowId });
        }
      } catch (error) {
        logger.error('Failed to send workflow status', { error, workflowId });
      }
    } else {
      logger.warn('Workflow not found', { workflowId });
      
      // Send workflow not found status instead of disconnecting
      try {
        const notFoundMessage = {
          type: 'workflow-status',
          workflowId,
          status: 'not-found',
          message: 'Workflow not found. It may have expired or been cleared.',
          timestamp: new Date().toISOString()
        };
        
        ws.send(JSON.stringify(notFoundMessage));
        logger.info('Sent workflow not found status', { workflowId });
      } catch (error) {
        logger.error('Failed to send not found status', { error, workflowId });
      }
    }
  }
  
  // Set up event handlers for ALL connections (not just those with workflowId)
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
        
        // Check if workflow is already completed and send its status
        const workflow = workflowController.getWorkflow(workflowId);
        if (workflow && workflow.status === 'completed') {
          ws.send(JSON.stringify({
            type: 'workflow-update',
            workflowId,
            update: {
              event: 'workflow:completed',
              status: 'completed',
              result: workflow.results
            },
            timestamp: new Date().toISOString()
          }));
        }
      }
    } catch (error) {
      logger.error('WebSocket message error', { error });
    }
  });
  
  ws.on('close', () => {
    logger.info('WebSocket client disconnected');
    clearInterval(pingInterval);
    
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
  
  // Send ping messages to keep connection alive
  pingInterval = setInterval(() => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      try {
        ws.ping();
      } catch (error) {
        logger.error('Failed to send ping', { error });
      }
    }
  }, 30000); // Ping every 30 seconds
  
  ws.on('pong', () => {
    logger.debug('Received pong from client');
  });
  
  // Send initial connection message if no workflowId in URL
  if (!workflowId) {
    ws.send(JSON.stringify({ 
      type: 'connected', 
      message: 'Connected to SOC2 Testing Platform',
      timestamp: new Date().toISOString()
    }));
  }
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
mcpServer.on('workflow:completed', (data: any) => {
  logger.info('Workflow completed, broadcasting update', { workflowId: data.workflowId });
  broadcastWorkflowUpdate(data.workflowId, { event: 'completed', ...data });
});
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