import { WebSocket, WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('EnhancedWebSocketManager');

export interface WebSocketClient {
  id: string;
  ws: WebSocket;
  workflowId?: string;
  subscriptions: Set<string>;
  authenticated: boolean;
  metadata: {
    connectedAt: Date;
    userAgent?: string;
    role?: string;
  };
}

export interface BroadcastMessage {
  type: string;
  workflowId?: string;
  data: any;
  timestamp: Date;
}

export interface RealtimeUpdate {
  updateType: 'phase' | 'test' | 'finding' | 'decision' | 'approval' | 'status' | 'progress';
  workflowId: string;
  data: any;
  priority: 'low' | 'normal' | 'high' | 'critical';
}

export class EnhancedWebSocketManager extends EventEmitter {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocketClient> = new Map();
  private workflowClients: Map<string, Set<string>> = new Map();
  private messageQueue: Map<string, BroadcastMessage[]> = new Map();
  private rateLimits: Map<string, number> = new Map();
  private maxQueueSize: number = 100;
  private rateLimitWindow: number = 60000; // 1 minute
  private maxMessagesPerWindow: number = 100;

  constructor(server: any, options?: { path?: string }) {
    super();
    
    this.wss = new WebSocketServer({
      server,
      path: options?.path || '/ws',
      verifyClient: this.verifyClient.bind(this)
    });

    this.initializeWebSocket();
    this.startHeartbeat();
    this.startQueueProcessor();

    logger.info('Enhanced WebSocket Manager initialized', {
      path: options?.path || '/ws'
    });
  }

  private initializeWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket, request: any) => {
      const clientId = uuidv4();
      const client: WebSocketClient = {
        id: clientId,
        ws,
        subscriptions: new Set(),
        authenticated: false,
        metadata: {
          connectedAt: new Date(),
          userAgent: request.headers['user-agent']
        }
      };

      this.clients.set(clientId, client);
      
      logger.info('WebSocket client connected', {
        clientId,
        userAgent: client.metadata.userAgent
      });

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'welcome',
        clientId,
        timestamp: new Date(),
        capabilities: [
          'realtime-updates',
          'workflow-subscription',
          'test-progress',
          'ai-decisions',
          'approval-requests'
        ]
      });

      // Set up event handlers
      ws.on('message', (data) => this.handleMessage(clientId, data));
      ws.on('close', () => this.handleDisconnect(clientId));
      ws.on('error', (error) => this.handleError(clientId, error));
      ws.on('pong', () => this.handlePong(clientId));
    });

    this.wss.on('error', (error) => {
      logger.error('WebSocket server error', { error });
    });
  }

  private verifyClient(info: any, callback: (result: boolean) => void): void {
    // Add authentication logic here
    // For now, accept all connections
    callback(true);
  }

  private handleMessage(clientId: string, data: any): void {
    try {
      const client = this.clients.get(clientId);
      if (!client) return;

      const message = JSON.parse(data.toString());
      
      logger.debug('WebSocket message received', {
        clientId,
        type: message.type,
        workflowId: message.workflowId
      });

      // Check rate limits
      if (!this.checkRateLimit(clientId)) {
        this.sendToClient(clientId, {
          type: 'error',
          error: 'Rate limit exceeded',
          retryAfter: 60
        });
        return;
      }

      switch (message.type) {
        case 'authenticate':
          this.handleAuthentication(clientId, message);
          break;

        case 'subscribe':
          this.handleSubscription(clientId, message);
          break;

        case 'unsubscribe':
          this.handleUnsubscription(clientId, message);
          break;

        case 'ping':
          this.sendToClient(clientId, { type: 'pong', timestamp: new Date() });
          break;

        case 'request-update':
          this.handleUpdateRequest(clientId, message);
          break;

        case 'approval-response':
          this.handleApprovalResponse(clientId, message);
          break;

        default:
          this.sendToClient(clientId, {
            type: 'error',
            error: `Unknown message type: ${message.type}`
          });
      }
    } catch (error) {
      logger.error('Failed to handle message', { clientId, error });
      this.sendToClient(clientId, {
        type: 'error',
        error: 'Invalid message format'
      });
    }
  }

  private handleAuthentication(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Simplified authentication - in production, verify JWT or session
    if (message.token) {
      client.authenticated = true;
      client.metadata.role = message.role || 'viewer';
      
      logger.info('Client authenticated', {
        clientId,
        role: client.metadata.role
      });

      this.sendToClient(clientId, {
        type: 'authenticated',
        role: client.metadata.role,
        permissions: this.getPermissions(client.metadata.role)
      });
    } else {
      this.sendToClient(clientId, {
        type: 'error',
        error: 'Authentication failed'
      });
    }
  }

  private handleSubscription(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client || !client.authenticated) {
      this.sendToClient(clientId, {
        type: 'error',
        error: 'Not authenticated'
      });
      return;
    }

    const { workflowId, channels } = message;
    
    if (workflowId) {
      client.workflowId = workflowId;
      client.subscriptions.add(`workflow:${workflowId}`);
      
      // Add to workflow clients map
      const workflowClients = this.workflowClients.get(workflowId) || new Set();
      workflowClients.add(clientId);
      this.workflowClients.set(workflowId, workflowClients);
      
      // Send any queued messages
      const queuedMessages = this.messageQueue.get(workflowId) || [];
      for (const msg of queuedMessages) {
        this.sendToClient(clientId, msg);
      }
      this.messageQueue.delete(workflowId);
    }

    if (channels && Array.isArray(channels)) {
      for (const channel of channels) {
        client.subscriptions.add(channel);
      }
    }

    logger.info('Client subscribed', {
      clientId,
      workflowId,
      subscriptions: Array.from(client.subscriptions)
    });

    this.sendToClient(clientId, {
      type: 'subscribed',
      workflowId,
      channels: Array.from(client.subscriptions)
    });
  }

  private handleUnsubscription(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { workflowId, channels } = message;

    if (workflowId) {
      client.subscriptions.delete(`workflow:${workflowId}`);
      const workflowClients = this.workflowClients.get(workflowId);
      if (workflowClients) {
        workflowClients.delete(clientId);
        if (workflowClients.size === 0) {
          this.workflowClients.delete(workflowId);
        }
      }
    }

    if (channels && Array.isArray(channels)) {
      for (const channel of channels) {
        client.subscriptions.delete(channel);
      }
    }

    this.sendToClient(clientId, {
      type: 'unsubscribed',
      workflowId,
      channels
    });
  }

  private handleUpdateRequest(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client || !client.authenticated) return;

    const { workflowId, updateType } = message;

    // Emit event to request current state
    this.emit('update-request', {
      clientId,
      workflowId,
      updateType,
      respond: (data: any) => {
        this.sendToClient(clientId, {
          type: 'update-response',
          workflowId,
          updateType,
          data
        });
      }
    });
  }

  private handleApprovalResponse(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client || !client.authenticated || client.metadata.role !== 'admin') {
      this.sendToClient(clientId, {
        type: 'error',
        error: 'Insufficient permissions'
      });
      return;
    }

    const { approvalId, approved, reason } = message;

    this.emit('approval-response', {
      clientId,
      approvalId,
      approved,
      reason
    });

    logger.info('Approval response received', {
      clientId,
      approvalId,
      approved
    });
  }

  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    logger.info('WebSocket client disconnected', {
      clientId,
      duration: Date.now() - client.metadata.connectedAt.getTime()
    });

    // Remove from workflow clients
    if (client.workflowId) {
      const workflowClients = this.workflowClients.get(client.workflowId);
      if (workflowClients) {
        workflowClients.delete(clientId);
        if (workflowClients.size === 0) {
          this.workflowClients.delete(client.workflowId);
        }
      }
    }

    this.clients.delete(clientId);
    this.rateLimits.delete(clientId);
  }

  private handleError(clientId: string, error: Error): void {
    logger.error('WebSocket client error', { clientId, error });
  }

  private handlePong(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.ws.isAlive = true;
    }
  }

  // Public methods for broadcasting updates

  public broadcastRealtimeUpdate(update: RealtimeUpdate): void {
    const message: BroadcastMessage = {
      type: `realtime:${update.updateType}`,
      workflowId: update.workflowId,
      data: update.data,
      timestamp: new Date()
    };

    // Send to all clients subscribed to this workflow
    const workflowClients = this.workflowClients.get(update.workflowId);
    if (workflowClients && workflowClients.size > 0) {
      for (const clientId of workflowClients) {
        this.sendToClient(clientId, message);
      }
    } else {
      // Queue message if no clients are connected
      if (update.priority === 'high' || update.priority === 'critical') {
        this.queueMessage(update.workflowId, message);
      }
    }

    // Also broadcast to channel subscribers
    const channelName = `${update.updateType}:updates`;
    this.broadcastToChannel(channelName, message);
  }

  public sendPhaseUpdate(workflowId: string, phaseData: any): void {
    this.broadcastRealtimeUpdate({
      updateType: 'phase',
      workflowId,
      data: {
        phase: phaseData.phase,
        status: phaseData.status,
        progress: phaseData.progress,
        message: phaseData.message
      },
      priority: 'normal'
    });
  }

  public sendTestProgress(workflowId: string, testData: any): void {
    this.broadcastRealtimeUpdate({
      updateType: 'test',
      workflowId,
      data: {
        testId: testData.testId,
        tool: testData.tool,
        status: testData.status,
        progress: testData.progress,
        currentStep: testData.currentStep
      },
      priority: 'normal'
    });
  }

  public sendFindingAlert(workflowId: string, finding: any): void {
    const priority = finding.severity === 'critical' ? 'critical' : 
                    finding.severity === 'high' ? 'high' : 'normal';

    this.broadcastRealtimeUpdate({
      updateType: 'finding',
      workflowId,
      data: {
        findingId: finding.id,
        type: finding.type,
        severity: finding.severity,
        title: finding.title,
        tool: finding.tool,
        timestamp: new Date()
      },
      priority
    });
  }

  public sendAIDecision(workflowId: string, decision: any): void {
    this.broadcastRealtimeUpdate({
      updateType: 'decision',
      workflowId,
      data: {
        decisionId: decision.id,
        type: decision.type,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
        impact: decision.impact
      },
      priority: 'normal'
    });
  }

  public requestApproval(workflowId: string, approval: any): void {
    this.broadcastRealtimeUpdate({
      updateType: 'approval',
      workflowId,
      data: {
        approvalId: approval.id,
        type: approval.type,
        reason: approval.reason,
        details: approval.details,
        timeout: approval.timeout,
        requestedAt: new Date()
      },
      priority: 'high'
    });
  }

  public sendStatusUpdate(workflowId: string, status: any): void {
    this.broadcastRealtimeUpdate({
      updateType: 'status',
      workflowId,
      data: {
        overall: status.overall,
        phase: status.phase,
        testsCompleted: status.testsCompleted,
        testsTotal: status.testsTotal,
        findings: status.findings,
        elapsed: status.elapsed
      },
      priority: 'low'
    });
  }

  // Helper methods

  private sendToClient(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;

    try {
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error('Failed to send message to client', { clientId, error });
    }
  }

  private broadcastToChannel(channel: string, message: any): void {
    for (const [clientId, client] of this.clients) {
      if (client.subscriptions.has(channel) && client.ws.readyState === WebSocket.OPEN) {
        this.sendToClient(clientId, message);
      }
    }
  }

  private queueMessage(workflowId: string, message: BroadcastMessage): void {
    const queue = this.messageQueue.get(workflowId) || [];
    queue.push(message);
    
    // Limit queue size
    if (queue.length > this.maxQueueSize) {
      queue.shift(); // Remove oldest message
    }
    
    this.messageQueue.set(workflowId, queue);
  }

  private checkRateLimit(clientId: string): boolean {
    const now = Date.now();
    const count = this.rateLimits.get(clientId) || 0;
    
    if (count >= this.maxMessagesPerWindow) {
      return false;
    }
    
    this.rateLimits.set(clientId, count + 1);
    
    // Reset counter after window
    setTimeout(() => {
      this.rateLimits.delete(clientId);
    }, this.rateLimitWindow);
    
    return true;
  }

  private getPermissions(role: string): string[] {
    const permissions: Record<string, string[]> = {
      admin: ['view', 'execute', 'approve', 'configure'],
      operator: ['view', 'execute'],
      viewer: ['view']
    };
    
    return permissions[role] || permissions.viewer;
  }

  private startHeartbeat(): void {
    setInterval(() => {
      for (const [clientId, client] of this.clients) {
        if (client.ws.isAlive === false) {
          logger.info('Terminating inactive client', { clientId });
          client.ws.terminate();
          this.handleDisconnect(clientId);
          continue;
        }
        
        client.ws.isAlive = false;
        client.ws.ping();
      }
    }, 30000); // 30 seconds
  }

  private startQueueProcessor(): void {
    setInterval(() => {
      // Clean up old queued messages
      for (const [workflowId, messages] of this.messageQueue) {
        const now = Date.now();
        const filtered = messages.filter(msg => 
          now - msg.timestamp.getTime() < 300000 // Keep messages for 5 minutes
        );
        
        if (filtered.length === 0) {
          this.messageQueue.delete(workflowId);
        } else {
          this.messageQueue.set(workflowId, filtered);
        }
      }
    }, 60000); // 1 minute
  }

  public getConnectedClients(): number {
    return this.clients.size;
  }

  public getWorkflowClients(workflowId: string): number {
    return this.workflowClients.get(workflowId)?.size || 0;
  }

  public shutdown(): void {
    logger.info('Shutting down WebSocket server');
    
    // Notify all clients
    for (const [clientId, client] of this.clients) {
      this.sendToClient(clientId, {
        type: 'shutdown',
        message: 'Server is shutting down'
      });
      client.ws.close();
    }
    
    this.wss.close();
  }
}