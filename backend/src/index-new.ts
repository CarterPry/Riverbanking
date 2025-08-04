import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';
import * as path from 'path';
import { createLogger } from './utils/logger';
import workflowRoutes from './api/routes/workflowRoutes';
import { default as workflowController } from './api/controllers/workflowController';
import { EnhancedWebSocketServer } from './websocket/websocket-server';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

const app = express();
const PORT = process.env.API_PORT || 3000;

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Request logging
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

// Routes
app.use('/api', workflowRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wsServer = new EnhancedWebSocketServer(server);

// Initialize services and start server
async function startServer() {
  try {
    logger.info('Initializing services...');
    
    await workflowController.initialize();
    
    // Set up workflow event handling with WebSocket
    const mcpServer = (workflowController as any).mcpServer;
    if (mcpServer) {
      // Forward workflow events to WebSocket clients
      mcpServer.on('workflow:start', (data: any) => {
        wsServer.sendWorkflowUpdate(data.workflowId, {
          event: 'start',
          ...data
        });
      });

      mcpServer.on('workflow:classified', (data: any) => {
        wsServer.sendWorkflowUpdate(data.workflowId, {
          event: 'classified',
          ...data
        });
      });

      mcpServer.on('workflow:enriched', (data: any) => {
        wsServer.sendWorkflowUpdate(data.workflowId, {
          event: 'enriched',
          ...data
        });
      });

      mcpServer.on('workflow:phase:start', (data: any) => {
        wsServer.sendWorkflowUpdate(data.workflowId, {
          event: 'phase:start',
          ...data
        });
      });

      mcpServer.on('workflow:phase:complete', (data: any) => {
        wsServer.sendWorkflowUpdate(data.workflowId, {
          event: 'phase:complete',
          ...data
        });
      });

      mcpServer.on('workflow:completed', (data: any) => {
        logger.info('Workflow completed, sending update', { workflowId: data.workflowId });
        wsServer.sendWorkflowUpdate(data.workflowId, {
          event: 'completed',
          ...data
        });
      });
    }

    // Add method to send workflow status via WebSocket
    (workflowController as any).sendWorkflowStatus = (workflowId: string) => {
      const workflow = workflowController.getWorkflow(workflowId);
      if (workflow) {
        wsServer.sendWorkflowStatus(workflowId, workflow);
      }
    };

    // Start server
    server.listen(PORT, () => {
      logger.info(`Backend server running on http://localhost:${PORT}`);
      logger.info(`WebSocket server available at ws://localhost:${PORT}/ws`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(`Mock Docker: ${process.env.MOCK_DOCKER === 'true' ? 'enabled' : 'disabled'}`);
    });

    // Set up periodic cleanup
    setInterval(() => {
      workflowController.cleanupOldWorkflows();
    }, 5 * 60 * 1000); // Every 5 minutes

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
  logger.info('Shutting down gracefully...');
  
  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Close WebSocket server
  wsServer.shutdown();

  // Cleanup workflow controller
  if (workflowController.cleanup) {
    await workflowController.cleanup();
  }

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  shutdown();
});

// Start the server
startServer();