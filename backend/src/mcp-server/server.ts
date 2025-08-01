import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { tools, SecurityTool, prepareToolCommand } from './tools/tools.js';
import { ToolHandler } from './handlers/toolHandler.js';
import { Intent, ClassificationResult } from '../models/intent.js';
import { ViableAttacks, EnrichedAttack, AttackExecutionPlan } from '../models/viableAttacks.js';
import { TestResult, AggregatedResults } from '../models/testResult.js';
import { createLogger, logWorkflowStart, logWorkflowEnd, logAttackExecution } from '../utils/logger.js';
import { Semaphore } from '../utils/semaphore.js';
import { safeStringify } from '../utils/serialize.js';

const logger = createLogger('MCPServer');

export interface MCPContext {
  workflowId: string;
  target: string;
  scope?: string;
  description?: string;
  auth?: {
    username?: string;
    password?: string;
    token?: string;
  };
  options?: {
    maxConcurrent?: number;
    timeout?: number;
    progressive?: boolean;
  };
}

export interface MCPWorkflowResult {
  workflowId: string;
  status: 'completed' | 'failed' | 'cancelled';
  duration: number;
  results: AggregatedResults;
  errors?: string[];
}

export class MCPServer extends EventEmitter {
  private toolHandler: ToolHandler;
  private semaphore: Semaphore;
  private activeWorkflows: Map<string, AbortController>;

  constructor() {
    super();
    this.toolHandler = new ToolHandler();
    this.semaphore = new Semaphore(Number(process.env.MAX_CONCURRENT) || 4);
    this.activeWorkflows = new Map();
  }

  /**
   * Initialize the MCP server
   */
  async initialize(): Promise<void> {
    logger.info('Initializing MCP server');
    await this.toolHandler.initialize();
    logger.info('MCP server initialized successfully');
  }

  /**
   * Main workflow execution
   */
  async runWorkflow(context: MCPContext): Promise<MCPWorkflowResult> {
    const startTime = Date.now();
    const workflowId = context.workflowId || uuidv4();
    const abortController = new AbortController();
    
    this.activeWorkflows.set(workflowId, abortController);
    logWorkflowStart(workflowId, context);

    try {
      // Emit workflow start event
      this.emit('workflow:start', { workflowId, context });

      // Step 1: Classify intent (mocked for now - will be implemented in layers)
      const classificationResult = await this.classifyIntent(context);
      this.emit('workflow:classified', { workflowId, classification: classificationResult });

      // Step 2: Enrich and get viable attacks (mocked for now)
      const viableAttacks = await this.enrichContext(classificationResult, context);
      this.emit('workflow:enriched', { workflowId, viableAttacks });

      // Step 3: Create execution plan
      const executionPlan = this.createExecutionPlan(viableAttacks);
      this.emit('workflow:planned', { workflowId, plan: executionPlan });

      // Step 4: Execute attacks
      const testResults = await this.executeAttacks(
        executionPlan,
        context,
        workflowId,
        abortController.signal
      );

      // Step 5: Aggregate results
      const aggregatedResults = this.aggregateResults(workflowId, testResults);
      
      const duration = Date.now() - startTime;
      logWorkflowEnd(workflowId, duration, 'success', aggregatedResults);

      return {
        workflowId,
        status: 'completed',
        duration,
        results: aggregatedResults
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Workflow failed', { workflowId, error });
      logWorkflowEnd(workflowId, duration, 'failure', error);
      
      return {
        workflowId,
        status: 'failed',
        duration,
        results: this.createEmptyResults(workflowId),
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    } finally {
      this.activeWorkflows.delete(workflowId);
    }
  }

  /**
   * Handle individual tool call
   */
  async handleToolCall(
    toolName: string,
    params: Record<string, any>,
    workflowId: string
  ): Promise<TestResult> {
    const tool = tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    const attackId = uuidv4();
    logAttackExecution(workflowId, attackId, toolName, 'start', { params });

    try {
      const result = await this.toolHandler.execute({
        tool,
        params,
        workflowId,
        attackId
      });

      logAttackExecution(workflowId, attackId, toolName, 'end', { 
        status: result.status,
        findings: result.findings.length 
      });

      return result;
    } catch (error) {
      logger.error(`Tool execution failed: ${toolName}`, { workflowId, error });
      throw error;
    }
  }

  /**
   * Cancel an active workflow
   */
  async cancelWorkflow(workflowId: string): Promise<void> {
    const controller = this.activeWorkflows.get(workflowId);
    if (controller) {
      controller.abort();
      this.activeWorkflows.delete(workflowId);
      logger.info(`Workflow cancelled: ${workflowId}`);
    }
  }

  /**
   * Mock intent classification (will be replaced by actual implementation)
   */
  private async classifyIntent(context: MCPContext): Promise<ClassificationResult> {
    // This is a simplified mock - actual implementation will use embeddings
    const intent: Intent = {
      id: uuidv4(),
      type: 'security',
      rawInput: context.description || context.target,
      matchedAttacks: tools.slice(0, 5).map(tool => ({
        attackId: tool.name,
        attackName: tool.attackType,
        description: tool.description,
        similarity: 0.85,
        tsc: tool.tsc,
        cc: tool.cc,
        tools: [{
          name: tool.name,
          command: tool.command,
          priority: 'standard',
          estimatedDuration: tool.timeout || 180000,
          resourceRequirements: {}
        }],
        requiresAuth: tool.requiresAuth,
        progressive: tool.progressive,
        evidenceRequired: tool.evidenceRequired
      })),
      confidence: 0.85,
      timestamp: new Date()
    };

    return {
      intent,
      suggestedMethodology: 'standard',
      estimatedDuration: 1800000, // 30 minutes
      requiresHITL: false
    };
  }

  /**
   * Mock context enrichment (will be replaced by actual implementation)
   */
  private async enrichContext(
    classification: ClassificationResult,
    context: MCPContext
  ): Promise<ViableAttacks> {
    // This is a simplified mock - actual implementation will use pgvector
    const enrichedAttacks = classification.intent.matchedAttacks.map(attack => ({
      attackId: attack.attackId,
      attackName: attack.attackName,
      description: attack.description,
      priority: attack.tools[0].priority as 'critical' | 'standard' | 'low',
      confidence: attack.similarity,
      historicalSuccess: 0.75,
      estimatedDuration: attack.tools[0].estimatedDuration,
      tools: [{
        name: attack.tools[0].name,
        command: attack.tools[0].command,
        arguments: { target: context.target },
        timeout: attack.tools[0].estimatedDuration,
        retryCount: 2,
        containerImage: tools.find(t => t.name === attack.attackId)?.containerImage
      }],
      tsc: attack.tsc,
      cc: attack.cc,
      requiresAuth: attack.requiresAuth,
      progressive: attack.progressive,
      evidenceRequired: attack.evidenceRequired
    } as EnrichedAttack));

    const critical = enrichedAttacks.filter(a => a.priority === 'critical');
    const standard = enrichedAttacks.filter(a => a.priority === 'standard');
    const lowPriority = enrichedAttacks.filter(a => a.priority === 'low');
    const requiresAuth = enrichedAttacks.filter(a => a.requiresAuth);

    return {
      workflowId: context.workflowId || uuidv4(),
      critical,
      standard,
      lowPriority,
      totalCount: enrichedAttacks.length,
      requiresAuth,
      metadata: {
        enrichmentTimestamp: new Date(),
        historicalDataUsed: false,
        embeddingSimilarityThreshold: 0.8,
        confidenceThreshold: 0.6,
        totalAttacksConsidered: tools.length,
        filteredCount: enrichedAttacks.length,
        reasoning: ['Mock enrichment - actual implementation will use pgvector']
      }
    };
  }

  /**
   * Create execution plan from viable attacks
   */
  private createExecutionPlan(viableAttacks: ViableAttacks): AttackExecutionPlan {
    const phases = [];
    
    // Phase 1: Non-auth attacks
    const nonAuthAttacks = [
      ...viableAttacks.critical.filter(a => !a.requiresAuth),
      ...viableAttacks.standard.filter(a => !a.requiresAuth)
    ];
    
    if (nonAuthAttacks.length > 0) {
      phases.push({
        phase: 1,
        attacks: nonAuthAttacks.map(a => a.attackId),
        estimatedDuration: Math.max(...nonAuthAttacks.map(a => a.estimatedDuration)),
        resourceRequirements: {
          maxConcurrentContainers: Math.min(nonAuthAttacks.length, 4),
          estimatedCPU: '2 cores',
          estimatedMemory: '4GB'
        }
      });
    }

    // Phase 2: Auth-required attacks
    const authAttacks = viableAttacks.requiresAuth;
    if (authAttacks.length > 0) {
      phases.push({
        phase: 2,
        attacks: authAttacks.map(a => a.attackId),
        estimatedDuration: Math.max(...authAttacks.map(a => a.estimatedDuration)),
        resourceRequirements: {
          maxConcurrentContainers: Math.min(authAttacks.length, 2),
          estimatedCPU: '2 cores',
          estimatedMemory: '4GB'
        }
      });
    }

    return {
      viableAttacks,
      executionOrder: phases,
      estimatedTotalDuration: phases.reduce((sum, p) => sum + p.estimatedDuration, 0),
      resourceRequirements: {
        maxConcurrentContainers: 4,
        estimatedCPU: '4 cores',
        estimatedMemory: '8GB'
      },
      requiresHITL: authAttacks.length > 0,
      hitlCheckpoints: authAttacks.map(a => ({
        attackId: a.attackId,
        reason: 'requires-auth' as const,
        description: `${a.attackName} requires authentication`,
        approvalRequired: true
      }))
    };
  }

  /**
   * Execute attacks according to plan
   */
  private async executeAttacks(
    plan: AttackExecutionPlan,
    context: MCPContext,
    workflowId: string,
    signal: AbortSignal
  ): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (const phase of plan.executionOrder) {
      if (signal.aborted) {
        break;
      }

      this.emit('workflow:phase:start', { workflowId, phase: phase.phase });

      const phaseResults = await Promise.all(
        phase.attacks.map(async (attackId) => {
          const attack = [
            ...plan.viableAttacks.critical,
            ...plan.viableAttacks.standard,
            ...plan.viableAttacks.lowPriority
          ].find(a => a.attackId === attackId);

          if (!attack || signal.aborted) {
            return null;
          }

          return this.semaphore.withLock(async () => {
            if (signal.aborted) return null;

            const tool = tools.find(t => t.name === attack.attackId);
            if (!tool) return null;

            return this.handleToolCall(
              tool.name,
              { 
                target: context.target,
                ...context.auth 
              },
              workflowId
            );
          });
        })
      );

      results.push(...phaseResults.filter((r): r is TestResult => r !== null));
      
      this.emit('workflow:phase:complete', { 
        workflowId, 
        phase: phase.phase,
        results: phaseResults.length 
      });
    }

    return results;
  }

  /**
   * Aggregate test results
   */
  private aggregateResults(workflowId: string, testResults: TestResult[]): AggregatedResults {
    const findingsBySeverity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0
    };

    let totalFindings = 0;
    let totalDuration = 0;
    let completedTests = 0;
    let failedTests = 0;

    testResults.forEach(result => {
      if (result.status === 'completed') {
        completedTests++;
      } else {
        failedTests++;
      }

      totalDuration += result.duration;
      totalFindings += result.findings.length;

      result.findings.forEach(finding => {
        findingsBySeverity[finding.severity]++;
      });
    });

    // Calculate overall score (100 - weighted severity sum)
    const severityWeights = { critical: 30, high: 20, medium: 10, low: 5, info: 1 };
    const weightedSum = Object.entries(findingsBySeverity).reduce(
      (sum, [severity, count]) => sum + (severityWeights[severity as keyof typeof severityWeights] || 0) * count,
      0
    );
    const overallScore = Math.max(0, 100 - Math.min(weightedSum, 100));

    return {
      workflowId,
      overallScore,
      totalFindings,
      findingsBySeverity,
      completedTests,
      failedTests,
      totalDuration,
      totalCost: {
        executionTime: totalDuration,
        cpuUsage: 50,
        memoryUsage: 2048 * 1024 * 1024
      },
      testResults
    };
  }

  /**
   * Create empty results object
   */
  private createEmptyResults(workflowId: string): AggregatedResults {
    return {
      workflowId,
      overallScore: 0,
      totalFindings: 0,
      findingsBySeverity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0
      },
      completedTests: 0,
      failedTests: 0,
      totalDuration: 0,
      totalCost: {
        executionTime: 0
      },
      testResults: []
    };
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down MCP server');
    
    // Cancel all active workflows
    for (const [workflowId, controller] of this.activeWorkflows) {
      controller.abort();
    }
    this.activeWorkflows.clear();

    // Cleanup tool handler
    await this.toolHandler.cleanup();
    
    logger.info('MCP server shutdown complete');
  }
} 