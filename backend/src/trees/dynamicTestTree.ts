import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { StrategicAIService, AttackStep, TestCondition } from '../services/strategicAIService.js';
import { createLogger } from '../utils/logger.js';
import { owaspKnowledgeBase } from '../knowledge/owaspKnowledgeBase.js';

const logger = createLogger('DynamicTestTree');

export interface TestNode {
  id: string;
  parentId?: string;
  testType: string;
  tool: string;
  parameters: Record<string, any>;
  dependencies: string[];
  conditions: TestCondition[];
  children: TestNode[];
  status: 'pending' | 'running' | 'completed' | 'skipped' | 'failed';
  results?: any;
  startTime?: Date;
  endTime?: Date;
  priority: 'critical' | 'high' | 'medium' | 'low';
  owaspCategory?: string;
  safetyChecks: string[];
  retryCount: number;
  maxRetries: number;
}

export interface TreeExecutionResult {
  workflowId: string;
  tree: Map<string, TestNode>;
  results: any[];
  executionPath: string[];
  skippedNodes: string[];
  failedNodes: string[];
  duration: number;
  aiDecisions: AIDecision[];
}

export interface AIDecision {
  nodeId: string;
  timestamp: Date;
  decision: 'execute' | 'skip' | 'add-children' | 'retry';
  reasoning: string;
  confidence: number;
  addedNodes?: TestNode[];
}

export interface TreeContext {
  workflowId: string;
  target: string;
  userIntent: string;
  constraints?: any;
  currentFindings: any[];
}

export class DynamicTestTree extends EventEmitter {
  private tree: Map<string, TestNode> = new Map();
  private aiService: StrategicAIService;
  private executionHistory: string[] = [];
  private aiDecisions: AIDecision[] = [];
  private toolExecutor: any; // Will be injected

  constructor(aiService: StrategicAIService) {
    super();
    this.aiService = aiService;
  }

  setToolExecutor(executor: any): void {
    this.toolExecutor = executor;
  }

  async buildAdaptiveTree(
    context: TreeContext
  ): Promise<TestNode> {
    logger.info('Building adaptive test tree', {
      workflowId: context.workflowId,
      target: context.target
    });

    // Get initial AI strategy
    const aiPlan = await this.aiService.planInitialStrategy({
      workflowId: context.workflowId,
      target: context.target,
      userIntent: context.userIntent,
      currentFindings: context.currentFindings || [],
      completedTests: [],
      availableTools: this.getAllAvailableTools(),
      phase: 'recon',
      constraints: context.constraints
    });

    // Create root node from first recommendation
    if (aiPlan.recommendations.length === 0) {
      throw new Error('AI provided no recommendations');
    }

    const firstRec = aiPlan.recommendations[0];
    const root: TestNode = {
      id: `${context.workflowId}-root`,
      testType: firstRec.purpose,
      tool: firstRec.tool,
      parameters: firstRec.parameters,
      dependencies: [],
      conditions: [],
      children: [],
      status: 'pending',
      priority: firstRec.priority,
      owaspCategory: firstRec.owaspCategory,
      safetyChecks: firstRec.safetyChecks || ['rate-limiting'],
      retryCount: 0,
      maxRetries: 2
    };

    this.tree.set(root.id, root);

    // Build initial branches based on expected outcomes
    for (const outcome of aiPlan.expectedOutcomes) {
      const branch = this.createConditionalBranch(root.id, outcome, context.workflowId);
      root.children.push(branch);
      this.tree.set(branch.id, branch);
    }

    // Add remaining recommendations as parallel branches
    for (let i = 1; i < aiPlan.recommendations.length && i < 3; i++) {
      const rec = aiPlan.recommendations[i];
      const parallelNode = this.createNodeFromRecommendation(rec, root.id, context.workflowId);
      root.children.push(parallelNode);
      this.tree.set(parallelNode.id, parallelNode);
    }

    this.emit('tree:built', {
      workflowId: context.workflowId,
      rootId: root.id,
      nodeCount: this.tree.size,
      depth: this.calculateTreeDepth(root)
    });

    logger.info('Adaptive tree built', {
      workflowId: context.workflowId,
      nodes: this.tree.size,
      expectedOutcomes: aiPlan.expectedOutcomes.length
    });

    return root;
  }

  async executeWithAdaptation(
    rootNode: TestNode,
    context: TreeContext
  ): Promise<TreeExecutionResult> {
    const startTime = Date.now();
    const queue: TestNode[] = [rootNode];
    const results: any[] = [];
    const skippedNodes: string[] = [];
    const failedNodes: string[] = [];

    logger.info('Starting adaptive tree execution', {
      workflowId: context.workflowId,
      rootId: rootNode.id
    });

    while (queue.length > 0) {
      const node = queue.shift()!;
      
      // Check if dependencies are met
      if (!this.areDependenciesMet(node)) {
        queue.push(node); // Re-queue for later
        continue;
      }

      // Get AI decision for this node
      const aiDecision = await this.getAIDecision(node, context, results);
      this.aiDecisions.push(aiDecision);

      this.emit('node:decision', {
        workflowId: context.workflowId,
        nodeId: node.id,
        decision: aiDecision.decision,
        reasoning: aiDecision.reasoning
      });

      switch (aiDecision.decision) {
        case 'skip':
          node.status = 'skipped';
          skippedNodes.push(node.id);
          logger.info('Skipping node based on AI decision', {
            nodeId: node.id,
            reason: aiDecision.reasoning
          });
          continue;

        case 'execute':
          // Execute the test
          const result = await this.executeNode(node, context);
          results.push(result);
          this.executionHistory.push(node.id);

          if (result.status === 'failed') {
            failedNodes.push(node.id);
            
            // Check if we should retry
            if (node.retryCount < node.maxRetries) {
              node.retryCount++;
              node.status = 'pending';
              queue.unshift(node); // Add back to front of queue for immediate retry
              logger.info('Retrying failed test', {
                nodeId: node.id,
                attempt: node.retryCount + 1,
                maxRetries: node.maxRetries
              });
              continue;
            }
          }

          // Process findings and potentially add new nodes
          if (result.findings && result.findings.length > 0) {
            await this.processFindingsAndAdapt(node, result.findings, context);
          }

          break;

        case 'add-children':
          // AI decided to add new test branches
          if (aiDecision.addedNodes) {
            for (const newNode of aiDecision.addedNodes) {
              node.children.push(newNode);
              this.tree.set(newNode.id, newNode);
            }
            logger.info('Added new test nodes based on AI decision', {
              parentId: node.id,
              newNodes: aiDecision.addedNodes.length
            });
          }
          break;
      }

      // Add children to queue if conditions are met
      for (const child of node.children) {
        if (this.areConditionsMet(child, results)) {
          queue.push(child);
        } else {
          logger.debug('Child node conditions not met', {
            childId: child.id,
            conditions: child.conditions
          });
        }
      }
    }

    const duration = Date.now() - startTime;

    const executionResult: TreeExecutionResult = {
      workflowId: context.workflowId,
      tree: this.tree,
      results,
      executionPath: this.executionHistory,
      skippedNodes,
      failedNodes,
      duration,
      aiDecisions: this.aiDecisions
    };

    logger.info('Tree execution complete', {
      workflowId: context.workflowId,
      executed: results.length,
      skipped: skippedNodes.length,
      failed: failedNodes.length,
      duration: `${Math.round(duration / 1000)}s`
    });

    return executionResult;
  }

  private async executeNode(node: TestNode, context: TreeContext): Promise<any> {
    node.status = 'running';
    node.startTime = new Date();

    this.emit('node:start', {
      workflowId: context.workflowId,
      nodeId: node.id,
      tool: node.tool,
      testType: node.testType
    });

    try {
      if (!this.toolExecutor) {
        throw new Error('Tool executor not set');
      }

      // Apply safety checks
      const safeParams = this.applySafetyParameters(node.parameters, node.safetyChecks);

      // Execute the tool
      const result = await this.toolExecutor.execute({
        tool: node.tool,
        parameters: safeParams,
        workflowId: context.workflowId,
        timeout: owaspKnowledgeBase.safetyThresholds.maxTestDuration
      });

      node.status = 'completed';
      node.endTime = new Date();
      node.results = result;

      this.emit('node:complete', {
        workflowId: context.workflowId,
        nodeId: node.id,
        status: 'success',
        findings: result.findings?.length || 0
      });

      return {
        nodeId: node.id,
        tool: node.tool,
        status: 'success',
        findings: result.findings || [],
        output: result.output,
        duration: node.endTime.getTime() - node.startTime.getTime()
      };

    } catch (error) {
      node.status = 'failed';
      node.endTime = new Date();

      logger.error('Node execution failed', {
        workflowId: context.workflowId,
        nodeId: node.id,
        tool: node.tool,
        error
      });

      this.emit('node:failed', {
        workflowId: context.workflowId,
        nodeId: node.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        nodeId: node.id,
        tool: node.tool,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: node.endTime.getTime() - node.startTime!.getTime()
      };
    }
  }

  private async getAIDecision(
    node: TestNode,
    context: TreeContext,
    currentResults: any[]
  ): Promise<AIDecision> {
    // Ask AI whether to execute, skip, or modify this node
    const prompt = `
Given the current test tree node and context, decide the best action:

Node: ${JSON.stringify({
  id: node.id,
  tool: node.tool,
  testType: node.testType,
  priority: node.priority,
  dependencies: node.dependencies,
  conditions: node.conditions
}, null, 2)}

Context:
- Target: ${context.target}
- Intent: ${context.userIntent}
- Findings so far: ${currentResults.length} tests completed
- Current findings summary: ${this.summarizeFindings(currentResults)}

Should we:
1. 'execute' - Run this test
2. 'skip' - Skip this test (provide reasoning)
3. 'add-children' - Add follow-up tests based on current state

Respond with JSON: { "decision": "execute|skip|add-children", "reasoning": "explanation", "confidence": 0.0-1.0 }`;

    try {
      const response = await this.aiService.analyzeVulnerability(
        { type: 'decision', node, context, currentResults },
        { ...context, phase: 'execution' } as any
      );

      // Parse AI response (in real implementation, this would be more sophisticated)
      const decision: AIDecision['decision'] = 'execute'; // Default
      const reasoning = response.explanation || 'Proceeding with test execution';
      const confidence = 0.8;

      return {
        nodeId: node.id,
        timestamp: new Date(),
        decision,
        reasoning,
        confidence
      };
    } catch (error) {
      logger.error('Failed to get AI decision', { error, nodeId: node.id });
      
      // Fallback decision
      return {
        nodeId: node.id,
        timestamp: new Date(),
        decision: 'execute',
        reasoning: 'Fallback decision due to AI error',
        confidence: 0.5
      };
    }
  }

  private async processFindingsAndAdapt(
    node: TestNode,
    findings: any[],
    context: TreeContext
  ): Promise<void> {
    if (findings.length === 0) return;

    logger.info('Processing findings for adaptation', {
      nodeId: node.id,
      findingsCount: findings.length
    });

    try {
      // Get AI analysis of findings
      const adaptedStrategy = await this.aiService.adaptStrategy(
        {
          workflowId: context.workflowId,
          target: context.target,
          userIntent: context.userIntent,
          currentFindings: [...context.currentFindings, ...findings],
          completedTests: this.executionHistory,
          availableTools: this.getAllAvailableTools(),
          phase: 'exploit',
          constraints: context.constraints
        },
        findings
      );

      // Add new test nodes based on AI recommendations
      let addedCount = 0;
      for (const recommendation of adaptedStrategy.recommendations) {
        // Only add high-priority follow-up tests
        if (recommendation.priority === 'critical' || recommendation.priority === 'high') {
          const newNode = this.createNodeFromRecommendation(
            recommendation,
            node.id,
            context.workflowId
          );
          
          // Set condition to only run if parent found something
          newNode.conditions = [{
            type: 'finding_exists',
            field: 'parentNode',
            value: node.id,
            operator: 'equals'
          }];
          
          node.children.push(newNode);
          this.tree.set(newNode.id, newNode);
          addedCount++;

          if (addedCount >= 3) break; // Limit new nodes per finding
        }
      }

      if (addedCount > 0) {
        logger.info('Added adaptive test nodes', {
          parentId: node.id,
          addedNodes: addedCount,
          reason: adaptedStrategy.reasoning.substring(0, 100) + '...'
        });

        this.emit('tree:adapted', {
          workflowId: context.workflowId,
          parentId: node.id,
          addedNodes: addedCount,
          reasoning: adaptedStrategy.reasoning
        });
      }
    } catch (error) {
      logger.error('Failed to adapt tree based on findings', { error, nodeId: node.id });
    }
  }

  private createConditionalBranch(
    parentId: string,
    outcome: any,
    workflowId: string
  ): TestNode {
    const nodeId = `${workflowId}-${outcome.recommendedTool}-${Date.now()}`;
    
    return {
      id: nodeId,
      parentId,
      testType: outcome.testType,
      tool: outcome.recommendedTool,
      parameters: outcome.parameters || {},
      dependencies: [parentId],
      conditions: [{
        type: 'finding_matches',
        field: outcome.conditionField,
        value: outcome.conditionValue,
        operator: outcome.operator || 'contains'
      }],
      children: [],
      status: 'pending',
      priority: 'medium',
      safetyChecks: ['rate-limiting'],
      retryCount: 0,
      maxRetries: 1
    };
  }

  private createNodeFromRecommendation(
    rec: AttackStep,
    parentId: string,
    workflowId: string
  ): TestNode {
    return {
      id: `${workflowId}-${rec.tool}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      parentId,
      testType: rec.purpose,
      tool: rec.tool,
      parameters: rec.parameters,
      dependencies: rec.dependsOn || [parentId],
      conditions: rec.conditions || [],
      children: [],
      status: 'pending',
      priority: rec.priority,
      owaspCategory: rec.owaspCategory,
      safetyChecks: rec.safetyChecks,
      retryCount: 0,
      maxRetries: rec.priority === 'critical' ? 3 : 1
    };
  }

  private areDependenciesMet(node: TestNode): boolean {
    for (const depId of node.dependencies) {
      const depNode = this.tree.get(depId);
      if (!depNode || depNode.status !== 'completed') {
        return false;
      }
    }
    return true;
  }

  private areConditionsMet(node: TestNode, results: any[]): boolean {
    if (!node.conditions || node.conditions.length === 0) {
      return true;
    }

    for (const condition of node.conditions) {
      if (!this.evaluateCondition(condition, results)) {
        return false;
      }
    }
    return true;
  }

  private evaluateCondition(condition: TestCondition, results: any[]): boolean {
    switch (condition.type) {
      case 'finding_exists':
        return results.some(r => 
          r.findings && r.findings.length > 0
        );

      case 'finding_matches':
        return results.some(r => 
          r.findings?.some((f: any) => {
            const fieldValue = f[condition.field!];
            switch (condition.operator) {
              case 'equals':
                return fieldValue === condition.value;
              case 'contains':
                return String(fieldValue).includes(String(condition.value));
              case 'greater_than':
                return Number(fieldValue) > Number(condition.value);
              default:
                return false;
            }
          })
        );

      case 'no_findings':
        const parentResult = results.find(r => r.nodeId === condition.value);
        return !parentResult || !parentResult.findings || parentResult.findings.length === 0;

      default:
        return true;
    }
  }

  private applySafetyParameters(
    params: Record<string, any>,
    safetyChecks: string[]
  ): Record<string, any> {
    const safe = { ...params };

    for (const check of safetyChecks) {
      switch (check) {
        case 'rate-limiting':
          safe.rateLimit = owaspKnowledgeBase.safetyThresholds.maxRequestsPerMinute;
          safe.delayMs = 1000; // 1 second between requests
          break;
        case 'non-intrusive':
          safe.intrusiveLevel = 0;
          safe.passiveOnly = true;
          break;
        case 'test-account':
          safe.useTestCredentials = true;
          break;
        case 'read-only':
          safe.readOnly = true;
          safe.allowWrites = false;
          break;
      }
    }

    return safe;
  }

  private calculateTreeDepth(node: TestNode, depth: number = 0): number {
    if (node.children.length === 0) {
      return depth;
    }
    
    return Math.max(...node.children.map(child => 
      this.calculateTreeDepth(child, depth + 1)
    ));
  }

  private getAllAvailableTools(): string[] {
    return Object.keys(owaspKnowledgeBase.toolMapping);
  }

  private summarizeFindings(results: any[]): string {
    const summary = {
      total: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      types: new Set<string>()
    };

    for (const result of results) {
      if (result.findings) {
        for (const finding of result.findings) {
          summary.total++;
          if (finding.severity && summary.bySeverity[finding.severity] !== undefined) {
            summary.bySeverity[finding.severity]++;
          }
          if (finding.type) {
            summary.types.add(finding.type);
          }
        }
      }
    }

    return `${summary.total} findings (Critical: ${summary.bySeverity.critical}, High: ${summary.bySeverity.high}, Types: ${Array.from(summary.types).join(', ')})`;
  }

  public exportTree(): any {
    const nodes: any[] = [];
    const edges: any[] = [];

    for (const [id, node] of this.tree) {
      nodes.push({
        id,
        label: `${node.tool}\n${node.testType}`,
        status: node.status,
        priority: node.priority
      });

      for (const child of node.children) {
        edges.push({
          from: id,
          to: child.id,
          label: this.getEdgeLabel(node, child)
        });
      }
    }

    return { nodes, edges };
  }

  private getEdgeLabel(parent: TestNode, child: TestNode): string {
    if (child.conditions.length > 0) {
      const condition = child.conditions[0];
      return `If ${condition.type}`;
    }
    return '';
  }

  public getTree(): Map<string, TestNode> {
    return this.tree;
  }

  public getExecutionHistory(): string[] {
    return this.executionHistory;
  }

  public getAIDecisions(): AIDecision[] {
    return this.aiDecisions;
  }
}