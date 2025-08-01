import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { MCPServer, MCPContext } from '../../mcp-server/server.js';
import { QueueService } from '../../services/queueService.js';
import { createLogger } from '../../utils/logger.js';
import { safeStringify } from '../../utils/serialize.js';

const logger = createLogger('WorkflowController');

// Request validation schema
const workflowRequestSchema = z.object({
  target: z.string().url().or(z.string().ip()),
  scope: z.enum(['security', 'availability', 'authentication', 'authorization', 'data-integrity', 'comprehensive']).optional(),
  description: z.string().optional(),
  auth: z.object({
    username: z.string().optional(),
    password: z.string().optional(),
    token: z.string().optional()
  }).optional(),
  options: z.object({
    progressive: z.boolean().optional(),
    maxConcurrent: z.number().min(1).max(10).optional(),
    timeout: z.number().min(60000).max(3600000).optional() // 1 minute to 1 hour
  }).optional()
});

export type WorkflowRequest = z.infer<typeof workflowRequestSchema>;

export class WorkflowController {
  private mcpServer: MCPServer;
  private queueService: QueueService;
  private activeWorkflows: Map<string, any>;

  constructor() {
    this.mcpServer = new MCPServer();
    this.queueService = new QueueService(this.mcpServer);
    this.activeWorkflows = new Map();
    this.setupEventListeners();
  }

  /**
   * Initialize the controller
   */
  async initialize(): Promise<void> {
    logger.info('Initializing workflow controller');
    await this.mcpServer.initialize();
    
    // Only initialize queue service if Redis is available
    if (process.env.REDIS_URL || process.env.REDIS_HOST) {
      try {
        await this.queueService.initialize();
      } catch (error) {
        logger.warn('Queue service initialization failed, running without queue', { error });
      }
    }
    
    logger.info('Workflow controller initialized');
  }

  /**
   * Run SOC2 workflow endpoint
   */
  async runWorkflow(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    const workflowId = uuidv4();

    try {
      // Validate request
      const validatedData = workflowRequestSchema.parse(req.body);
      
      logger.info('Starting SOC2 workflow', { 
        workflowId, 
        target: validatedData.target,
        scope: validatedData.scope 
      });

      // Create MCP context
      const context: MCPContext = {
        workflowId,
        target: validatedData.target,
        scope: validatedData.scope,
        description: validatedData.description,
        auth: validatedData.auth,
        options: validatedData.options
      };

      // Store workflow info
      this.activeWorkflows.set(workflowId, {
        startTime,
        status: 'running',
        context
      });

      // Send immediate response with workflow ID
      res.status(202).json({
        workflowId,
        status: 'accepted',
        message: 'Workflow started successfully',
        estimatedDuration: 1800000, // 30 minutes
        monitoringUrl: `/api/workflows/${workflowId}/status`
      });

      // Execute workflow asynchronously
      this.executeWorkflowAsync(context);

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Invalid request',
          details: error.errors
        });
      } else {
        logger.error('Failed to start workflow', { error });
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to start workflow'
        });
      }
    }
  }

  /**
   * Get workflow status
   */
  async getWorkflowStatus(req: Request, res: Response): Promise<void> {
    const { workflowId } = req.params;

    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      res.status(404).json({
        error: 'Workflow not found',
        workflowId
      });
      return;
    }

    res.json({
      workflowId,
      status: workflow.status,
      startTime: workflow.startTime,
      duration: Date.now() - workflow.startTime,
      progress: workflow.progress || 0,
      results: workflow.results
    });
  }

  /**
   * Cancel a running workflow
   */
  async cancelWorkflow(req: Request, res: Response): Promise<void> {
    const { workflowId } = req.params;
    
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    workflow.status = 'cancelled';
    workflow.endTime = Date.now();
    
    logger.info('Workflow cancelled', { workflowId });
    
    res.json({
      workflowId,
      status: 'cancelled',
      message: 'Workflow cancelled successfully'
    });
  }

  /**
   * Approve HITL request for a workflow
   */
  async approveWorkflow(req: Request, res: Response): Promise<void> {
    const { workflowId } = req.params;
    const { approved = true } = req.body;
    
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }
    
    if (workflow.status !== 'awaiting-hitl' && workflow.status !== 'awaiting-auth') {
      res.status(400).json({ 
        error: 'Workflow is not awaiting approval',
        currentStatus: workflow.status 
      });
      return;
    }
    
    logger.info('HITL approval received', { workflowId, approved });
    
    if (approved) {
      // Resume workflow execution
      workflow.status = 'executing';
      workflow.hitlApproved = true;
      workflow.hitlApprovedAt = Date.now();
      
      // Emit event to resume workflow
      this.mcpServer.emit('workflow:hitl:approved', { workflowId });
      
      res.json({
        workflowId,
        status: 'approved',
        message: 'Workflow approved and resumed'
      });
    } else {
      // Cancel workflow
      workflow.status = 'rejected';
      workflow.hitlApproved = false;
      workflow.endTime = Date.now();
      
      this.mcpServer.emit('workflow:hitl:rejected', { workflowId });
      
      res.json({
        workflowId,
        status: 'rejected',
        message: 'Workflow rejected and cancelled'
      });
    }
  }

  /**
   * Get queue metrics
   */
  async getQueueMetrics(req: Request, res: Response): Promise<void> {
    try {
      const metrics = await this.queueService.getMetrics();
      const health = await this.queueService.getHealthStatus();

      res.json({
        queue: metrics,
        health,
        activeWorkflows: this.activeWorkflows.size
      });

    } catch (error) {
      logger.error('Failed to get queue metrics', { error });
      res.status(500).json({
        error: 'Failed to get queue metrics'
      });
    }
  }

  /**
   * List active workflows
   */
  async listWorkflows(req: Request, res: Response): Promise<void> {
    const workflows = Array.from(this.activeWorkflows.entries()).map(([id, workflow]) => ({
      workflowId: id,
      status: workflow.status,
      target: workflow.context.target,
      scope: workflow.context.scope,
      startTime: workflow.startTime,
      duration: Date.now() - workflow.startTime
    }));

    res.json({
      workflows,
      total: workflows.length
    });
  }

  /**
   * Execute workflow asynchronously
   */
  private async executeWorkflowAsync(context: MCPContext): Promise<void> {
    const { workflowId } = context;

    try {
      // Update status
      const workflow = this.activeWorkflows.get(workflowId);
      if (workflow) {
        workflow.status = 'executing';
      }

      // Run the workflow
      const result = await this.mcpServer.runWorkflow(context);

      // Update workflow with results
      if (workflow) {
        workflow.status = result.status;
        workflow.results = result.results;
        workflow.endTime = Date.now();
        workflow.duration = result.duration;
      }

      logger.info('Workflow completed', { 
        workflowId, 
        status: result.status,
        findings: result.results.totalFindings,
        score: result.results.overallScore 
      });

    } catch (error) {
      logger.error('Workflow execution failed', { workflowId, error });
      
      const workflow = this.activeWorkflows.get(workflowId);
      if (workflow) {
        workflow.status = 'failed';
        workflow.error = error instanceof Error ? error.message : 'Unknown error';
      }
    }
  }

  /**
   * Setup event listeners for real-time updates
   */
  private setupEventListeners(): void {
    // MCP Server events
    this.mcpServer.on('workflow:start', ({ workflowId }) => {
      const workflow = this.activeWorkflows.get(workflowId);
      if (workflow) {
        workflow.progress = 0;
      }
    });

    this.mcpServer.on('workflow:classified', ({ workflowId }) => {
      const workflow = this.activeWorkflows.get(workflowId);
      if (workflow) {
        workflow.progress = 20;
      }
    });

    this.mcpServer.on('workflow:enriched', ({ workflowId }) => {
      const workflow = this.activeWorkflows.get(workflowId);
      if (workflow) {
        workflow.progress = 40;
      }
    });

    this.mcpServer.on('workflow:phase:start', ({ workflowId, phase }) => {
      const workflow = this.activeWorkflows.get(workflowId);
      if (workflow) {
        workflow.currentPhase = phase;
        workflow.progress = 40 + (phase * 20);
      }
    });

    this.mcpServer.on('workflow:phase:complete', ({ workflowId, phase }) => {
      const workflow = this.activeWorkflows.get(workflowId);
      if (workflow) {
        workflow.progress = 60 + (phase * 20);
      }
    });
  }

  /**
   * Cleanup old workflows
   */
  cleanupOldWorkflows(): void {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();

    for (const [workflowId, workflow] of this.activeWorkflows.entries()) {
      if (now - workflow.startTime > maxAge) {
        this.activeWorkflows.delete(workflowId);
      }
    }
  }

  /**
   * Health check
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const queueHealth = await this.queueService.getHealthStatus();
      
      res.json({
        status: 'healthy',
        services: {
          mcpServer: 'active',
          queueService: queueHealth.isHealthy ? 'active' : 'degraded',
          redis: queueHealth.redisConnected
        },
        activeWorkflows: this.activeWorkflows.size,
        uptime: process.uptime()
      });

    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up workflow controller');
    
    // Cancel all active workflows
    for (const workflowId of this.activeWorkflows.keys()) {
      await this.mcpServer.cancelWorkflow(workflowId);
    }
    
    // Cleanup services
    await this.mcpServer.shutdown();
    await this.queueService.cleanup();
    
    this.activeWorkflows.clear();
  }
} 