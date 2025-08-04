import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { logger } from '../utils/logger';

interface Client {
  ws: WebSocket;
  workflowId?: string;
  isAlive: boolean;
}

export class EnhancedWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, Client> = new Map();
  private workflowClients: Map<string, Set<WebSocket>> = new Map();
  private heartbeatInterval: NodeJS.Timeout;

  constructor(server: Server) {
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      // Important: These settings help prevent disconnections
      perMessageDeflate: {
        zlibDeflateOptions: {
          chunkSize: 1024,
          memLevel: 7,
          level: 3
        },
        zlibInflateOptions: {
          chunkSize: 10 * 1024
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        serverMaxWindowBits: 10,
        concurrencyLimit: 10,
        threshold: 1024
      },
      maxPayload: 10 * 1024 * 1024, // 10MB
      backlog: 100,
      verifyClient: (info, cb) => {
        // Add any custom verification logic here
        cb(true);
      }
    });

    this.setupHandlers();
    this.startHeartbeat();
  }

  private setupHandlers() {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const url = req.url || '';
      logger.info('New WebSocket connection', { url, headers: req.headers });

      // Initialize client
      const client: Client = {
        ws,
        isAlive: true
      };
      this.clients.set(ws, client);

      // Parse workflowId from URL
      const urlParams = new URLSearchParams(url.split('?')[1] || '');
      const workflowId = urlParams.get('workflowId');
      
      if (workflowId) {
        client.workflowId = workflowId;
        this.addToWorkflow(ws, workflowId);
        
        // Send immediate confirmation
        this.sendMessage(ws, {
          type: 'connected',
          workflowId,
          message: 'Successfully connected and subscribed to workflow',
          timestamp: new Date().toISOString()
        });
      } else {
        // Send generic connection message
        this.sendMessage(ws, {
          type: 'connected',
          message: 'Connected to SOC2 Testing Platform',
          timestamp: new Date().toISOString()
        });
      }

      // Set up client handlers
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          logger.error('Failed to parse message', { error });
          this.sendMessage(ws, {
            type: 'error',
            message: 'Invalid message format',
            timestamp: new Date().toISOString()
          });
        }
      });

      ws.on('pong', () => {
        const client = this.clients.get(ws);
        if (client) {
          client.isAlive = true;
        }
      });

      ws.on('close', (code, reason) => {
        logger.info('WebSocket closed', {
          code,
          reason: reason?.toString() || 'No reason',
          workflowId: client.workflowId
        });
        this.removeClient(ws);
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error', {
          error: error.message,
          workflowId: client.workflowId
        });
      });
    });

    this.wss.on('error', (error) => {
      logger.error('WebSocket server error', { error: error.message });
    });
  }

  private handleMessage(ws: WebSocket, message: any) {
    const client = this.clients.get(ws);
    if (!client) return;

    logger.debug('Received message', { type: message.type, workflowId: client.workflowId });

    switch (message.type) {
      case 'subscribe':
        if (message.workflowId && message.workflowId !== client.workflowId) {
          // Update subscription
          if (client.workflowId) {
            this.removeFromWorkflow(ws, client.workflowId);
          }
          client.workflowId = message.workflowId;
          this.addToWorkflow(ws, message.workflowId);
          
          this.sendMessage(ws, {
            type: 'subscribed',
            workflowId: message.workflowId,
            message: `Subscribed to workflow ${message.workflowId}`,
            timestamp: new Date().toISOString()
          });
        }
        break;

      case 'ping':
        this.sendMessage(ws, {
          type: 'pong',
          timestamp: new Date().toISOString()
        });
        break;

      default:
        logger.warn('Unknown message type', { type: message.type });
    }
  }

  private addToWorkflow(ws: WebSocket, workflowId: string) {
    if (!this.workflowClients.has(workflowId)) {
      this.workflowClients.set(workflowId, new Set());
    }
    this.workflowClients.get(workflowId)!.add(ws);
    logger.info('Client added to workflow', {
      workflowId,
      totalClients: this.workflowClients.get(workflowId)!.size
    });
  }

  private removeFromWorkflow(ws: WebSocket, workflowId: string) {
    const clients = this.workflowClients.get(workflowId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.workflowClients.delete(workflowId);
      }
    }
  }

  private removeClient(ws: WebSocket) {
    const client = this.clients.get(ws);
    if (client?.workflowId) {
      this.removeFromWorkflow(ws, client.workflowId);
    }
    this.clients.delete(ws);
  }

  private sendMessage(ws: WebSocket, message: any) {
    if (ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot send message - WebSocket not open', {
        readyState: ws.readyState,
        message: message.type
      });
      return;
    }

    try {
      const data = JSON.stringify(message);
      ws.send(data);
      logger.debug('Sent message', {
        type: message.type,
        size: data.length,
        workflowId: message.workflowId
      });
    } catch (error) {
      logger.error('Failed to send message', { error, type: message.type });
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client, ws) => {
        if (!client.isAlive) {
          logger.warn('Client failed heartbeat', { workflowId: client.workflowId });
          ws.terminate();
          this.removeClient(ws);
          return;
        }

        client.isAlive = false;
        ws.ping();
      });
    }, 30000); // 30 seconds
  }

  public sendWorkflowUpdate(workflowId: string, update: any) {
    const clients = this.workflowClients.get(workflowId);
    if (!clients || clients.size === 0) {
      logger.debug('No clients for workflow', { workflowId });
      return;
    }

    const message = {
      type: 'workflow-update',
      workflowId,
      ...update,
      timestamp: new Date().toISOString()
    };

    let sent = 0;
    clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendMessage(ws, message);
        sent++;
      }
    });

    logger.info('Sent workflow update', {
      workflowId,
      type: update.event,
      clientCount: clients.size,
      sentCount: sent
    });
  }

  public sendWorkflowStatus(workflowId: string, workflow: any) {
    const message = {
      type: 'workflow-status',
      workflowId,
      status: workflow.status,
      message: `Workflow is ${workflow.status}`,
      timestamp: new Date().toISOString()
    };

    // Include full results if completed
    if (workflow.status === 'completed' && workflow.results) {
      message['results'] = workflow.results;
      message['score'] = workflow.results.overallScore;
      message['findings'] = workflow.results.testResults;
    }

    const clients = this.workflowClients.get(workflowId);
    if (!clients || clients.size === 0) {
      logger.debug('No clients for workflow status', { workflowId });
      return;
    }

    clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendMessage(ws, message);
      }
    });
  }

  public shutdown() {
    clearInterval(this.heartbeatInterval);
    
    // Gracefully close all connections
    this.clients.forEach((client, ws) => {
      ws.close(1001, 'Server shutting down');
    });

    this.wss.close(() => {
      logger.info('WebSocket server shut down');
    });
  }
}