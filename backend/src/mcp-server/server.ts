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

// Import AI layers as per blueprint
import { EmbeddingService } from '../services/embeddingService.js';
import { IntentClassifier } from '../layers/intentClassification.js';
import { ContextEnrichment } from '../layers/contextEnrichment.js';
import { TrustClassifier } from '../layers/trustClassifier.js';
import { HITLReview } from '../layers/hitlReview.js';

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
  private embeddingService: EmbeddingService;
  private intentClassifier: IntentClassifier;
  private contextEnrichment: ContextEnrichment;
  private trustClassifier: TrustClassifier;
  private hitlReview: HITLReview;

  constructor() {
    super();
    this.toolHandler = new ToolHandler();
    this.semaphore = new Semaphore(Number(process.env.MAX_CONCURRENT) || 2); // Reduced for realistic timing
    this.activeWorkflows = new Map();
    
    // Initialize AI layers as per blueprint
    this.embeddingService = new EmbeddingService();
    this.intentClassifier = new IntentClassifier(this.embeddingService);
    this.contextEnrichment = new ContextEnrichment(this.embeddingService);
    this.trustClassifier = new TrustClassifier();
    this.hitlReview = new HITLReview();
  }

  /**
   * Initialize the MCP server
   */
  async initialize(): Promise<void> {
    logger.info('Initializing MCP server');
    
    // Initialize all layers as per blueprint
    await Promise.all([
      this.toolHandler.initialize(),
      this.embeddingService.initialize(),
      this.intentClassifier.initialize?.() || Promise.resolve(),
      this.contextEnrichment.initialize(),
      this.trustClassifier.initialize(),
      this.hitlReview.initialize()
    ]);
    
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
      const aggregatedResults = this.aggregateResults(workflowId, testResults, context);
      
      const duration = Date.now() - startTime;
      logWorkflowEnd(workflowId, duration, 'success', aggregatedResults);

      // Emit workflow completed event
      this.emit('workflow:completed', {
        workflowId,
        status: 'completed',
        duration,
        results: aggregatedResults
      });

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
    
    // Emit detailed attack start event
    this.emit('workflow:attack:start', {
      workflowId,
      attackId,
      tool: toolName,
      params,
      timestamp: new Date().toISOString()
    });

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
      
      // Emit detailed attack complete event
      this.emit('workflow:attack:complete', {
        workflowId,
        attackId,
        tool: toolName,
        status: result.status,
        findings: result.findings,
        rawOutput: result.rawOutput,
        duration: result.duration,
        timestamp: new Date().toISOString()
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
   * Intent classification using AI embeddings
   */
  private async classifyIntent(context: MCPContext): Promise<ClassificationResult> {
    logger.info('Classifying intent with AI', { 
      target: context.target, 
      description: context.description 
    });
    
    // Use the actual AI intent classifier
    try {
      const classificationResult = await this.intentClassifier.classify(
        context.description || `Security test for ${context.target}`,
        context.workflowId
      );
    
    // Map the IntentClassificationResult to our ClassificationResult format
    const intent: Intent = {
      id: uuidv4(),
      type: 'security',
      rawInput: context.description || context.target,
      matchedAttacks: classificationResult.matchedAttacks
        .filter(match => match.relevance !== 'low') // Only include medium/high relevance
        .map(match => ({
          attackId: match.attack.id,
          attackName: match.attack.name,
          description: match.attack.description,
          similarity: match.similarity,
          tsc: match.attack.tsc,
          cc: match.attack.cc,
          tools: [{
            name: match.attack.id,
            command: match.attack.command || [],
            priority: match.relevance === 'high' ? 'critical' : 'standard',
            estimatedDuration: match.attack.timeout || 180000,
            resourceRequirements: {}
          }],
          requiresAuth: match.attack.requiresAuth || false,
          progressive: match.attack.progressive || false,
          evidenceRequired: match.attack.evidenceRequired || []
        })),
      confidence: classificationResult.confidence,
      timestamp: new Date()
    };
    
    // Use trust classifier to determine methodology
    const trustResult = await this.trustClassifier.classify({
      target: context.target,
      input: context.description || '',
      attacks: intent.matchedAttacks
    });

    return {
      intent,
      suggestedMethodology: trustResult.methodology,
      estimatedDuration: intent.matchedAttacks.reduce((sum, a) => sum + a.tools[0].estimatedDuration, 0),
      requiresHITL: trustResult.requiresHITL || classificationResult.matchedAttacks.some(m => m.attack.requiresAuth)
    };
    } catch (error) {
      logger.error('Failed to classify intent', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        workflowId: context.workflowId
      });
      
      // Send error update to frontend
      this.emit('workflow:error', {
        workflowId: context.workflowId,
        error: error instanceof Error ? error.message : 'Failed to classify intent',
        phase: 'classification'
      });
      
      throw error;
    }
  }

  /**
   * Mock context enrichment (will be replaced by actual implementation)
   */
  private async enrichContext(
    classification: ClassificationResult,
    context: MCPContext
  ): Promise<ViableAttacks> {
    logger.info('Enriching context with AI', { 
      workflowId: context.workflowId,
      attackCount: classification.intent.matchedAttacks.length 
    });
    
    // Use the actual AI context enrichment layer
    const enrichmentResult = await this.contextEnrichment.enrich({
      workflowId: context.workflowId,
      target: context.target,
      scope: context.scope || 'comprehensive',
      intent: classification.intent,
      methodology: classification.suggestedMethodology,
      auth: context.auth
    });
    
    // Check for HITL requirements
    if (enrichmentResult.requiresHITL) {
      const hitlDecision = await this.hitlReview.requestApproval({
        workflowId: enrichmentResult.workflowId,
        criticalAttacks: enrichmentResult.critical,
        reasons: enrichmentResult.hitlReasons || []
      });
      
      if (!hitlDecision.approved) {
        logger.warn('HITL review rejected workflow', { workflowId: context.workflowId });
        throw new Error('Workflow rejected by HITL review');
      }
      
      // Apply any modifications from HITL review
      if (hitlDecision.modifications) {
        enrichmentResult.critical = hitlDecision.modifications.critical || enrichmentResult.critical;
        enrichmentResult.standard = hitlDecision.modifications.standard || enrichmentResult.standard;
      }
    }
    
    return enrichmentResult;
  }

  /**
   * Create execution plan from viable attacks
   */
  private createExecutionPlan(viableAttacks: ViableAttacks): AttackExecutionPlan {
    logger.info('Creating execution plan', {
      critical: viableAttacks.critical.length,
      standard: viableAttacks.standard.length,
      lowPriority: viableAttacks.lowPriority.length,
      requiresAuth: viableAttacks.requiresAuth.length
    });
    
    const phases = [];
    
    // Phase 1: Non-auth attacks
    const nonAuthAttacks = [
      ...viableAttacks.critical.filter(a => !a.requiresAuth),
      ...viableAttacks.standard.filter(a => !a.requiresAuth)
    ];
    
    logger.info('Non-auth attacks for phase 1', {
      count: nonAuthAttacks.length,
      attacks: nonAuthAttacks.map(a => ({ id: a.attackId, name: a.attackName }))
    });
    
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
    logger.info('Starting attack execution', {
      workflowId,
      totalPhases: plan.executionOrder.length,
      totalAttacks: plan.executionOrder.reduce((sum, p) => sum + p.attacks.length, 0)
    });
    
    const results: TestResult[] = [];

    for (const phase of plan.executionOrder) {
      if (signal.aborted) {
        logger.warn('Execution aborted', { workflowId, phase: phase.phase });
        break;
      }

      logger.info('Starting phase execution', {
        workflowId,
        phase: phase.phase,
        attackCount: phase.attacks.length,
        attacks: phase.attacks
      });

      this.emit('workflow:phase:start', { workflowId, phase: phase.phase });

      const phaseResults = await Promise.all(
        phase.attacks.map(async (attackId) => {
          const attack = [
            ...plan.viableAttacks.critical,
            ...plan.viableAttacks.standard,
            ...plan.viableAttacks.lowPriority
          ].find(a => a.attackId === attackId);
          
          logger.info('Executing attack', {
            workflowId,
            attackId,
            attackName: attack?.attackName,
            found: !!attack
          });

          if (!attack || signal.aborted) {
            return null;
          }

          return this.semaphore.withLock(async () => {
            if (signal.aborted) return null;

            // Map attack IDs to available tools
            const toolMapping: Record<string, string> = {
              // Original mappings
              'ssrf': 'api-security-scan',
              'csrf': 'xss-detection',
              'security-misconfig': 'ssl-tls-analysis',
              'auth-failures': 'authentication-brute-force',
              'sql-injection': 'blind-sql-injection',
              'xss': 'xss-detection',
              
              // Added missing mappings for comprehensive testing
              'broken-access-control': 'api-security-scan',
              'crypto-failures': 'ssl-tls-analysis',
              'blind-sql-injection': 'blind-sql-injection',
              'xpath-injection': 'blind-sql-injection',
              'insecure-design': 'api-security-scan',
              'vulnerable-components': 'dependency-check',
              'integrity-failures': 'api-security-scan',
              'logging-failures': 'api-security-scan',
              'clickjacking': 'xss-detection',
              'parameter-tampering': 'api-security-scan',
              'cors-misconfig': 'api-security-scan',
              'port-scanning': 'nmap',
              'ip-spoofing': 'api-security-scan',
              
              // Enumeration and discovery
              'subdomain-enumeration': 'subdomain-scanner',
              'directory-traversal': 'directory-scanner',
              'api-discovery': 'api-security-scan',
              'jwt-testing': 'jwt-scanner'
            };
            
            const toolName = toolMapping[attack.attackId] || attack.attackId;
            const tool = tools.find(t => t.name === toolName);
            if (!tool) {
              logger.warn('No tool found for attack', { attackId: attack.attackId, toolName });
              return null;
            }

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
   * Aggregate test results and categorize findings post-hoc
   */
  private aggregateResults(workflowId: string, testResults: TestResult[], context?: MCPContext): AggregatedResults {
    const findingsBySeverity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0
    };

    // Post-processing categorization of findings
    const findingsByCategory: Record<string, TestResult[]> = {
      security: [],
      availability: [],
      authentication: [],
      authorization: [],
      'data-integrity': [],
      comprehensive: []
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

      // Categorize test results based on the tool's TSC (Trust Service Criteria)
      const tool = tools.find(t => t.name === result.tool);
      if (tool && tool.tsc) {
        tool.tsc.forEach(category => {
          const categoryKey = category.toLowerCase().replace(' ', '-');
          if (findingsByCategory[categoryKey]) {
            findingsByCategory[categoryKey].push(result);
          }
        });
      }
    });

    // Calculate overall score (100 - weighted severity sum)
    const severityWeights = { critical: 30, high: 20, medium: 10, low: 5, info: 1 };
    const weightedSum = Object.entries(findingsBySeverity).reduce(
      (sum, [severity, count]) => sum + (severityWeights[severity as keyof typeof severityWeights] || 0) * count,
      0
    );
    const overallScore = Math.max(0, 100 - Math.min(weightedSum, 100));

    // Filter results by scope if provided
    let filteredResults = testResults;
    if (context?.scope && context.scope !== 'comprehensive') {
      filteredResults = findingsByCategory[context.scope] || testResults;
    }

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
      testResults: filteredResults,
      // Include categorization metadata
      categorizedFindings: findingsByCategory
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