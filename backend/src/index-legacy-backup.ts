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
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:5173' // Vite default port
    ];
    
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || origin.includes('localhost')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
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

// Check Docker availability before initializing services
// Removed automatic mock mode - let it try to use real Docker

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

// Debug endpoint to test embedding service
app.get('/debug/embedding', async (req, res) => {
  try {
    const { embeddingService } = (workflowController as any).mcpServer;
    const testText = 'Test SQL injection vulnerability';
    
    logger.info('Testing embedding service', { 
      hasApiKey: !!process.env.OPENAI_API_KEY,
      apiKeyPrefix: process.env.OPENAI_API_KEY?.substring(0, 20)
    });
    
    const embedding = await embeddingService.generateEmbedding(testText);
    
    res.json({
      success: true,
      embeddingLength: embedding.length,
      message: 'Embedding service is working correctly'
    });
  } catch (error) {
    logger.error('Embedding test failed', { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Debug AI communication endpoint
app.get('/debug/ai-communication/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const workflow = workflowController.getWorkflow(workflowId);
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    // Get the MCP server instance to access AI layers
    const { mcpServer } = workflowController as any;
    
    // Collect all AI communication data
    const aiData = {
      workflowId,
      userInput: workflow.description || 'No description provided',
      status: workflow.status,
      
      // Get stored results from workflow
      intentClassification: workflow.results?.aiCommunication?.classification || null,
      contextEnrichment: workflow.results?.aiCommunication?.enrichment || null,
      trustScore: workflow.results?.aiCommunication?.trust || null,
      
      // Get attack plan
      attackPlan: workflow.results?.attackPlan || null,
      
      // Get test results
      executedTests: workflow.results?.testResults?.length || 0,
      
      // Timestamps
      timestamps: {
        started: workflow.startTime,
        duration: workflow.duration,
        phases: workflow.results?.phases || {}
      }
    };
    
    res.json(aiData);
  } catch (error) {
    logger.error('Debug AI communication error', { error });
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
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

// Store workflow events for replay when clients connect
const workflowEvents = new Map<string, any[]>();

wss.on('connection', (ws, req) => {
  logger.info('WebSocket client connected', { 
    url: req.url,
    headers: req.headers
  });
  
  let workflowId: string | null = null;
  
  // Add ping/pong to keep connection alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === 1) {
      ws.ping();
    }
  }, 30000); // Ping every 30 seconds
  
  // Parse workflowId from URL query parameters
  if (req.url) {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const urlWorkflowId = url.searchParams.get('workflowId');
      if (urlWorkflowId) {
        workflowId = urlWorkflowId;
        
        // Auto-subscribe based on URL parameter
        if (!wsClients.has(workflowId)) {
          wsClients.set(workflowId, new Set());
        }
        wsClients.get(workflowId)!.add(ws);
        
        logger.info('WebSocket client auto-subscribed', { workflowId });
        
        // Send messages after a small delay to ensure connection is stable
        setTimeout(() => {
          if (ws.readyState === 1) { // WebSocket.OPEN
            try {
              // Send initial status message
              ws.send(JSON.stringify({ 
                type: 'status', 
                workflowId,
                data: {
                  message: 'Connected to SOC2 Testing Platform',
                  status: 'connected'
                },
                timestamp: new Date().toISOString()
              }));
              
              // Replay stored events for this workflow
              const events = workflowEvents.get(workflowId);
              if (events && events.length > 0) {
                logger.info('Replaying workflow events', { workflowId, eventCount: events.length });
                
                // Send events with small delays to ensure proper ordering
                events.forEach((event, index) => {
                  setTimeout(() => {
                    if (ws.readyState === 1) {
                      ws.send(JSON.stringify(event));
                    }
                  }, index * 10); // 10ms between each event
                });
              }
            } catch (err) {
              logger.error('Error sending initial messages', { error: err });
            }
          }
        }, 100); // 100ms delay
      } else {
        // No workflowId in URL, just send status message
        setTimeout(() => {
          if (ws.readyState === 1) { // WebSocket.OPEN
            try {
              ws.send(JSON.stringify({ 
                type: 'status', 
                data: {
                  message: 'Connected to SOC2 Testing Platform',
                  status: 'connected'
                },
                timestamp: new Date().toISOString()
              }));
            } catch (err) {
              logger.error('Error sending connection message', { error: err });
            }
          }
        }, 100);
      }
    } catch (error) {
      logger.error('Error parsing WebSocket URL', { error, url: req.url });
    }
  }
  
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
          type: 'status', 
          workflowId,
          data: {
            message: `Subscribed to workflow ${workflowId}`,
            status: 'subscribed'
          },
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      logger.error('WebSocket message error', { error });
    }
  });
  
  ws.on('close', () => {
    logger.info('WebSocket client disconnected');
    
    // Clear ping interval
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
});

// Store and broadcast workflow messages
function storeAndBroadcast(workflowId: string, message: any) {
  // Store event for replay
  if (!workflowEvents.has(workflowId)) {
    workflowEvents.set(workflowId, []);
  }
  workflowEvents.get(workflowId)!.push(message);
  
  // Broadcast to connected clients
  const clients = wsClients.get(workflowId);
  if (clients) {
    const messageStr = JSON.stringify(message);
    clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(messageStr);
      }
    });
  }
}

// Broadcast workflow updates to subscribed clients
function broadcastWorkflowUpdate(workflowId: string, update: any) {
  const event = {
    type: 'workflow-update',
    workflowId,
    update,
    timestamp: new Date().toISOString()
  };
  storeAndBroadcast(workflowId, event);
}

// Initialize services and start server
async function startServer() {
  try {
    logger.info('Initializing services...');
    
    // Debug environment variables
    logger.info('Environment check', {
      DOCKER_HOST: process.env.DOCKER_HOST,
      MOCK_DOCKER: process.env.MOCK_DOCKER,
      NODE_ENV: process.env.NODE_ENV
    });
    
    // Initialize the workflow controller
    await workflowController.initialize();
    
    // Set up workflow event broadcasting
    const mcpServer = (workflowController as any).mcpServer;
    if (mcpServer) {
      // Workflow lifecycle events
      mcpServer.on('workflow:start', (data: any) => {
        broadcastWorkflowUpdate(data.workflowId, { event: 'start', ...data });
        // Send progress update
        storeAndBroadcast(data.workflowId, {
          type: 'progress',
          workflowId: data.workflowId,
          data: {
            progress: 'Starting security tests...',
            phase: 'initializing',
            status: 'running'
          },
          timestamp: new Date().toISOString()
        });
      });
      
      mcpServer.on('workflow:classified', (data: any) => {
        broadcastWorkflowUpdate(data.workflowId, { event: 'classified', ...data });
        // Send progress update
        const clients = wsClients.get(data.workflowId);
        if (clients) {
          const progressMsg = JSON.stringify({
            type: 'progress',
            workflowId: data.workflowId,
            data: {
              progress: 'Intent classified, preparing tests...',
              phase: 'classification',
              status: 'running'
            },
            timestamp: new Date().toISOString()
          });
          clients.forEach(client => {
            if (client.readyState === 1) client.send(progressMsg);
          });
        }
      });
      
      mcpServer.on('workflow:enriched', (data: any) => {
        broadcastWorkflowUpdate(data.workflowId, { event: 'enriched', ...data });
        // Send progress update with attack count
        const clients = wsClients.get(data.workflowId);
        if (clients) {
          const attackCount = (data.viableAttacks?.critical?.length || 0) + 
                             (data.viableAttacks?.standard?.length || 0) + 
                             (data.viableAttacks?.lowPriority?.length || 0);
          const progressMsg = JSON.stringify({
            type: 'progress',
            workflowId: data.workflowId,
            data: {
              progress: `Context enriched, ${attackCount} tests identified...`,
              phase: 'enrichment',
              status: 'running',
              attacks: attackCount
            },
            timestamp: new Date().toISOString()
          });
          clients.forEach(client => {
            if (client.readyState === 1) client.send(progressMsg);
          });
        }
      });
      
      mcpServer.on('workflow:planned', (data: any) => {
        broadcastWorkflowUpdate(data.workflowId, { event: 'planned', ...data });
        // Send progress update
        const clients = wsClients.get(data.workflowId);
        if (clients) {
          const progressMsg = JSON.stringify({
            type: 'progress',
            workflowId: data.workflowId,
            data: {
              progress: 'Execution plan created, starting tests...',
              phase: 'planning',
              status: 'running'
            },
            timestamp: new Date().toISOString()
          });
          clients.forEach(client => {
            if (client.readyState === 1) client.send(progressMsg);
          });
        }
      });
      
      mcpServer.on('workflow:phase:start', (data: any) => {
        broadcastWorkflowUpdate(data.workflowId, { event: 'phase:start', ...data });
        // Send progress update
        const clients = wsClients.get(data.workflowId);
        if (clients) {
          const progressMsg = JSON.stringify({
            type: 'progress',
            workflowId: data.workflowId,
            data: {
              progress: `Executing ${data.phase} phase...`,
              phase: data.phase,
              status: 'running'
            },
            timestamp: new Date().toISOString()
          });
          clients.forEach(client => {
            if (client.readyState === 1) client.send(progressMsg);
          });
        }
      });
      
      mcpServer.on('workflow:phase:complete', (data: any) => {
        broadcastWorkflowUpdate(data.workflowId, { event: 'phase:complete', ...data });
        // Send progress update
        const clients = wsClients.get(data.workflowId);
        if (clients) {
          const progressMsg = JSON.stringify({
            type: 'progress',
            workflowId: data.workflowId,
            data: {
              progress: `Completed ${data.phase} phase, found ${data.findings || 0} issues...`,
              phase: data.phase,
              status: 'running',
              findings: data.findings || []
            },
            timestamp: new Date().toISOString()
          });
          clients.forEach(client => {
            if (client.readyState === 1) client.send(progressMsg);
          });
        }
      });
      
      mcpServer.on('workflow:completed', (data: any) => {
        broadcastWorkflowUpdate(data.workflowId, { event: 'completed', ...data });
        // Send final result
        const clients = wsClients.get(data.workflowId);
        if (clients) {
          const resultMsg = JSON.stringify({
            type: 'result',
            workflowId: data.workflowId,
            data: {
              progress: 'Testing complete!',
              status: 'complete',
              score: data.results?.overallScore || 0,
              findings: data.results?.testResults || [],
              cc: data.results?.soc2Coverage || []
            },
            timestamp: new Date().toISOString()
          });
          clients.forEach(client => {
            if (client.readyState === 1) client.send(resultMsg);
          });
          
          // Also send workflow-status for compatibility
          const statusMsg = JSON.stringify({
            type: 'workflow-status',
            workflowId: data.workflowId,
            status: 'completed',
            result: data.results,
            timestamp: new Date().toISOString()
          });
          clients.forEach(client => {
            if (client.readyState === 1) client.send(statusMsg);
          });
        }
      });
      
      // Detailed attack execution events
      mcpServer.on('workflow:attack:start', (data: any) => {
        storeAndBroadcast(data.workflowId, {
          type: 'log',
          workflowId: data.workflowId,
          level: 'info',
          category: 'attack',
          data: {
            message: `Starting ${data.tool} attack`,
            attackId: data.attackId,
            tool: data.tool,
            params: data.params
          },
          timestamp: data.timestamp
        });
      });
      
      mcpServer.on('workflow:attack:complete', (data: any) => {
        storeAndBroadcast(data.workflowId, {
          type: 'log',
          workflowId: data.workflowId,
          level: data.findings.length > 0 ? 'warning' : 'success',
          category: 'attack',
          data: {
            message: `Completed ${data.tool} attack - ${data.findings.length} findings`,
            attackId: data.attackId,
            tool: data.tool,
            status: data.status,
            findings: data.findings,
            duration: data.duration,
            rawOutput: data.rawOutput
          },
          timestamp: data.timestamp
        });
      });
    }
    
    // Listen for command execution events from tool handler
    process.on('workflow:command:execute' as any, (data: any) => {
      storeAndBroadcast(data.workflowId, {
        type: 'log',
        workflowId: data.workflowId,
        level: 'debug',
        category: 'command',
        data: {
          message: `Executing: ${data.command}`,
          attackId: data.attackId,
          tool: data.tool,
          command: data.command,
          container: data.container
        },
        timestamp: data.timestamp
      });
    });
    
    // Listen for tool progress events
    process.on('workflow:tool:progress' as any, (data: any) => {
      storeAndBroadcast(data.workflowId, {
        type: 'progress',
        workflowId: data.workflowId,
        data: {
          progress: `${data.tool}: ${data.message} (${data.progress}%)`,
          phase: 'testing',
          status: 'running',
          tool: data.tool,
          attackId: data.attackId,
          percent: data.progress
        },
        timestamp: data.timestamp
      });
    });
    
    // Listen for general workflow progress events
    process.on('workflow:progress' as any, (data: any) => {
      // Find active workflow ID from current workflows
      const activeWorkflowId = Array.from(wsClients.keys()).find(id => 
        workflowController.activeWorkflows?.has(id)
      );
      
      if (activeWorkflowId) {
        storeAndBroadcast(activeWorkflowId, {
          type: 'progress',
          workflowId: activeWorkflowId,
          data: {
            progress: data.message,
            phase: data.phase || 'processing',
            status: 'running',
            percent: data.percent || 0
          },
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Listen for classification progress events
    process.on('workflow:classification:progress' as any, (data: any) => {
      storeAndBroadcast(data.workflowId, {
        type: 'progress',
        workflowId: data.workflowId,
        data: {
          progress: data.message,
          phase: data.phase,
          status: 'running',
          percent: data.percent
        },
        timestamp: new Date().toISOString()
      });
      
      // Also send as log for visibility
      storeAndBroadcast(data.workflowId, {
        type: 'log',
        workflowId: data.workflowId,
        level: 'info',
        category: 'ai',
        data: {
          message: data.message,
          phase: data.phase,
          percent: data.percent
        },
        timestamp: new Date().toISOString()
      });
    });
    
    // Listen for enrichment progress events
    process.on('workflow:enrichment:progress' as any, (data: any) => {
      storeAndBroadcast(data.workflowId, {
        type: 'progress',
        workflowId: data.workflowId,
        data: {
          progress: data.message,
          phase: data.phase,
          status: 'running',
          percent: data.percent
        },
        timestamp: new Date().toISOString()
      });
      
      // Also send as log for visibility
      storeAndBroadcast(data.workflowId, {
        type: 'log',
        workflowId: data.workflowId,
        level: 'info',
        category: 'ai',
        data: {
          message: data.message,
          phase: data.phase,
          percent: data.percent
        },
        timestamp: new Date().toISOString()
      });
    });
    
    // Listen for workflow errors
    mcpServer.on('workflow:error', (data: any) => {
      storeAndBroadcast(data.workflowId, {
        type: 'error',
        workflowId: data.workflowId,
        data: {
          message: data.error,
          phase: data.phase
        },
        timestamp: new Date().toISOString()
      });
    });
    
    // Listen for attack start events
    mcpServer.on('workflow:attack:start', (data: any) => {
      storeAndBroadcast(data.workflowId, {
        type: 'attack:start',
        workflowId: data.workflowId,
        data: {
          attackId: data.attackId,
          tool: data.tool,
          params: data.params
        },
        timestamp: new Date().toISOString()
      });
    });
    
    // Listen for attack completion events
    mcpServer.on('workflow:attack:complete', (data: any) => {
      storeAndBroadcast(data.workflowId, {
        type: 'attack:complete',
        workflowId: data.workflowId,
        data: {
          attackId: data.attackId,
          tool: data.tool,
          findings: data.findings
        },
        timestamp: new Date().toISOString()
      });
    });
    
    // Listen for tool progress events
    process.on('workflow:tool:progress' as any, (data: any) => {
      if (data.workflowId) {
        storeAndBroadcast(data.workflowId, {
          type: 'tool:progress',
          workflowId: data.workflowId,
          data: {
            containerId: data.containerId,
            attackId: data.attackId,
            progress: data.progress,
            message: data.message
          },
          timestamp: new Date().toISOString()
        });
      }
    });
    
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