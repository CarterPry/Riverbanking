import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

interface WebSocketClient {
  id: string;
  ws: WebSocket;
  workflowId?: string;
  isAlive: boolean;
  subscribedWorkflows: Set<string>;
}

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocketClient> = new Map();
  private workflowSubscriptions: Map<string, Set<string>> = new Map(); // workflowId -> Set<clientId>
  private pingInterval: NodeJS.Timeout;

  constructor(server: Server) {
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      perMessageDeflate: true,
      clientTracking: false // We'll track clients ourselves
    });

    this.setupEventHandlers();
    this.startHeartbeat();
  }

  private setupEventHandlers() {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = uuidv4();
      const client: WebSocketClient = {
        id: clientId,
        ws,
        isAlive: true,
        subscribedWorkflows: new Set()
      };

      this.clients.set(clientId, client);

      logger.info('WebSocket client connected', {
        clientId,
        url: req.url,
        totalClients: this.clients.size
      });

      // Parse workflowId from URL if present
      const urlParams = new URLSearchParams(req.url?.split('?')[1] || '');
      const workflowId = urlParams.get('workflowId');

      if (workflowId) {
        this.subscribeToWorkflow(clientId, workflowId);
      }

      // Set up client event handlers
      this.setupClientHandlers(clientId, ws);

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'connected',
        clientId,
        message: 'Connected to SOC2 Testing Platform',
        timestamp: new Date().toISOString()
      });
    });

    this.wss.on('error', (error) => {
      logger.error('WebSocket server error', { error: error.message });
    });
  }

  private setupClientHandlers(clientId: string, ws: WebSocket) {
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleClientMessage(clientId, message);
      } catch (error) {
        logger.error('Failed to parse WebSocket message', { clientId, error });
      }
    });

    ws.on('pong', () => {
      const client = this.clients.get(clientId);
      if (client) {
        client.isAlive = true;
      }
    });

    ws.on('close', (code, reason) => {
      logger.info('WebSocket client disconnected', {
        clientId,
        code,
        reason: reason?.toString() || 'No reason provided',
        subscribedWorkflows: Array.from(this.clients.get(clientId)?.subscribedWorkflows || [])
      });

      this.removeClient(clientId);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket client error', {
        clientId,
        error: error.message
      });
    });
  }

  private handleClientMessage(clientId: string, message: any) {
    logger.debug('Received message from client', { clientId, type: message.type });

    switch (message.type) {
      case 'subscribe':
        if (message.workflowId) {
          this.subscribeToWorkflow(clientId, message.workflowId);
        }
        break;

      case 'unsubscribe':
        if (message.workflowId) {
          this.unsubscribeFromWorkflow(clientId, message.workflowId);
        }
        break;

      case 'ping':
        this.sendToClient(clientId, { type: 'pong', timestamp: new Date().toISOString() });
        break;

      default:
        logger.warn('Unknown message type', { clientId, type: message.type });
    }
  }

  private subscribeToWorkflow(clientId: string, workflowId: string) {
    const client = this.clients.get(clientId);
    if (!client) {
      logger.warn('Client not found for subscription', { clientId, workflowId });
      return;
    }

    // Add to client's subscriptions
    client.subscribedWorkflows.add(workflowId);

    // Add to workflow's subscribers
    if (!this.workflowSubscriptions.has(workflowId)) {
      this.workflowSubscriptions.set(workflowId, new Set());
    }
    this.workflowSubscriptions.get(workflowId)!.add(clientId);

    logger.info('Client subscribed to workflow', {
      clientId,
      workflowId,
      totalSubscribers: this.workflowSubscriptions.get(workflowId)!.size
    });

    // Send subscription confirmation
    this.sendToClient(clientId, {
      type: 'subscribed',
      workflowId,
      message: `Subscribed to workflow ${workflowId}`,
      timestamp: new Date().toISOString()
    });
  }

  private unsubscribeFromWorkflow(clientId: string, workflowId: string) {
    const client = this.clients.get(clientId);
    if (client) {
      client.subscribedWorkflows.delete(workflowId);
    }

    const subscribers = this.workflowSubscriptions.get(workflowId);
    if (subscribers) {
      subscribers.delete(clientId);
      if (subscribers.size === 0) {
        this.workflowSubscriptions.delete(workflowId);
      }
    }

    logger.info('Client unsubscribed from workflow', { clientId, workflowId });
  }

  private removeClient(clientId: string) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from all workflow subscriptions
    client.subscribedWorkflows.forEach(workflowId => {
      const subscribers = this.workflowSubscriptions.get(workflowId);
      if (subscribers) {
        subscribers.delete(clientId);
        if (subscribers.size === 0) {
          this.workflowSubscriptions.delete(workflowId);
        }
      }
    });

    // Remove client
    this.clients.delete(clientId);
    logger.info('Client removed', { clientId, remainingClients: this.clients.size });
  }

  private startHeartbeat() {
    this.pingInterval = setInterval(() => {
      this.clients.forEach((client, clientId) => {
        if (!client.isAlive) {
          logger.warn('Client failed heartbeat, terminating', { clientId });
          client.ws.terminate();
          this.removeClient(clientId);
          return;
        }

        client.isAlive = false;
        client.ws.ping();
      });
    }, 30000); // 30 seconds
  }

  public sendToClient(clientId: string, message: any) {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot send to client - not connected', { clientId });
      return;
    }

    try {
      const messageStr = JSON.stringify(message);
      client.ws.send(messageStr);
      logger.debug('Sent message to client', {
        clientId,
        type: message.type,
        size: messageStr.length
      });
    } catch (error) {
      logger.error('Failed to send message to client', { clientId, error });
    }
  }

  public broadcastToWorkflow(workflowId: string, message: any) {
    const subscribers = this.workflowSubscriptions.get(workflowId);
    if (!subscribers || subscribers.size === 0) {
      logger.debug('No subscribers for workflow', { workflowId });
      return;
    }

    const payload = {
      ...message,
      workflowId,
      timestamp: new Date().toISOString()
    };

    let sent = 0;
    subscribers.forEach(clientId => {
      this.sendToClient(clientId, payload);
      sent++;
    });

    logger.info('Broadcasted to workflow subscribers', {
      workflowId,
      subscriberCount: subscribers.size,
      sentCount: sent
    });
  }

  public sendWorkflowStatus(workflowId: string, workflow: any) {
    const message = {
      type: 'workflow-status',
      workflowId,
      status: workflow.status,
      message: `Workflow is ${workflow.status}`,
      ...(workflow.status === 'completed' && workflow.results ? {
        results: workflow.results,
        score: workflow.results.overallScore,
        findings: workflow.results.testResults
      } : {})
    };

    this.broadcastToWorkflow(workflowId, message);
  }

  public shutdown() {
    clearInterval(this.pingInterval);
    
    // Close all client connections
    this.clients.forEach((client, clientId) => {
      client.ws.close(1001, 'Server shutting down');
    });

    this.wss.close(() => {
      logger.info('WebSocket server closed');
    });
  }
}