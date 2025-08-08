import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { StrategicAIService, AttackStrategy, AttackStep } from '../services/strategicAIService.js';
import { createLogger } from '../utils/logger.js';
import { owaspKnowledgeBase } from '../knowledge/owaspKnowledgeBase.js';

const logger = createLogger('ProgressiveDiscovery');

export interface Phase {
  name: 'recon' | 'analyze' | 'exploit';
  displayName: string;
  tools: string[];
  objective: string;
  nextPhaseCondition: (findings: any[]) => boolean;
  requiresApproval?: boolean;
  maxDuration?: number;
}

export interface PhaseResult {
  phase: string;
  results: TestResult[];
  proceedToNext: boolean;
  aiReasoning: string;
  duration: number;
  findingSummary: FindingSummary;
}

export interface TestResult {
  id: string;
  tool: string;
  target: string;
  startTime: Date;
  endTime: Date;
  status: 'success' | 'failed' | 'timeout' | 'skipped';
  findings: Finding[];
  rawOutput?: string;
  error?: string;
  owaspCategories?: string[];
  ccMapping?: string[];
}

export interface Finding {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: number;
  title: string;
  description: string;
  evidence?: any;
  remediation?: string;
  owaspCategory?: string;
  cweId?: string;
  cvssScore?: number;
}

export interface FindingSummary {
  total: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  criticalFindings: Finding[];
}

export interface DiscoveryContext {
  workflowId: string;
  target: string;
  userIntent: string;
  constraints?: any;
  auth?: any;
}

export class ProgressiveDiscovery extends EventEmitter {
  private testResults: Map<string, Map<string, TestResult>> = new Map(); // workflowId -> (toolName -> result)
  private phases: Record<string, Phase> = {
    recon: {
      name: 'recon',
      displayName: 'Reconnaissance',
      tools: ['subdomain-scanner', 'port-scanner', 'directory-scanner', 'tech-fingerprint', 'crawler'],
      objective: 'Map the attack surface comprehensively',
      nextPhaseCondition: (findings: any[]) => {
        // Proceed if we found any relevant information
        return findings.some(f => 
          f.type === 'service' || 
          f.type === 'endpoint' || 
          f.type === 'technology' ||
          f.type === 'subdomain' ||
          f.type === 'port'
        );
      },
      maxDuration: 900000 // 15 minutes
    },
    analyze: {
      name: 'analyze',
      displayName: 'Vulnerability Analysis',
      tools: ['header-analyzer', 'ssl-checker', 'api-discovery', 'form-finder', 'js-analyzer', 'config-checker'],
      objective: 'Identify potential vulnerabilities in discovered assets',
      nextPhaseCondition: (findings: any[]) => {
        // Proceed if we found vulnerabilities worth exploiting
        return findings.some(f => 
          f.severity === 'high' || 
          f.severity === 'critical' ||
          (f.severity === 'medium' && f.confidence > 0.7)
        );
      },
      maxDuration: 1800000 // 30 minutes
    },
    exploit: {
      name: 'exploit',
      displayName: 'Safe Exploitation',
      tools: ['sql-injection', 'xss-scanner', 'jwt-analyzer', 'auth-bypass', 'api-fuzzer', 'controlled-exploit'],
      objective: 'Safely confirm and demonstrate vulnerability impact',
      nextPhaseCondition: () => false, // No next phase after exploit
      requiresApproval: true,
      maxDuration: 2700000 // 45 minutes
    }
  };

  private aiService: StrategicAIService;
  private currentPhase: Phase | null = null;
  private phaseHistory: Map<string, PhaseResult[]> = new Map();
  private toolExecutor: any; // Will be injected

  constructor(aiService: StrategicAIService) {
    super();
    this.aiService = aiService;
  }

  setToolExecutor(executor: any): void {
    this.toolExecutor = executor;
  }

  async executePhase(
    phaseName: 'recon' | 'analyze' | 'exploit',
    context: DiscoveryContext
  ): Promise<PhaseResult> {
    const phase = this.phases[phaseName];
    if (!phase) {
      throw new Error(`Unknown phase: ${phaseName}`);
    }

    this.currentPhase = phase;
    const phaseStartTime = Date.now();
    
    logger.info(`Starting ${phase.displayName} phase`, { 
      workflowId: context.workflowId,
      objective: phase.objective,
      target: context.target,
      availableTools: phase.tools.length
    });

    this.emit('phase:start', {
      workflowId: context.workflowId,
      phase: phaseName,
      objective: phase.objective
    });

    // Check if approval is required
    if (phase.requiresApproval) {
      const approved = await this.requestPhaseApproval(phase, context);
      if (!approved) {
        logger.warn('Phase approval denied', { 
          workflowId: context.workflowId,
          phase: phaseName 
        });
        return this.createSkippedPhaseResult(phase, 'Approval denied');
      }
    }

    // Get AI strategy for this phase
    const allFindings = this.getAllFindings(context.workflowId);
    const strategy = await this.aiService.planInitialStrategy({
      workflowId: context.workflowId,
      target: context.target,
      userIntent: context.userIntent,
      currentFindings: allFindings,
      completedTests: this.getCompletedTests(context.workflowId),
      availableTools: phase.tools,
      phase: phaseName,
      constraints: context.constraints
    });

    logger.info('AI strategy received', {
      workflowId: context.workflowId,
      phase: phaseName,
      recommendedTests: strategy.recommendations.length,
      confidence: strategy.confidenceLevel,
      reasoning: strategy.reasoning.substring(0, 200) + '...'
    });

    this.emit('phase:strategy', {
      workflowId: context.workflowId,
      phase: phaseName,
      strategy: {
        reasoning: strategy.reasoning,
        testCount: strategy.recommendations.length,
        estimatedDuration: strategy.estimatedDuration
      }
    });

    // Execute tests based on AI recommendations
    const results: TestResult[] = [];
    const phaseTimeout = phase.maxDuration || 3600000; // Default 1 hour
    const deadline = Date.now() + phaseTimeout;

    for (const recommendation of strategy.recommendations) {
      // Check timeout
      if (Date.now() > deadline) {
        logger.warn('Phase timeout reached', {
          workflowId: context.workflowId,
          phase: phaseName,
          completed: results.length,
          remaining: strategy.recommendations.length - results.length
        });
        break;
      }

      // Validate tool is available in this phase
      if (!phase.tools.includes(recommendation.tool)) {
        logger.warn('AI recommended unavailable tool', { 
          workflowId: context.workflowId,
          tool: recommendation.tool,
          phase: phaseName,
          availableTools: phase.tools
        });
        continue;
      }

      // Execute the test
      const testResult = await this.executeTest(recommendation, context);
      results.push(testResult);

      // Emit progress
      this.emit('test:complete', {
        workflowId: context.workflowId,
        phase: phaseName,
        test: {
          tool: recommendation.tool,
          status: testResult.status,
          findingsCount: testResult.findings.length
        }
      });

      // Feed results back to AI for adaptive planning
      if (testResult.findings.length > 0 && testResult.status === 'success') {
        try {
          const adaptedStrategy = await this.aiService.adaptStrategy(
            {
              workflowId: context.workflowId,
              target: context.target,
              userIntent: context.userIntent,
              currentFindings: [...allFindings, ...testResult.findings],
              completedTests: [...this.getCompletedTests(context.workflowId), recommendation.tool],
              availableTools: phase.tools,
              phase: phaseName,
              constraints: context.constraints
            },
            testResult.findings
          );
          
          // Add new recommendations to queue if they're high priority
          const highPriorityTests = adaptedStrategy.recommendations.filter(
            r => r.priority === 'critical' || r.priority === 'high'
          );
          
          if (highPriorityTests.length > 0) {
            logger.info('AI adapted strategy with new tests', {
              workflowId: context.workflowId,
              newTests: highPriorityTests.map(t => t.tool),
              reason: adaptedStrategy.reasoning.substring(0, 100) + '...'
            });
            strategy.recommendations.push(...highPriorityTests);
          }
        } catch (error) {
          logger.error('Failed to adapt strategy', { error, workflowId: context.workflowId });
        }
      }
    }

    // Calculate phase duration
    const phaseDuration = Date.now() - phaseStartTime;

    // Summarize findings
    const findingSummary = this.summarizeFindings(results);
    
    // Determine if we should proceed to next phase
    const allPhaseFindings = results.flatMap(r => r.findings);
    const shouldProceed = phase.nextPhaseCondition(allPhaseFindings);
    
    const phaseResult: PhaseResult = {
      phase: phaseName,
      results,
      proceedToNext: shouldProceed,
      aiReasoning: strategy.reasoning,
      duration: phaseDuration,
      findingSummary
    };

    // Store phase result
    this.addPhaseResult(context.workflowId, phaseResult);

    // Emit phase completion
    this.emit('phase:complete', {
      workflowId: context.workflowId,
      phase: phaseName,
      summary: findingSummary,
      proceedToNext: shouldProceed,
      duration: phaseDuration
    });

    logger.info(`Completed ${phase.displayName} phase`, {
      workflowId: context.workflowId,
      testsRun: results.length,
      findingsCount: findingSummary.total,
      criticalFindings: findingSummary.criticalFindings.length,
      proceedToNext: shouldProceed,
      duration: `${Math.round(phaseDuration / 1000)}s`
    });

    return phaseResult;
  }

  async executeFullDiscovery(context: DiscoveryContext): Promise<{
    phases: PhaseResult[];
    totalFindings: Finding[];
    executiveSummary: string;
    owaspCoverage: Record<string, number>;
    duration: number;
  }> {
    const startTime = Date.now();
    const phases: PhaseResult[] = [];
    let currentPhaseName: 'recon' | 'analyze' | 'exploit' = 'recon';
    
    logger.info('Starting full progressive discovery', {
      workflowId: context.workflowId,
      target: context.target,
      intent: context.userIntent
    });

    // Execute phases progressively
    while (currentPhaseName) {
      const phaseResult = await this.executePhase(currentPhaseName, context);
      phases.push(phaseResult);

      if (!phaseResult.proceedToNext) {
        logger.info('Stopping discovery - phase condition not met', {
          workflowId: context.workflowId,
          phase: currentPhaseName,
          reason: phaseResult.findingSummary.total === 0 ? 'No findings' : 'Condition not satisfied'
        });
        break;
      }

      // Determine next phase
      const nextPhase = this.getNextPhase(currentPhaseName);
      if (!nextPhase) {
        logger.info('Discovery complete - no more phases', {
          workflowId: context.workflowId,
          completedPhases: phases.map(p => p.phase)
        });
        break;
      }

      currentPhaseName = nextPhase;
      
      // Brief pause between phases
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Collect all findings
    const allFindings = phases.flatMap(p => 
      p.results.flatMap(r => r.findings)
    );

    // Generate executive summary
    const executiveSummary = await this.aiService.generateExecutiveSummary(
      context.workflowId,
      allFindings
    );

    // Calculate OWASP coverage
    const owaspCoverage = this.calculateOwaspCoverage(phases);

    const totalDuration = Date.now() - startTime;

    logger.info('Progressive discovery complete', {
      workflowId: context.workflowId,
      phasesCompleted: phases.length,
      totalFindings: allFindings.length,
      criticalFindings: allFindings.filter(f => f.severity === 'critical').length,
      duration: `${Math.round(totalDuration / 1000)}s`
    });

    return {
      phases,
      totalFindings: allFindings,
      executiveSummary,
      owaspCoverage,
      duration: totalDuration
    };
  }

  private async executeTest(
    recommendation: AttackStep,
    context: DiscoveryContext
  ): Promise<TestResult> {
    const testId = uuidv4();
    const startTime = new Date();

    logger.info('Executing test', {
      workflowId: context.workflowId,
      testId,
      tool: recommendation.tool,
      purpose: recommendation.purpose
    });

    try {
      if (!this.toolExecutor) {
        throw new Error('Tool executor not set');
      }

      // Apply safety checks
      const safeParams = this.applySafetyChecks(
        recommendation.parameters,
        recommendation.safetyChecks
      );

      logger.debug('Parameters before substitution', {
        workflowId: context.workflowId,
        tool: recommendation.tool,
        params: safeParams
      });

      // Substitute parameters with results from previous tests
      const substitutedParams = this.substituteParameters(safeParams, context.workflowId);

      logger.debug('Parameters after substitution', {
        workflowId: context.workflowId,
        tool: recommendation.tool,
        params: substitutedParams
      });

      // Execute the tool
      const toolResult = await this.toolExecutor.execute({
        tool: recommendation.tool,
        parameters: substitutedParams,
        workflowId: context.workflowId,
        timeout: owaspKnowledgeBase.safetyThresholds.maxTestDuration
      });

      // Parse and enrich findings
      const findings = this.parseToolFindings(toolResult, recommendation);
      
      // Get OWASP mapping
      const toolMapping = owaspKnowledgeBase.toolMapping[recommendation.tool];
      
      const testResult: TestResult = {
        id: testId,
        tool: recommendation.tool,
        target: context.target,
        startTime,
        endTime: new Date(),
        status: 'success',
        findings,
        rawOutput: toolResult.output,
        owaspCategories: toolMapping?.owaspCategories || [],
        ccMapping: toolMapping?.ccControls || []
      };

      // Store the test result for future parameter substitution
      this.storeTestResult(context.workflowId, recommendation.tool, testResult);

      return testResult;
    } catch (error) {
      logger.error('Test execution failed', {
        workflowId: context.workflowId,
        testId,
        tool: recommendation.tool,
        error
      });

      return {
        id: testId,
        tool: recommendation.tool,
        target: context.target,
        startTime,
        endTime: new Date(),
        status: 'failed',
        findings: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private applySafetyChecks(
    parameters: Record<string, any>,
    safetyChecks: string[]
  ): Record<string, any> {
    const safeParams = { ...parameters };

    for (const check of safetyChecks) {
      switch (check) {
        case 'rate-limiting':
          safeParams.rateLimit = owaspKnowledgeBase.safetyThresholds.maxRequestsPerMinute;
          break;
        case 'non-intrusive':
          safeParams.intrusiveLevel = 0;
          break;
        case 'read-only':
          safeParams.readOnly = true;
          break;
        case 'test-account':
          if (safeParams.username) {
            safeParams.username = `test_${safeParams.username}`;
          }
          break;
        case 'payload-limit':
          safeParams.maxPayloadSize = owaspKnowledgeBase.safetyThresholds.maxPayloadSize;
          break;
      }
    }

    return safeParams;
  }

  private parseToolFindings(toolResult: any, recommendation: AttackStep): Finding[] {
    const findings: Finding[] = [];

    // Tool-specific parsing logic
    switch (recommendation.tool) {
      case 'subdomain-scanner':
        // Parse subdomains from output
        if (toolResult.output) {
          const domains = toolResult.output
            .split('\n')
            .filter((line: string) => line.trim() && !line.startsWith('[') && !line.includes('error'));
            
          for (const domain of domains) {
            findings.push({
              type: 'subdomain',
              severity: 'info',
              confidence: 1.0,
              title: `Subdomain discovered: ${domain}`,
              description: `Found subdomain ${domain} for the target domain`,
              target: domain,
              data: { domain }
            });
          }
        }
        break;

      case 'port-scanner':
        // Parse open ports from nmap XML output
        if (toolResult.output && toolResult.output.includes('port')) {
          // Simple parsing - in production, use proper XML parser
          const portMatches = toolResult.output.match(/port protocol="tcp" portid="(\d+)"/g) || [];
          for (const match of portMatches) {
            const port = match.match(/portid="(\d+)"/)?.[1];
            if (port) {
              findings.push({
                type: 'port',
                severity: 'info',
                confidence: 1.0,
                title: `Open port: ${port}`,
                description: `Port ${port} is open`,
                data: { port: parseInt(port) }
              });
            }
          }
        }
        break;

      case 'tech-fingerprint':
        // Parse technology detections from httpx output
        if (toolResult.output) {
          try {
            const lines = toolResult.output.split('\n').filter((l: string) => l.trim());
            for (const line of lines) {
              try {
                const data = JSON.parse(line);
                if (data.tech && data.tech.length > 0) {
                  findings.push({
                    type: 'technology',
                    severity: 'info',
                    confidence: 0.9,
                    title: `Technologies detected: ${data.tech.join(', ')}`,
                    description: `Detected technologies on ${data.url}: ${data.tech.join(', ')}`,
                    target: data.url,
                    data: { technologies: data.tech, url: data.url }
                  });
                }
              } catch (e) {
                // Skip invalid JSON lines
              }
            }
          } catch (e) {
            logger.debug('Failed to parse tech-fingerprint output', { error: e });
          }
        }
        break;

      default:
        // Generic vulnerability parsing for other tools
        if (toolResult.vulnerabilities) {
          for (const vuln of toolResult.vulnerabilities) {
            findings.push({
              type: vuln.type || recommendation.tool,
              severity: this.normalizeSeverity(vuln.severity),
              confidence: vuln.confidence || 0.8,
              title: vuln.title || `${recommendation.tool} finding`,
              description: vuln.description || 'No description provided',
              evidence: vuln.evidence,
              remediation: vuln.remediation,
              owaspCategory: recommendation.owaspCategory,
              cweId: vuln.cwe,
              cvssScore: vuln.cvss
            });
          }
        }
    }

    logger.debug('Parsed findings', {
      tool: recommendation.tool,
      findingsCount: findings.length,
      findings: findings.slice(0, 3) // Log first 3 for debugging
    });

    return findings;
  }

  private normalizeSeverity(severity: any): Finding['severity'] {
    const severityMap: Record<string, Finding['severity']> = {
      'critical': 'critical',
      'high': 'high',
      'medium': 'medium',
      'low': 'low',
      'info': 'info',
      'informational': 'info',
      'minor': 'low',
      'major': 'high',
      'severe': 'critical'
    };

    const normalized = String(severity).toLowerCase();
    return severityMap[normalized] || 'medium';
  }

  private summarizeFindings(results: TestResult[]): FindingSummary {
    const allFindings = results.flatMap(r => r.findings);
    
    const bySeverity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0
    };

    const byCategory: Record<string, number> = {};
    const criticalFindings: Finding[] = [];

    for (const finding of allFindings) {
      bySeverity[finding.severity]++;
      
      if (finding.owaspCategory) {
        byCategory[finding.owaspCategory] = (byCategory[finding.owaspCategory] || 0) + 1;
      }

      if (finding.severity === 'critical') {
        criticalFindings.push(finding);
      }
    }

    return {
      total: allFindings.length,
      bySeverity,
      byCategory,
      criticalFindings
    };
  }

  private calculateOwaspCoverage(phases: PhaseResult[]): Record<string, number> {
    const coverage: Record<string, number> = {};
    
    // Initialize all OWASP categories to 0
    for (const category of Object.keys(owaspKnowledgeBase.webTop10)) {
      coverage[category] = 0;
    }

    // Count tests per category
    for (const phase of phases) {
      for (const result of phase.results) {
        if (result.owaspCategories) {
          for (const category of result.owaspCategories) {
            coverage[category] = (coverage[category] || 0) + 1;
          }
        }
      }
    }

    return coverage;
  }

  private async requestPhaseApproval(phase: Phase, context: DiscoveryContext): Promise<boolean> {
    logger.info('Requesting phase approval', {
      workflowId: context.workflowId,
      phase: phase.name
    });

    this.emit('approval:required', {
      workflowId: context.workflowId,
      phase: phase.name,
      reason: 'Phase requires explicit approval before execution',
      timeout: 300000 // 5 minutes
    });

    // In a real implementation, this would integrate with Slack/Teams
    // For now, auto-approve after a delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    return true;
  }

  private createSkippedPhaseResult(phase: Phase, reason: string): PhaseResult {
    return {
      phase: phase.name,
      results: [],
      proceedToNext: false,
      aiReasoning: reason,
      duration: 0,
      findingSummary: {
        total: 0,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        byCategory: {},
        criticalFindings: []
      }
    };
  }

  private getAllFindings(workflowId: string): Finding[] {
    const history = this.phaseHistory.get(workflowId) || [];
    return history.flatMap(phase => 
      phase.results.flatMap(result => result.findings)
    );
  }

  private getCompletedTests(workflowId: string): string[] {
    const history = this.phaseHistory.get(workflowId) || [];
    return history.flatMap(phase => 
      phase.results.map(result => result.tool)
    );
  }

  private addPhaseResult(workflowId: string, result: PhaseResult): void {
    const history = this.phaseHistory.get(workflowId) || [];
    history.push(result);
    this.phaseHistory.set(workflowId, history);
  }

  private getNextPhase(currentPhase: string): 'recon' | 'analyze' | 'exploit' | null {
    const phaseOrder: Array<'recon' | 'analyze' | 'exploit'> = ['recon', 'analyze', 'exploit'];
    const currentIndex = phaseOrder.indexOf(currentPhase as any);
    
    if (currentIndex === -1 || currentIndex === phaseOrder.length - 1) {
      return null;
    }
    
    return phaseOrder[currentIndex + 1];
  }

  public getPhaseHistory(workflowId: string): PhaseResult[] {
    return this.phaseHistory.get(workflowId) || [];
  }

  private storeTestResult(workflowId: string, tool: string, result: TestResult): void {
    if (!this.testResults.has(workflowId)) {
      this.testResults.set(workflowId, new Map());
    }
    
    const workflowResults = this.testResults.get(workflowId)!;
    workflowResults.set(tool, result);
    
    logger.debug('Stored test result', {
      workflowId,
      tool,
      findingsCount: result.findings.length
    });
  }

  private substituteParameters(params: Record<string, any>, workflowId: string): Record<string, any> {
    const substituted: Record<string, any> = {};
    const workflowResults = this.testResults.get(workflowId);
    
    logger.info('Starting parameter substitution', {
      workflowId,
      params,
      hasResults: !!workflowResults,
      resultCount: workflowResults?.size || 0
    });
    
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.includes('{{') && value.includes('}}')) {
        // Extract template variable
        const matches = value.match(/\{\{([\w-]+)\.([\w]+)\}\}/);
        if (matches) {
          const [fullMatch, toolName, property] = matches;
          const testResult = workflowResults?.get(toolName);
          
          logger.info('Found template to substitute', {
            workflowId,
            key,
            template: value,
            toolName,
            property,
            hasTestResult: !!testResult
          });
          
          if (testResult) {
            logger.debug('Substituting parameter', {
              workflowId,
              key,
              template: value,
              toolName,
              property
            });
            
            if (property === 'results') {
              // For subdomain scanner, extract domains from raw output
              if (toolName === 'subdomain-scanner' && testResult.rawOutput) {
                const domains = testResult.rawOutput
                  .split('\n')
                  .filter(line => line.trim())
                  .map(line => line.trim());
                  
                substituted[key] = domains;
                logger.info('Substituted domains', {
                  workflowId,
                  key,
                  count: domains.length,
                  domains: domains.slice(0, 5) // Log first 5 for debugging
                });
              } else {
                // For other tools, use findings
                substituted[key] = testResult.findings.map(f => f.target || f.data);
              }
            } else if (property === 'output') {
              substituted[key] = testResult.rawOutput;
            } else {
              substituted[key] = value; // Keep original if property not found
            }
          } else {
            logger.warn('No test result found for parameter substitution', {
              workflowId,
              toolName,
              template: value
            });
            substituted[key] = value;
          }
        } else {
          substituted[key] = value;
        }
      } else if (Array.isArray(value)) {
        // Handle arrays recursively
        substituted[key] = value.map(item => 
          typeof item === 'string' && item.includes('{{') 
            ? this.substituteParameters({ value: item }, workflowId).value 
            : item
        );
      } else {
        substituted[key] = value;
      }
    }
    
    return substituted;
  }
}