import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { MCPServer } from '../../mcp-server/server';
import { logger } from '../../utils/logger';
import { QueueService } from '../../services/queueService';
import { WorkflowModel, WorkflowData } from '../../models/WorkflowModel';

// Request validation schema
const workflowRequestSchema = z.object({
  target: z.string().url(),
  scope: z.enum(['security', 'compliance', 'comprehensive']),
  description: z.string().optional(),
  template: z.string(),
  auth: z.object({
    username: z.string(),
    password: z.string()
  }).optional()
});

export class EnhancedWorkflowController {
  private mcpServer: MCPServer;
  private queueService: QueueService;
  private workflowModel: WorkflowModel;
  private inMemoryCache: Map<string, WorkflowData> = new Map();

  constructor() {
    this.mcpServer = new MCPServer();
    this.queueService = new QueueService();
    this.workflowModel = new WorkflowModel();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing enhanced workflow controller');
    
    await this.mcpServer.initialize();
    await this.queueService.initialize();
    
    // Load active workflows from database
    await this.loadActiveWorkflows();
    
    logger.info('Enhanced workflow controller initialized');
  }

  private async loadActiveWorkflows(): Promise<void> {
    try {
      const activeWorkflows = await this.workflowModel.getActiveWorkflows();
      activeWorkflows.forEach(workflow => {
        this.inMemoryCache.set(workflow.workflowId, workflow);
      });
      logger.info(`Loaded ${activeWorkflows.length} active workflows from database`);
    } catch (error) {
      logger.error('Failed to load active workflows', { error });
    }
  }

  async runWorkflow(req: Request, res: Response): Promise<void> {
    try {
      // Validate request
      const validatedData = workflowRequestSchema.parse(req.body);
      
      const workflowId = uuidv4();
      const workflow: WorkflowData = {
        workflowId,
        status: 'pending',
        target: validatedData.target,
        scope: validatedData.scope,
        description: validatedData.description,
        template: validatedData.template,
        startTime: Date.now(),
        metadata: {
          userAgent: req.get('user-agent'),
          ip: req.ip
        }
      };

      // Save to database and cache
      await this.workflowModel.createWorkflow(workflow);
      this.inMemoryCache.set(workflowId, workflow);

      // Queue the workflow
      await this.queueService.addJob('workflow-execution', {
        workflowId,
        context: {
          workflowId,
          target: validatedData.target,
          scope: validatedData.scope,
          description: validatedData.description,
          template: validatedData.template,
          auth: validatedData.auth
        }
      });

      // Update status to executing
      workflow.status = 'executing';
      await this.workflowModel.updateWorkflow(workflowId, { status: 'executing' });

      res.status(202).json({
        workflowId,
        status: 'accepted',
        message: 'Workflow started successfully',
        estimatedDuration: 30 * 60 * 1000, // 30 minutes
        monitoringUrl: `/api/workflows/${workflowId}/status`
      });

      // Execute workflow asynchronously
      this.executeWorkflow(workflow);

    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Invalid request',
          details: error.errors
        });
      } else {
        logger.error('Failed to start workflow', { error });
        res.status(500).json({
          error: 'Failed to start workflow'
        });
      }
    }
  }

  private async executeWorkflow(workflow: WorkflowData): Promise<void> {
    try {
      const result = await this.mcpServer.runWorkflow({
        workflowId: workflow.workflowId,
        target: workflow.target,
        scope: workflow.scope,
        description: workflow.description,
        template: workflow.template
      });

      // Update workflow with results
      workflow.status = 'completed';
      workflow.endTime = Date.now();
      workflow.duration = workflow.endTime - workflow.startTime;
      workflow.results = result.results;

      // Save to database
      await this.workflowModel.updateWorkflow(workflow.workflowId, {
        status: 'completed',
        endTime: workflow.endTime,
        duration: workflow.duration,
        results: workflow.results
      });

      // Update cache
      this.inMemoryCache.set(workflow.workflowId, workflow);

      logger.info('Workflow completed', {
        workflowId: workflow.workflowId,
        duration: workflow.duration,
        findingsCount: workflow.results?.testResults?.length || 0
      });

    } catch (error) {
      logger.error('Workflow execution failed', { error, workflowId: workflow.workflowId });
      
      workflow.status = 'failed';
      workflow.endTime = Date.now();
      workflow.duration = workflow.endTime - workflow.startTime;

      await this.workflowModel.updateWorkflow(workflow.workflowId, {
        status: 'failed',
        endTime: workflow.endTime,
        duration: workflow.duration,
        metadata: { ...workflow.metadata, error: error.message }
      });

      this.inMemoryCache.set(workflow.workflowId, workflow);
    }
  }

  async getWorkflowStatus(req: Request, res: Response): Promise<void> {
    const { workflowId } = req.params;

    try {
      // Check cache first
      let workflow = this.inMemoryCache.get(workflowId);
      
      // If not in cache, check database
      if (!workflow) {
        workflow = await this.workflowModel.getWorkflow(workflowId);
        if (workflow) {
          this.inMemoryCache.set(workflowId, workflow);
        }
      }

      if (!workflow) {
        res.status(404).json({
          error: 'Workflow not found'
        });
        return;
      }

      res.json({
        workflowId: workflow.workflowId,
        status: workflow.status,
        target: workflow.target,
        scope: workflow.scope,
        startTime: workflow.startTime,
        endTime: workflow.endTime,
        duration: workflow.duration,
        results: workflow.results
      });

    } catch (error) {
      logger.error('Failed to get workflow status', { error, workflowId });
      res.status(500).json({
        error: 'Failed to get workflow status'
      });
    }
  }

  getWorkflow(workflowId: string): WorkflowData | undefined {
    // First check cache
    let workflow = this.inMemoryCache.get(workflowId);
    
    // If not in cache, try to load from database
    if (!workflow) {
      this.workflowModel.getWorkflow(workflowId).then(dbWorkflow => {
        if (dbWorkflow) {
          this.inMemoryCache.set(workflowId, dbWorkflow);
          workflow = dbWorkflow;
        }
      }).catch(error => {
        logger.error('Failed to load workflow from database', { error, workflowId });
      });
    }

    return workflow;
  }

  async listWorkflows(req: Request, res: Response): Promise<void> {
    try {
      const workflows = Array.from(this.inMemoryCache.values())
        .map(workflow => ({
          workflowId: workflow.workflowId,
          status: workflow.status,
          target: workflow.target,
          scope: workflow.scope,
          startTime: workflow.startTime,
          endTime: workflow.endTime,
          duration: workflow.duration
        }))
        .sort((a, b) => b.startTime - a.startTime);

      res.json({
        workflows,
        total: workflows.length
      });

    } catch (error) {
      logger.error('Failed to list workflows', { error });
      res.status(500).json({
        error: 'Failed to list workflows'
      });
    }
  }

  async cleanupOldWorkflows(): Promise<void> {
    try {
      // Remove old workflows from database (older than 30 days)
      const deletedCount = await this.workflowModel.deleteOldWorkflows(30);
      
      // Clean up in-memory cache (older than 24 hours)
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      let removedFromCache = 0;

      this.inMemoryCache.forEach((workflow, workflowId) => {
        if (workflow.endTime && workflow.endTime < oneDayAgo) {
          this.inMemoryCache.delete(workflowId);
          removedFromCache++;
        }
      });

      logger.info('Cleaned up old workflows', {
        deletedFromDb: deletedCount,
        removedFromCache
      });

    } catch (error) {
      logger.error('Failed to cleanup old workflows', { error });
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up enhanced workflow controller');
    
    if (this.mcpServer.cleanup) {
      await this.mcpServer.cleanup();
    }
    
    await this.queueService.cleanup();
    await this.workflowModel.close();
  }
}

// Export singleton instance
export default new EnhancedWorkflowController();