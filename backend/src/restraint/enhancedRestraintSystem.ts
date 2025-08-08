import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger.js';
import { owaspKnowledgeBase } from '../knowledge/owaspKnowledgeBase.js';

const logger = createLogger('EnhancedRestraintSystem');

export interface RestraintRule {
  id: string;
  name: string;
  description: string;
  condition: (test: any) => boolean;
  action: 'allow' | 'deny' | 'request-approval' | 'limit-scope' | 'rate-limit' | 'monitor';
  reason: string;
  mitigation?: Record<string, any>;
  severity: 'info' | 'warning' | 'critical';
  ccControls?: string[];
}

export interface RestraintDecision {
  approved: boolean;
  reason?: string;
  rule?: string;
  appliedRules?: RestraintRule[];
  mitigations?: Record<string, any>;
  requiresApproval?: boolean;
  approvalReason?: string;
}

export interface RestraintContext {
  workflowId: string;
  test: any;
  target: string;
  currentFindings?: any[];
  userRole?: string;
  environment?: 'production' | 'staging' | 'development';
}

export class EnhancedRestraintSystem extends EventEmitter {
  private restraintRules: RestraintRule[] = [
    // Authentication and Authorization Rules
    {
      id: 'auth-required',
      name: 'Authentication Required',
      description: 'Test requires authentication credentials',
      condition: (test) => test.requiresAuth === true,
      action: 'request-approval',
      reason: 'Test requires authentication - ensure test accounts are used',
      severity: 'warning',
      ccControls: ['CC6.1', 'CC6.2']
    },
    {
      id: 'privilege-escalation',
      name: 'Privilege Escalation Test',
      description: 'Test attempts to escalate privileges',
      condition: (test) => test.tool === 'privilege-escalator' || test.tool === 'auth-bypass',
      action: 'request-approval',
      reason: 'Privilege escalation testing requires explicit approval',
      severity: 'critical',
      ccControls: ['CC6.1', 'CC6.3']
    },
    
    // Data Protection Rules
    {
      id: 'data-exposure-risk',
      name: 'Data Exposure Risk',
      description: 'Test might expose sensitive data',
      condition: (test) => 
        test.tool.includes('extraction') || 
        test.tool.includes('dump') ||
        test.parameters?.extractData === true,
      action: 'limit-scope',
      reason: 'Potential data exposure - limiting scope',
      mitigation: { 
        maxRecords: 10,
        maskSensitiveData: true,
        excludePatterns: ['ssn', 'credit_card', 'password']
      },
      severity: 'warning',
      ccControls: ['CC6.1', 'CC6.7', 'CC9.1']
    },
    {
      id: 'pii-protection',
      name: 'PII Protection',
      description: 'Prevent exposure of personally identifiable information',
      condition: (test) => 
        test.tool.includes('user') || 
        test.tool.includes('profile') ||
        test.parameters?.target?.includes('/users'),
      action: 'limit-scope',
      reason: 'PII protection required',
      mitigation: {
        anonymizeData: true,
        excludeFields: ['email', 'phone', 'address', 'ssn', 'dob']
      },
      severity: 'critical',
      ccControls: ['CC10.1', 'CC10.2']
    },
    
    // Service Availability Rules
    {
      id: 'dos-risk',
      name: 'DoS Risk',
      description: 'Test might cause service disruption',
      condition: (test) => 
        test.tool.includes('fuzzer') || 
        test.tool.includes('stress') ||
        test.parameters?.threads > 10,
      action: 'rate-limit',
      reason: 'Potential service disruption - applying rate limits',
      mitigation: { 
        requestsPerSecond: 5,
        maxThreads: 5,
        delayMs: 200
      },
      severity: 'warning',
      ccControls: ['CC7.1', 'CC7.2']
    },
    {
      id: 'resource-exhaustion',
      name: 'Resource Exhaustion Prevention',
      description: 'Prevent tests that might exhaust system resources',
      condition: (test) => 
        test.parameters?.payloadSize > 1048576 || // 1MB
        test.parameters?.iterations > 1000,
      action: 'limit-scope',
      reason: 'Resource exhaustion risk - limiting parameters',
      mitigation: {
        maxPayloadSize: 102400, // 100KB
        maxIterations: 100,
        timeout: 60000 // 1 minute
      },
      severity: 'warning',
      ccControls: ['CC7.1', 'CC7.4']
    },
    
    // Destructive Operation Rules
    {
      id: 'no-data-modification',
      name: 'No Data Modification',
      description: 'Prevent tests that modify data',
      condition: (test) => 
        test.tool.includes('delete') || 
        test.tool.includes('update') ||
        test.parameters?.method === 'DELETE' ||
        test.parameters?.method === 'PUT',
      action: 'deny',
      reason: 'Data modification is prohibited',
      severity: 'critical',
      ccControls: ['CC8.1']
    },
    {
      id: 'no-system-changes',
      name: 'No System Changes',
      description: 'Prevent tests that make system configuration changes',
      condition: (test) => 
        test.tool.includes('config') && !test.tool.includes('checker') ||
        test.parameters?.modifySystem === true,
      action: 'deny',
      reason: 'System configuration changes are prohibited',
      severity: 'critical',
      ccControls: ['CC6.1', 'CC7.1']
    },
    
    // Production Environment Rules
    {
      id: 'production-safety',
      name: 'Production Environment Safety',
      description: 'Extra restrictions for production environments',
      condition: (test) => test.environment === 'production',
      action: 'request-approval',
      reason: 'Production environment requires explicit approval',
      mitigation: {
        requiresMFA: true,
        auditLog: true,
        notifySecurityTeam: true
      },
      severity: 'critical',
      ccControls: ['CC7.1', 'CC7.2', 'CC7.3']
    },
    
    // Compliance and Legal Rules
    {
      id: 'compliance-boundary',
      name: 'Compliance Boundary',
      description: 'Ensure tests stay within compliance boundaries',
      condition: (test) => 
        test.parameters?.target?.includes('payment') ||
        test.parameters?.target?.includes('financial'),
      action: 'request-approval',
      reason: 'Financial systems require compliance review',
      mitigation: {
        requiresPCIDSS: true,
        maskCardNumbers: true
      },
      severity: 'critical',
      ccControls: ['CC3.2', 'CC3.3', 'CC3.4']
    },
    
    // AI-Specific Rules
    {
      id: 'ai-safety',
      name: 'AI Safety Rules',
      description: 'Prevent AI manipulation and prompt injection',
      condition: (test) => 
        test.tool.includes('prompt') ||
        test.tool.includes('llm') ||
        test.parameters?.testType === 'ai-security',
      action: 'limit-scope',
      reason: 'AI safety measures required',
      mitigation: {
        sanitizeInputs: true,
        validateOutputs: true,
        maxPromptLength: 1000,
        blockMaliciousPatterns: true
      },
      severity: 'warning',
      ccControls: ['CC6.1', 'CC7.1']
    },
    
    // Time and Scope Rules
    {
      id: 'business-hours',
      name: 'Business Hours Restriction',
      description: 'Limit intensive tests to off-hours',
      condition: (test) => {
        const hour = new Date().getHours();
        const isBusinessHours = hour >= 8 && hour <= 18;
        return isBusinessHours && test.priority !== 'critical';
      },
      action: 'monitor',
      reason: 'Non-critical tests during business hours require monitoring',
      mitigation: {
        notifyOps: true,
        reducedRate: true
      },
      severity: 'info',
      ccControls: ['CC7.2']
    },
    
    // Network Boundary Rules
    {
      id: 'internal-only',
      name: 'Internal Network Only',
      description: 'Restrict certain tests to internal networks',
      condition: (test) => 
        test.tool.includes('internal') ||
        test.parameters?.target?.includes('10.') ||
        test.parameters?.target?.includes('192.168.'),
      action: 'monitor',
      reason: 'Internal network testing - ensure proper authorization',
      severity: 'warning',
      ccControls: ['CC6.6']
    }
  ];

  private customRules: RestraintRule[] = [];
  private approvalCache: Map<string, boolean> = new Map();
  private ruleStats: Map<string, number> = new Map();

  constructor() {
    super();
    logger.info('Enhanced Restraint System initialized', {
      defaultRules: this.restraintRules.length
    });
  }

  async evaluateTest(context: RestraintContext): Promise<RestraintDecision> {
    const startTime = Date.now();
    const applicableRules: RestraintRule[] = [];
    const mitigations: Record<string, any> = {};
    let requiresApproval = false;
    let approvalReasons: string[] = [];
    let denied = false;
    let denyReason = '';

    logger.info('Evaluating test restraints', {
      workflowId: context.workflowId,
      tool: context.test.tool,
      target: context.target
    });

    // Check all rules
    for (const rule of [...this.restraintRules, ...this.customRules]) {
      try {
        if (rule.condition(context.test)) {
          applicableRules.push(rule);
          this.incrementRuleStats(rule.id);

          logger.debug('Rule matched', {
            ruleId: rule.id,
            ruleName: rule.name,
            action: rule.action
          });

          switch (rule.action) {
            case 'deny':
              denied = true;
              denyReason = rule.reason;
              this.emit('restraint:denied', {
                workflowId: context.workflowId,
                rule: rule.id,
                reason: rule.reason
              });
              break;

            case 'request-approval':
              requiresApproval = true;
              approvalReasons.push(`${rule.name}: ${rule.reason}`);
              break;

            case 'limit-scope':
            case 'rate-limit':
              if (rule.mitigation) {
                Object.assign(mitigations, rule.mitigation);
              }
              break;

            case 'monitor':
              this.emit('restraint:monitor', {
                workflowId: context.workflowId,
                rule: rule.id,
                test: context.test
              });
              break;
          }
        }
      } catch (error) {
        logger.error('Rule evaluation failed', {
          ruleId: rule.id,
          error
        });
      }
    }

    // Check if denied
    if (denied) {
      logger.warn('Test denied by restraint rule', {
        workflowId: context.workflowId,
        reason: denyReason
      });
      
      return {
        approved: false,
        reason: denyReason,
        appliedRules: applicableRules
      };
    }

    // Check if approval required
    if (requiresApproval) {
      const approvalKey = this.getApprovalKey(context);
      const cachedApproval = this.approvalCache.get(approvalKey);
      
      if (cachedApproval !== undefined) {
        logger.info('Using cached approval decision', {
          workflowId: context.workflowId,
          approved: cachedApproval
        });
      } else {
        const approved = await this.requestApproval(context, approvalReasons);
        this.approvalCache.set(approvalKey, approved);
        
        if (!approved) {
          return {
            approved: false,
            reason: 'Approval denied',
            requiresApproval: true,
            approvalReason: approvalReasons.join('; ')
          };
        }
      }
    }

    // Apply mitigations to test parameters
    if (Object.keys(mitigations).length > 0) {
      this.applyMitigations(context.test, mitigations);
      logger.info('Applied mitigations', {
        workflowId: context.workflowId,
        mitigations: Object.keys(mitigations)
      });
    }

    const evaluationTime = Date.now() - startTime;
    
    logger.info('Test restraint evaluation complete', {
      workflowId: context.workflowId,
      approved: true,
      rulesApplied: applicableRules.length,
      mitigationsApplied: Object.keys(mitigations).length,
      evaluationTime
    });

    this.emit('restraint:evaluated', {
      workflowId: context.workflowId,
      approved: true,
      rules: applicableRules.map(r => r.id),
      mitigations: Object.keys(mitigations),
      duration: evaluationTime
    });

    return {
      approved: true,
      appliedRules: applicableRules,
      mitigations: Object.keys(mitigations).length > 0 ? mitigations : undefined
    };
  }

  async evaluateBatch(
    tests: any[],
    context: Omit<RestraintContext, 'test'>
  ): Promise<Map<string, RestraintDecision>> {
    const decisions = new Map<string, RestraintDecision>();
    
    logger.info('Evaluating batch of tests', {
      workflowId: context.workflowId,
      testCount: tests.length
    });

    // Group tests by similar characteristics for efficiency
    const testGroups = this.groupTestsByCharacteristics(tests);
    
    for (const [groupKey, groupTests] of testGroups) {
      // Evaluate first test in group
      const firstTest = groupTests[0];
      const decision = await this.evaluateTest({
        ...context,
        test: firstTest
      });
      
      // Apply same decision to similar tests if appropriate
      for (const test of groupTests) {
        if (this.canReuseDecision(firstTest, test)) {
          decisions.set(test.id || test.tool, decision);
        } else {
          // Evaluate individually if different
          const individualDecision = await this.evaluateTest({
            ...context,
            test
          });
          decisions.set(test.id || test.tool, individualDecision);
        }
      }
    }
    
    return decisions;
  }

  addCustomRule(rule: RestraintRule): void {
    logger.info('Adding custom restraint rule', {
      ruleId: rule.id,
      ruleName: rule.name
    });
    
    this.customRules.push(rule);
    
    this.emit('rule:added', {
      ruleId: rule.id,
      ruleName: rule.name,
      totalRules: this.restraintRules.length + this.customRules.length
    });
  }

  removeCustomRule(ruleId: string): boolean {
    const initialLength = this.customRules.length;
    this.customRules = this.customRules.filter(r => r.id !== ruleId);
    
    if (this.customRules.length < initialLength) {
      logger.info('Removed custom restraint rule', { ruleId });
      return true;
    }
    
    return false;
  }

  private async requestApproval(
    context: RestraintContext,
    reasons: string[]
  ): Promise<boolean> {
    logger.info('Requesting approval for test', {
      workflowId: context.workflowId,
      tool: context.test.tool,
      reasons: reasons.length
    });

    this.emit('approval:required', {
      workflowId: context.workflowId,
      test: {
        tool: context.test.tool,
        target: context.target,
        parameters: context.test.parameters
      },
      reasons,
      timeout: 300000 // 5 minutes
    });

    // In production, this would integrate with Slack/Teams/Email
    // For now, we'll simulate approval based on environment
    if (context.environment === 'production') {
      // Production always requires manual approval
      logger.warn('Production test requires manual approval', {
        workflowId: context.workflowId
      });
      
      // Simulate waiting for approval
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // For demo, approve if test is read-only
      const isReadOnly = context.test.parameters?.readOnly || 
                        !context.test.tool.includes('modify') &&
                        !context.test.tool.includes('delete');
      
      return isReadOnly;
    }
    
    // Non-production environments: auto-approve after delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    return true;
  }

  private applyMitigations(test: any, mitigations: Record<string, any>): void {
    // Apply each mitigation to test parameters
    test.parameters = test.parameters || {};
    
    for (const [key, value] of Object.entries(mitigations)) {
      switch (key) {
        case 'requestsPerSecond':
          test.parameters.rateLimit = Math.min(
            test.parameters.rateLimit || Infinity,
            value
          );
          break;
          
        case 'maxRecords':
          test.parameters.limit = Math.min(
            test.parameters.limit || Infinity,
            value
          );
          break;
          
        case 'timeout':
          test.parameters.timeout = Math.min(
            test.parameters.timeout || Infinity,
            value
          );
          break;
          
        case 'maskSensitiveData':
          test.parameters.maskSensitive = value;
          break;
          
        case 'excludeFields':
          test.parameters.excludeFields = [
            ...(test.parameters.excludeFields || []),
            ...value
          ];
          break;
          
        default:
          // Direct assignment for other mitigations
          test.parameters[key] = value;
      }
    }
  }

  private getApprovalKey(context: RestraintContext): string {
    return `${context.workflowId}-${context.test.tool}-${context.target}`;
  }

  private groupTestsByCharacteristics(tests: any[]): Map<string, any[]> {
    const groups = new Map<string, any[]>();
    
    for (const test of tests) {
      const key = `${test.tool}-${test.requiresAuth}-${test.priority}`;
      const group = groups.get(key) || [];
      group.push(test);
      groups.set(key, group);
    }
    
    return groups;
  }

  private canReuseDecision(test1: any, test2: any): boolean {
    // Tests can share decisions if they have same tool and auth requirements
    return test1.tool === test2.tool &&
           test1.requiresAuth === test2.requiresAuth &&
           test1.priority === test2.priority;
  }

  private incrementRuleStats(ruleId: string): void {
    const count = this.ruleStats.get(ruleId) || 0;
    this.ruleStats.set(ruleId, count + 1);
  }

  public getRuleStatistics(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [ruleId, count] of this.ruleStats) {
      const rule = [...this.restraintRules, ...this.customRules].find(r => r.id === ruleId);
      if (rule) {
        stats[ruleId] = {
          name: rule.name,
          triggered: count,
          severity: rule.severity,
          action: rule.action
        };
      }
    }
    
    return stats;
  }

  public exportConfiguration(): any {
    return {
      defaultRules: this.restraintRules.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        action: r.action,
        severity: r.severity,
        ccControls: r.ccControls
      })),
      customRules: this.customRules.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        action: r.action,
        severity: r.severity,
        ccControls: r.ccControls
      })),
      statistics: this.getRuleStatistics()
    };
  }
}