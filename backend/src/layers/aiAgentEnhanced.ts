import { EventEmitter } from 'events';
import { StrategicAIService } from '../services/strategicAIService.js';
import { AIDecisionLogger } from '../audit/aiDecisionLogger.js';
import { createLogger } from '../utils/logger.js';
import { owaspKnowledgeBase } from '../knowledge/owaspKnowledgeBase.js';

const logger = createLogger('AIAgentEnhanced');

export interface AIAgentContext {
  workflowId: string;
  userInput: string;
  embedding?: number[];
  currentPhase?: string;
  previousFindings?: any[];
  constraints?: any;
}

export interface AIAgentResponse {
  strategy: string;
  confidence: number;
  reasoning: string;
  viableAttacks: ViableAttack[];
  nextPhase?: string;
  requiresApproval?: boolean;
  safetyConsiderations?: string[];
}

export interface ViableAttack {
  id: string;
  name: string;
  tool: string;
  description: string;
  confidence: number;
  parameters: Record<string, any>;
  owaspCategory?: string;
  ccControls?: string[];
  requiresAuth?: boolean;
  safetyLevel: 'low' | 'medium' | 'high';
  priority: number;
  conditions?: any[];
}

export class AIAgentEnhanced extends EventEmitter {
  private strategicAI: StrategicAIService;
  private decisionLogger: AIDecisionLogger;
  private conversationHistory: Map<string, any[]> = new Map();

  constructor(decisionLogger: AIDecisionLogger) {
    super();
    this.strategicAI = new StrategicAIService();
    this.decisionLogger = decisionLogger;
    
    logger.info('Enhanced AI Agent initialized with Strategic AI Service');
  }

  async processUserIntent(context: AIAgentContext): Promise<AIAgentResponse> {
    const startTime = Date.now();
    
    logger.info('Processing user intent with AI', {
      workflowId: context.workflowId,
      phase: context.currentPhase || 'initial',
      hasEmbedding: !!context.embedding
    });

    try {
      // Get strategic plan from Anthropic
      const aiStrategy = await this.strategicAI.planInitialStrategy({
        workflowId: context.workflowId,
        target: this.extractTarget(context.userInput),
        userIntent: context.userInput,
        currentFindings: context.previousFindings || [],
        completedTests: [],
        availableTools: Object.keys(owaspKnowledgeBase.toolMapping),
        phase: (context.currentPhase as any) || 'recon',
        constraints: context.constraints
      });

      // Convert AI recommendations to viable attacks
      const viableAttacks = this.convertToViableAttacks(aiStrategy.recommendations);

      // Determine if approval is needed
      const requiresApproval = this.checkApprovalRequirements(viableAttacks, context);

      // Log the AI decision
      await this.decisionLogger.logDecision({
        workflowId: context.workflowId,
        decisionType: 'strategy',
        input: {
          context: context,
          prompt: context.userInput
        },
        output: {
          decision: aiStrategy,
          reasoning: aiStrategy.reasoning,
          confidence: aiStrategy.confidenceLevel
        },
        metadata: {
          model: 'anthropic-claude',
          phase: context.currentPhase || 'initial',
          latency: Date.now() - startTime
        },
        auditFlags: {
          manualReview: aiStrategy.confidenceLevel < 0.6,
          securityCritical: requiresApproval
        }
      });

      const response: AIAgentResponse = {
        strategy: aiStrategy.reasoning,
        confidence: aiStrategy.confidenceLevel,
        reasoning: aiStrategy.reasoning,
        viableAttacks,
        nextPhase: this.determineNextPhase(context.currentPhase, aiStrategy),
        requiresApproval,
        safetyConsiderations: aiStrategy.safetyConsiderations
      };

      // Store in conversation history
      this.updateConversationHistory(context.workflowId, {
        input: context,
        output: response,
        timestamp: new Date()
      });

      logger.info('AI strategy generated', {
        workflowId: context.workflowId,
        confidence: response.confidence,
        attackCount: response.viableAttacks.length,
        requiresApproval
      });

      this.emit('strategy:generated', {
        workflowId: context.workflowId,
        response
      });

      return response;

    } catch (error) {
      logger.error('Failed to process user intent', {
        workflowId: context.workflowId,
        error
      });

      // Fallback response
      return this.generateFallbackResponse(context);
    }
  }

  async refineStrategy(
    context: AIAgentContext,
    findings: any[]
  ): Promise<AIAgentResponse> {
    logger.info('Refining strategy based on findings', {
      workflowId: context.workflowId,
      findingsCount: findings.length
    });

    try {
      // Get adapted strategy from AI
      const adaptedStrategy = await this.strategicAI.adaptStrategy(
        {
          workflowId: context.workflowId,
          target: this.extractTarget(context.userInput),
          userIntent: context.userInput,
          currentFindings: [...(context.previousFindings || []), ...findings],
          completedTests: this.getCompletedTests(context.workflowId),
          availableTools: Object.keys(owaspKnowledgeBase.toolMapping),
          phase: (context.currentPhase as any) || 'analyze',
          constraints: context.constraints
        },
        findings
      );

      const viableAttacks = this.convertToViableAttacks(adaptedStrategy.recommendations);

      const response: AIAgentResponse = {
        strategy: adaptedStrategy.reasoning,
        confidence: adaptedStrategy.confidenceLevel,
        reasoning: adaptedStrategy.reasoning,
        viableAttacks,
        nextPhase: this.determineNextPhase(context.currentPhase, adaptedStrategy),
        requiresApproval: false,
        safetyConsiderations: adaptedStrategy.safetyConsiderations
      };

      logger.info('Strategy refined', {
        workflowId: context.workflowId,
        newAttacks: response.viableAttacks.length,
        confidence: response.confidence
      });

      return response;

    } catch (error) {
      logger.error('Failed to refine strategy', { error });
      return this.generateFallbackResponse(context);
    }
  }

  async analyzeFindings(
    workflowId: string,
    findings: any[]
  ): Promise<any[]> {
    const analyses = [];
    
    for (const finding of findings) {
      try {
        const analysis = await this.strategicAI.analyzeVulnerability(
          finding,
          {
            workflowId,
            target: finding.target || 'unknown',
            userIntent: 'Analyze vulnerability',
            currentFindings: findings,
            completedTests: [],
            availableTools: [],
            phase: 'analyze',
            constraints: {}
          }
        );
        
        analyses.push({
          ...finding,
          analysis: {
            severity: analysis.severity,
            exploitable: analysis.exploitable,
            explanation: analysis.explanation,
            nextSteps: analysis.nextSteps,
            businessImpact: analysis.businessImpact,
            owaspMapping: analysis.owaspMapping,
            remediation: analysis.remediationAdvice
          }
        });
        
      } catch (error) {
        logger.error('Failed to analyze finding', { error, finding });
        analyses.push(finding);
      }
    }
    
    return analyses;
  }

  private convertToViableAttacks(recommendations: any[]): ViableAttack[] {
    return recommendations.map((rec, index) => {
      const toolInfo = owaspKnowledgeBase.toolMapping[rec.tool] || {};
      
      return {
        id: rec.id,
        name: rec.purpose,
        tool: rec.tool,
        description: rec.expectedOutcome,
        confidence: 0.8,
        parameters: rec.parameters,
        owaspCategory: rec.owaspCategory || toolInfo.owaspCategories?.[0],
        ccControls: toolInfo.ccControls,
        requiresAuth: toolInfo.requiresAuth || false,
        safetyLevel: toolInfo.safetyLevel || 'medium',
        priority: this.calculatePriority(rec.priority, index),
        conditions: rec.conditions
      };
    });
  }

  private calculatePriority(priority: string, index: number): number {
    const priorityMap = {
      'critical': 100,
      'high': 80,
      'medium': 50,
      'low': 20
    };
    
    return priorityMap[priority] || 50 - index;
  }

  private extractTarget(userInput: string): string {
    // Extract domain/target from user input
    const domainMatch = userInput.match(/(?:test |scan |assess |against |target |on )([\w.-]+\.[a-z]{2,})/i);
    if (domainMatch) {
      return domainMatch[1];
    }
    
    // Try to find any domain pattern
    const anyDomain = userInput.match(/([\w.-]+\.[a-z]{2,})/i);
    return anyDomain ? anyDomain[1] : 'unknown';
  }

  private checkApprovalRequirements(
    attacks: ViableAttack[],
    context: AIAgentContext
  ): boolean {
    // Check if any attack requires approval
    const hasHighRiskAttack = attacks.some(a => 
      a.safetyLevel === 'high' || 
      a.requiresAuth ||
      a.tool.includes('exploit')
    );
    
    // Check environment constraints
    const isProduction = context.constraints?.environment === 'production';
    
    return hasHighRiskAttack || isProduction;
  }

  private determineNextPhase(
    currentPhase: string | undefined,
    strategy: any
  ): string {
    if (strategy.nextPhaseConditions?.length > 0) {
      // AI suggested next phase
      if (strategy.phase === 'recon' && strategy.expectedOutcomes.length > 0) {
        return 'analyze';
      } else if (strategy.phase === 'analyze' && strategy.confidenceLevel > 0.7) {
        return 'exploit';
      }
    }
    
    // Default progression
    const phaseProgression = {
      'initial': 'recon',
      'recon': 'analyze',
      'analyze': 'exploit',
      'exploit': 'complete'
    };
    
    return phaseProgression[currentPhase || 'initial'] || 'complete';
  }

  private generateFallbackResponse(context: AIAgentContext): AIAgentResponse {
    logger.warn('Using fallback AI response', {
      workflowId: context.workflowId
    });
    
    // Basic pattern matching for intent
    const userInput = context.userInput.toLowerCase();
    const viableAttacks: ViableAttack[] = [];
    
    if (userInput.includes('sql injection')) {
      viableAttacks.push(this.createBasicAttack('sql-injection', 'SQL Injection Test'));
    }
    
    if (userInput.includes('subdomain')) {
      viableAttacks.push(this.createBasicAttack('subdomain-scanner', 'Subdomain Enumeration'));
    }
    
    if (userInput.includes('jwt') || userInput.includes('token')) {
      viableAttacks.push(this.createBasicAttack('jwt-analyzer', 'JWT Security Analysis'));
    }
    
    if (userInput.includes('api')) {
      viableAttacks.push(this.createBasicAttack('api-fuzzer', 'API Security Testing'));
    }
    
    // Default: start with reconnaissance
    if (viableAttacks.length === 0) {
      viableAttacks.push(
        this.createBasicAttack('subdomain-scanner', 'Subdomain Discovery'),
        this.createBasicAttack('port-scanner', 'Port Scanning'),
        this.createBasicAttack('directory-scanner', 'Directory Enumeration')
      );
    }
    
    return {
      strategy: 'Fallback strategy based on keyword matching',
      confidence: 0.5,
      reasoning: 'AI service unavailable, using pattern-based approach',
      viableAttacks,
      requiresApproval: false,
      safetyConsiderations: ['Rate limiting applied', 'Non-destructive tests only']
    };
  }

  private createBasicAttack(tool: string, name: string): ViableAttack {
    const toolInfo = owaspKnowledgeBase.toolMapping[tool] || {};
    
    return {
      id: `${tool}-${Date.now()}`,
      name,
      tool,
      description: toolInfo.description || `Execute ${name}`,
      confidence: 0.6,
      parameters: { target: 'TBD' },
      owaspCategory: toolInfo.owaspCategories?.[0],
      ccControls: toolInfo.ccControls,
      requiresAuth: toolInfo.requiresAuth || false,
      safetyLevel: toolInfo.safetyLevel || 'medium',
      priority: 50,
      conditions: []
    };
  }

  private updateConversationHistory(workflowId: string, entry: any): void {
    const history = this.conversationHistory.get(workflowId) || [];
    history.push(entry);
    
    // Keep last 20 entries
    if (history.length > 20) {
      history.shift();
    }
    
    this.conversationHistory.set(workflowId, history);
  }

  private getCompletedTests(workflowId: string): string[] {
    const history = this.conversationHistory.get(workflowId) || [];
    const tests: string[] = [];
    
    for (const entry of history) {
      if (entry.output?.viableAttacks) {
        tests.push(...entry.output.viableAttacks.map((a: any) => a.tool));
      }
    }
    
    return [...new Set(tests)];
  }

  public getConversationHistory(workflowId: string): any[] {
    return this.conversationHistory.get(workflowId) || [];
  }

  public clearHistory(workflowId: string): void {
    this.conversationHistory.delete(workflowId);
  }
}