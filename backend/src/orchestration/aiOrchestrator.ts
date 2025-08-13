import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { StrategicAIService } from '../services/strategicAIService.js';
import { ProgressiveDiscovery } from '../phases/progressiveDiscovery.js';
import { DynamicTestTree } from '../trees/dynamicTestTree.js';
import { EnhancedRestraintSystem } from '../restraint/enhancedRestraintSystem.js';
import { TestExecutionEngine } from '../execution/testExecutionEngine.js';
import { AIDecisionLogger } from '../audit/aiDecisionLogger.js';
import { HITLApprovalSystem } from '../approval/hitlApprovalSystem.js';
import { EnhancedWebSocketManager } from '../websocket/enhancedWebSocketManager.js';
import { createLogger } from '../utils/logger.js';
import { RunMetrics } from '../telemetry/runMetrics.js';

const logger = createLogger('AIOrchestrator');

export interface WorkflowRequest {
  id?: string;
  target: string;
  userIntent: string;
  constraints?: {
    timeLimit?: number;
    scope?: string[];
    excludeTests?: string[];
    requiresAuth?: boolean;
    environment?: 'production' | 'staging' | 'development';
  };
  auth?: {
    type: string;
    credentials?: any;
  };
}

export interface WorkflowResult {
  workflowId: string;
  status: 'completed' | 'failed' | 'aborted';
  startTime: Date;
  endTime: Date;
  duration: number;
  phases: any[];
  totalFindings: any[];
  criticalFindings: any[];
  executiveSummary: string;
  owaspCoverage: Record<string, number>;
  ccControlsCovered: string[];
  auditReport?: any;
  recommendations: string[];
}

export class AIOrchestrator extends EventEmitter {
  private aiService: StrategicAIService;
  private progressiveDiscovery: ProgressiveDiscovery;
  private testTree: DynamicTestTree;
  private restraintSystem: EnhancedRestraintSystem;
  private executionEngine: TestExecutionEngine;
  private decisionLogger: AIDecisionLogger;
  private approvalSystem: HITLApprovalSystem;
  private metrics: RunMetrics = new RunMetrics();
  private websocketManager?: EnhancedWebSocketManager;
  private activeWorkflows: Map<string, any> = new Map();

  constructor(websocketManager?: EnhancedWebSocketManager) {
    super();
    
    // Initialize all components
    this.aiService = new StrategicAIService();
    this.decisionLogger = new AIDecisionLogger({ realTimeMode: true });
    this.restraintSystem = new EnhancedRestraintSystem();
    this.approvalSystem = new HITLApprovalSystem();
    this.executionEngine = new TestExecutionEngine(this.restraintSystem, this.decisionLogger);
    this.progressiveDiscovery = new ProgressiveDiscovery(this.aiService);
    this.testTree = new DynamicTestTree(this.aiService);
    this.websocketManager = websocketManager;
    
    // Wire up components
    this.progressiveDiscovery.setToolExecutor(this.executionEngine);
    this.testTree.setToolExecutor(this.executionEngine);
    
    this.setupEventHandlers();
    
    logger.info('AI Orchestrator initialized with all components');
  }

  private setupEventHandlers(): void {
    // Progressive Discovery events
    this.progressiveDiscovery.on('phase:start', (data) => {
      this.broadcastUpdate('phase', data.workflowId, {
        phase: data.phase,
        status: 'started',
        progress: 0,
        message: `Starting ${data.phase} phase: ${data.objective}`
      });
    });

    this.progressiveDiscovery.on('phase:complete', (data) => {
      this.broadcastUpdate('phase', data.workflowId, {
        phase: data.phase,
        status: 'completed',
        progress: 100,
        message: `Completed ${data.phase} phase`,
        summary: data.summary
      });
    });

    this.progressiveDiscovery.on('test:complete', (data) => {
      this.broadcastUpdate('test', data.workflowId, {
        testId: uuidv4(),
        tool: data.test.tool,
        status: data.test.status,
        progress: 100,
        currentStep: 'completed',
        findings: data.test.findingsCount
      });
    });

    // Test Tree events
    this.testTree.on('node:start', (data) => {
      this.broadcastUpdate('test', data.workflowId, {
        testId: data.nodeId,
        tool: data.tool,
        status: 'running',
        progress: 0,
        currentStep: data.testType
      });
    });

    this.testTree.on('node:decision', (data) => {
      this.broadcastUpdate('decision', data.workflowId, {
        decisionId: uuidv4(),
        type: 'tree-node',
        reasoning: data.reasoning,
        confidence: 0.8,
        impact: data.decision === 'skip' ? 'low' : 'medium'
      });
    });

    // Restraint System events
    this.restraintSystem.on('restraint:denied', (data) => {
      logger.warn('Test denied by restraint', data);
      this.broadcastUpdate('status', data.workflowId, {
        overall: 'restraint-check',
        message: `Test denied: ${data.reason}`
      });
    });

    this.restraintSystem.on('approval:required', (data) => {
      this.handleApprovalRequest(data);
    });

    // Approval System events
    this.approvalSystem.on('approval:processed', (data) => {
      this.broadcastUpdate('status', data.request.workflowId, {
        overall: data.decision.approved ? 'approved' : 'denied',
        message: `Approval ${data.decision.approved ? 'granted' : 'denied'} by ${data.decision.approver}`
      });
    });

    // Decision Logger events
    this.decisionLogger.on('decision:logged', (decision) => {
      if (decision.auditFlags?.manualReview) {
        this.broadcastUpdate('decision', decision.workflowId, {
          decisionId: decision.id,
          type: decision.decisionType,
          reasoning: decision.output.reasoning,
          confidence: decision.output.confidence,
          impact: 'high',
          requiresReview: true
        });
      }
    });

    // Execution Engine events
    this.executionEngine.on('execution:complete', (data) => {
      this.broadcastUpdate('test', data.workflowId, {
        testId: data.requestId,
        tool: data.tool,
        status: 'completed',
        progress: 100,
        findings: data.findings
      });
    });
  }

  async executeWorkflow(request: WorkflowRequest): Promise<WorkflowResult> {
    const workflowId = request.id || uuidv4();
    const startTime = new Date();
    
    logger.info('Starting AI-driven security workflow', {
      workflowId,
      target: request.target,
      intent: request.userIntent
    });

    // Store active workflow
    this.activeWorkflows.set(workflowId, {
      request,
      startTime,
      status: 'running'
    });

    try {
      // Initial status update
      this.broadcastUpdate('status', workflowId, {
        overall: 'initializing',
        phase: 'setup',
        testsCompleted: 0,
        testsTotal: 0,
        findings: 0,
        elapsed: 0
      });

      // Log initial decision
      await this.decisionLogger.logDecision({
        workflowId,
        decisionType: 'strategy',
        input: {
          context: request,
          prompt: `Starting security assessment for ${request.target} with intent: ${request.userIntent}`
        },
        output: {
          decision: 'initiate-workflow',
          reasoning: 'User requested security assessment',
          confidence: 1.0
        },
        metadata: {
          model: 'orchestrator',
          phase: 'initialization'
        }
      });

      // Execute progressive discovery (full recon/analyze/exploit flow)
      const discoveryContext = {
        workflowId,
        target: request.target,
        userIntent: request.userIntent,
        constraints: {
          minTestsPerPhase: 10,
          ...request.constraints
        },
        auth: request.auth
      };

      // Option 1: Full progressive discovery (recon -> analyze -> exploit)
      const discoveryResult = await this.executeProgressiveDiscovery(discoveryContext);
      
      // Option 2: Dynamic test tree execution (for more complex scenarios)
      // const treeResult = await this.executeDynamicTestTree(discoveryContext);

      // Generate executive summary
      const executiveSummary = await this.aiService.generateExecutiveSummary(
        workflowId,
        discoveryResult.totalFindings
      );

      // Generate audit report
      const auditReport = await this.decisionLogger.generateAuditReport(workflowId);

      // Calculate CC controls covered
      const ccControlsCovered = this.extractCCControls(discoveryResult.totalFindings);

    // Final status update
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      
      this.broadcastUpdate('status', workflowId, {
        overall: 'completed',
        phase: 'done',
        testsCompleted: discoveryResult.phases.reduce((sum: number, p: any) => sum + p.results.length, 0),
        testsTotal: discoveryResult.phases.reduce((sum: number, p: any) => sum + p.results.length, 0),
        findings: discoveryResult.totalFindings.filter((f: any) => !!f).length,
        elapsed: duration
      });

      const result: WorkflowResult = {
        workflowId,
        status: 'completed',
        startTime,
        endTime,
        duration,
        phases: discoveryResult.phases,
        totalFindings: discoveryResult.totalFindings,
        criticalFindings: discoveryResult.totalFindings.filter((f: any) => f.severity === 'critical'),
        executiveSummary,
        owaspCoverage: discoveryResult.owaspCoverage,
        ccControlsCovered,
        auditReport,
        recommendations: this.generateRecommendations(discoveryResult, auditReport)
      };

      logger.info('Workflow completed successfully', {
        workflowId,
        duration: `${Math.round(duration / 1000)}s`,
        findings: result.totalFindings.length,
        criticalFindings: result.criticalFindings.length
      });

      return result;

    } catch (error) {
      logger.error('Workflow execution failed', { workflowId, error });
      
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      
      this.broadcastUpdate('status', workflowId, {
        overall: 'failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        workflowId,
        status: 'failed',
        startTime,
        endTime,
        duration,
        phases: [],
        totalFindings: [],
        criticalFindings: [],
        executiveSummary: 'Workflow failed to complete',
        owaspCoverage: {},
        ccControlsCovered: [],
        recommendations: ['Review error logs and retry assessment']
      };

    } finally {
      // Best-effort: finalize metrics artifact
      try {
        (this as any).metrics?.finalizeAndWrite(process.env.METRICS_OUT || '/out/run-metrics.json');
      } catch {}
      this.activeWorkflows.delete(workflowId);
    }
  }

  private async executeProgressiveDiscovery(context: any): Promise<any> {
    logger.info('Executing progressive discovery', {
      workflowId: context.workflowId,
      target: context.target
    });

    // Full progressive discovery with all phases
    return await this.progressiveDiscovery.executeFullDiscovery(context);
  }

  private async executeDynamicTestTree(context: any): Promise<any> {
    logger.info('Executing dynamic test tree', {
      workflowId: context.workflowId,
      target: context.target
    });

    // Build adaptive tree
    const rootNode = await this.testTree.buildAdaptiveTree(context);
    
    // Execute with adaptation
    const treeResult = await this.testTree.executeWithAdaptation(rootNode, context);
    
    // Convert to discovery format
    return {
      phases: [{
        phase: 'tree-execution',
        results: treeResult.results,
        proceedToNext: false,
        aiReasoning: 'Dynamic tree execution completed',
        duration: treeResult.duration,
        findingSummary: this.summarizeTreeFindings(treeResult.results)
      }],
      totalFindings: treeResult.results.flatMap(r => r.findings || []),
      executiveSummary: 'Dynamic test tree execution completed',
      owaspCoverage: this.calculateTreeOwaspCoverage(treeResult),
      duration: treeResult.duration
    };
  }

  private async handleApprovalRequest(data: any): Promise<void> {
    const approvalId = await this.approvalSystem.requestApproval({
      workflowId: data.workflowId,
      type: 'test-execution',
      context: {
        test: data.test,
        target: data.target,
        reason: data.reason,
        severity: 'medium'
      },
      callback: (approved, reason) => {
        logger.info('Approval callback received', {
          workflowId: data.workflowId,
          approved,
          reason
        });
      }
    });

    this.broadcastUpdate('approval', data.workflowId, {
      approvalId,
      type: 'test-execution',
      reason: data.reason,
      details: data.test,
      timeout: data.timeout,
      requestedAt: new Date()
    });
  }

  private broadcastUpdate(
    updateType: any,
    workflowId: string,
    data: any
  ): void {
    if (this.websocketManager) {
      const updateMap = {
        phase: 'sendPhaseUpdate',
        test: 'sendTestProgress',
        finding: 'sendFindingAlert',
        decision: 'sendAIDecision',
        approval: 'requestApproval',
        status: 'sendStatusUpdate'
      };

      const method = (updateMap as Record<string, keyof EnhancedWebSocketManager | undefined>)[String(updateType)];
      const ws: any = this.websocketManager as any;
      if (method && typeof ws[method] === 'function') {
        ws[method](workflowId, data);
      }
    }

    // Also emit local event
    this.emit(`workflow:${updateType}`, { workflowId, data });
  }

  private extractCCControls(findings: any[]): string[] {
    const controls = new Set<string>();
    
    for (const finding of findings) {
      if (finding.ccMapping) {
        finding.ccMapping.forEach((cc: string) => controls.add(cc));
      }
    }
    
    return Array.from(controls);
  }

  private generateRecommendations(discoveryResult: any, auditReport: any): string[] {
    const recommendations: string[] = [];
    
    // Based on findings
    if (discoveryResult.totalFindings.filter((f: any) => f.severity === 'critical').length > 0) {
      recommendations.push('Immediately address critical vulnerabilities identified in the assessment');
    }
    
    // Based on OWASP coverage
    const uncoveredOwasp = Object.entries(discoveryResult.owaspCoverage)
      .filter(([_, count]) => count === 0)
      .map(([category]) => category);
    
    if (uncoveredOwasp.length > 0) {
      recommendations.push(`Expand testing to cover OWASP categories: ${uncoveredOwasp.join(', ')}`);
    }
    
    // Based on audit report
    if (auditReport.recommendations) {
      recommendations.push(...auditReport.recommendations);
    }
    
    // General recommendations
    recommendations.push('Schedule regular security assessments to maintain security posture');
    recommendations.push('Implement continuous security monitoring for real-time threat detection');
    
    return [...new Set(recommendations)]; // Remove duplicates
  }

  private summarizeTreeFindings(results: any[]): any {
    const findings = results.flatMap(r => r.findings || []);
    const bySeverity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0
    };
    
    for (const finding of findings) {
      if (finding.severity && bySeverity[finding.severity] !== undefined) {
        bySeverity[finding.severity]++;
      }
    }
    
    return {
      total: findings.length,
      bySeverity,
      byCategory: {},
      criticalFindings: findings.filter(f => f.severity === 'critical')
    };
  }

  private calculateTreeOwaspCoverage(treeResult: any): Record<string, number> {
    const coverage: Record<string, number> = {};
    
    for (const [nodeId, node] of treeResult.tree) {
      if (node.owaspCategory) {
        coverage[node.owaspCategory] = (coverage[node.owaspCategory] || 0) + 1;
      }
    }
    
    return coverage;
  }

  public getActiveWorkflows(): string[] {
    return Array.from(this.activeWorkflows.keys());
  }

  public getWorkflowStatus(workflowId: string): any {
    return this.activeWorkflows.get(workflowId);
  }

  public async abortWorkflow(workflowId: string): Promise<void> {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }
    
    workflow.status = 'aborting';
    
    logger.info('Aborting workflow', { workflowId });
    
    // TODO: Implement actual abort logic for running tests
    
    this.activeWorkflows.delete(workflowId);
    
    this.broadcastUpdate('status', workflowId, {
      overall: 'aborted',
      message: 'Workflow aborted by user'
    });
  }
}