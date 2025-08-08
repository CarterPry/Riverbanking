import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('AIDecisionLogger');

export interface AIDecisionLog {
  id: string;
  timestamp: Date;
  workflowId: string;
  decisionType: 'strategy' | 'test-selection' | 'vulnerability-analysis' | 'phase-transition' | 'tree-adaptation' | 'restraint-override';
  input: {
    context: any;
    prompt?: string;
    currentState?: any;
  };
  output: {
    decision: any;
    reasoning: string;
    confidence: number;
    alternatives?: any[];
  };
  metadata: {
    model: string;
    temperature?: number;
    tokens?: number;
    latency?: number;
    phase?: string;
    tool?: string;
  };
  outcome?: {
    executed: boolean;
    result?: 'success' | 'failure' | 'skipped';
    impact?: string;
    findings?: number;
  };
  auditFlags?: {
    manualReview?: boolean;
    complianceRelevant?: boolean;
    securityCritical?: boolean;
    unexpected?: boolean;
  };
}

export interface AuditReport {
  workflowId: string;
  startTime: Date;
  endTime: Date;
  totalDecisions: number;
  decisionsByType: Record<string, number>;
  averageConfidence: number;
  lowConfidenceDecisions: AIDecisionLog[];
  criticalDecisions: AIDecisionLog[];
  overriddenDecisions: AIDecisionLog[];
  timeline: TimelineEntry[];
  complianceSummary: ComplianceSummary;
  recommendations: string[];
}

export interface TimelineEntry {
  timestamp: Date;
  type: string;
  summary: string;
  confidence: number;
  impact: 'high' | 'medium' | 'low';
}

export interface ComplianceSummary {
  totalTests: number;
  testsWithApproval: number;
  restraintsTriggered: number;
  ccControlsCovered: string[];
  owaspCategoriesTested: string[];
  dataExposureRisk: boolean;
  productionSafety: boolean;
}

export class AIDecisionLogger extends EventEmitter {
  private decisions: Map<string, AIDecisionLog[]> = new Map();
  private persistPath: string;
  private realTimeMode: boolean = false;
  private complianceMode: boolean = true;

  constructor(options?: { persistPath?: string; realTimeMode?: boolean; complianceMode?: boolean }) {
    super();
    this.persistPath = options?.persistPath || './logs/ai-decisions';
    this.realTimeMode = options?.realTimeMode || false;
    this.complianceMode = options?.complianceMode !== false;
    
    this.initializeStorage();
  }

  private async initializeStorage(): Promise<void> {
    try {
      await fs.mkdir(this.persistPath, { recursive: true });
      logger.info('AI Decision Logger initialized', {
        persistPath: this.persistPath,
        realTimeMode: this.realTimeMode,
        complianceMode: this.complianceMode
      });
    } catch (error) {
      logger.error('Failed to initialize storage', { error });
    }
  }

  async logDecision(params: {
    workflowId: string;
    decisionType: AIDecisionLog['decisionType'];
    input: any;
    output: any;
    metadata: any;
    auditFlags?: any;
  }): Promise<string> {
    const decision: AIDecisionLog = {
      id: uuidv4(),
      timestamp: new Date(),
      workflowId: params.workflowId,
      decisionType: params.decisionType,
      input: params.input,
      output: params.output,
      metadata: params.metadata,
      auditFlags: params.auditFlags
    };

    // Store in memory
    const workflowDecisions = this.decisions.get(params.workflowId) || [];
    workflowDecisions.push(decision);
    this.decisions.set(params.workflowId, workflowDecisions);

    // Emit for real-time monitoring
    if (this.realTimeMode) {
      this.emit('decision:logged', decision);
    }

    // Check for compliance flags
    if (this.complianceMode) {
      this.checkComplianceFlags(decision);
    }

    // Persist to disk
    await this.persistDecision(decision);

    logger.info('AI decision logged', {
      id: decision.id,
      workflowId: params.workflowId,
      type: params.decisionType,
      confidence: params.output.confidence
    });

    return decision.id;
  }

  async updateOutcome(decisionId: string, workflowId: string, outcome: AIDecisionLog['outcome']): Promise<void> {
    const decisions = this.decisions.get(workflowId);
    if (!decisions) return;

    const decision = decisions.find(d => d.id === decisionId);
    if (!decision) return;

    decision.outcome = outcome;

    // Check if outcome was unexpected
    if (outcome.result === 'failure' || 
        (decision.output.confidence > 0.8 && outcome.result === 'skipped')) {
      decision.auditFlags = decision.auditFlags || {};
      decision.auditFlags.unexpected = true;
      
      logger.warn('Unexpected AI decision outcome', {
        decisionId,
        expectedConfidence: decision.output.confidence,
        actualResult: outcome.result
      });

      this.emit('decision:unexpected', decision);
    }

    await this.persistDecision(decision);
  }

  async generateAuditReport(workflowId: string): Promise<AuditReport> {
    const decisions = this.decisions.get(workflowId) || [];
    if (decisions.length === 0) {
      throw new Error(`No decisions found for workflow ${workflowId}`);
    }

    const startTime = decisions[0].timestamp;
    const endTime = decisions[decisions.length - 1].timestamp;

    // Calculate statistics
    const decisionsByType: Record<string, number> = {};
    let totalConfidence = 0;
    const lowConfidenceDecisions: AIDecisionLog[] = [];
    const criticalDecisions: AIDecisionLog[] = [];
    const overriddenDecisions: AIDecisionLog[] = [];

    for (const decision of decisions) {
      // Count by type
      decisionsByType[decision.decisionType] = (decisionsByType[decision.decisionType] || 0) + 1;
      
      // Sum confidence
      totalConfidence += decision.output.confidence;
      
      // Identify low confidence
      if (decision.output.confidence < 0.6) {
        lowConfidenceDecisions.push(decision);
      }
      
      // Identify critical decisions
      if (decision.auditFlags?.securityCritical || decision.decisionType === 'restraint-override') {
        criticalDecisions.push(decision);
      }
      
      // Identify overridden decisions
      if (decision.outcome && decision.outcome.executed === false && decision.output.confidence > 0.7) {
        overriddenDecisions.push(decision);
      }
    }

    // Build timeline
    const timeline = this.buildTimeline(decisions);
    
    // Generate compliance summary
    const complianceSummary = this.generateComplianceSummary(decisions);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(decisions, {
      lowConfidenceDecisions,
      criticalDecisions,
      overriddenDecisions,
      complianceSummary
    });

    const report: AuditReport = {
      workflowId,
      startTime,
      endTime,
      totalDecisions: decisions.length,
      decisionsByType,
      averageConfidence: totalConfidence / decisions.length,
      lowConfidenceDecisions,
      criticalDecisions,
      overriddenDecisions,
      timeline,
      complianceSummary,
      recommendations
    };

    // Persist report
    await this.persistReport(report);

    logger.info('Audit report generated', {
      workflowId,
      totalDecisions: report.totalDecisions,
      averageConfidence: report.averageConfidence.toFixed(2)
    });

    return report;
  }

  private checkComplianceFlags(decision: AIDecisionLog): void {
    // Check for security-critical decisions
    if (decision.decisionType === 'vulnerability-analysis' && 
        decision.output.decision?.severity === 'critical') {
      decision.auditFlags = decision.auditFlags || {};
      decision.auditFlags.securityCritical = true;
      decision.auditFlags.manualReview = true;
    }

    // Check for compliance-relevant decisions
    if (decision.input.context?.ccControls || 
        decision.metadata.phase === 'exploit') {
      decision.auditFlags = decision.auditFlags || {};
      decision.auditFlags.complianceRelevant = true;
    }

    // Flag low-confidence critical decisions
    if (decision.output.confidence < 0.5 && 
        (decision.decisionType === 'strategy' || decision.decisionType === 'vulnerability-analysis')) {
      decision.auditFlags = decision.auditFlags || {};
      decision.auditFlags.manualReview = true;
      
      this.emit('decision:review-required', decision);
    }
  }

  private buildTimeline(decisions: AIDecisionLog[]): TimelineEntry[] {
    return decisions.map(decision => ({
      timestamp: decision.timestamp,
      type: decision.decisionType,
      summary: this.summarizeDecision(decision),
      confidence: decision.output.confidence,
      impact: this.assessImpact(decision)
    })).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private summarizeDecision(decision: AIDecisionLog): string {
    switch (decision.decisionType) {
      case 'strategy':
        return `Planned ${decision.output.decision?.recommendations?.length || 0} tests for ${decision.metadata.phase} phase`;
      case 'test-selection':
        return `Selected ${decision.metadata.tool} tool with ${decision.output.confidence.toFixed(2)} confidence`;
      case 'vulnerability-analysis':
        return `Analyzed ${decision.output.decision?.severity || 'unknown'} severity finding`;
      case 'phase-transition':
        return `Decided to ${decision.output.decision?.proceed ? 'proceed to' : 'stay in'} ${decision.metadata.phase} phase`;
      case 'tree-adaptation':
        return `Added ${decision.output.decision?.addedNodes || 0} new test nodes`;
      case 'restraint-override':
        return `${decision.output.decision?.approved ? 'Approved' : 'Denied'} restraint override`;
      default:
        return 'Unknown decision type';
    }
  }

  private assessImpact(decision: AIDecisionLog): 'high' | 'medium' | 'low' {
    if (decision.auditFlags?.securityCritical || decision.decisionType === 'restraint-override') {
      return 'high';
    }
    
    if (decision.decisionType === 'strategy' || decision.decisionType === 'phase-transition') {
      return 'medium';
    }
    
    return 'low';
  }

  private generateComplianceSummary(decisions: AIDecisionLog[]): ComplianceSummary {
    const summary: ComplianceSummary = {
      totalTests: 0,
      testsWithApproval: 0,
      restraintsTriggered: 0,
      ccControlsCovered: [],
      owaspCategoriesTested: [],
      dataExposureRisk: false,
      productionSafety: true
    };

    const ccControls = new Set<string>();
    const owaspCategories = new Set<string>();

    for (const decision of decisions) {
      if (decision.decisionType === 'test-selection') {
        summary.totalTests++;
      }
      
      if (decision.input.context?.requiresApproval) {
        summary.testsWithApproval++;
      }
      
      if (decision.decisionType === 'restraint-override') {
        summary.restraintsTriggered++;
      }
      
      if (decision.input.context?.ccControls) {
        decision.input.context.ccControls.forEach((cc: string) => ccControls.add(cc));
      }
      
      if (decision.metadata.tool?.includes('data') || decision.metadata.tool?.includes('extract')) {
        summary.dataExposureRisk = true;
      }
      
      if (decision.input.context?.environment === 'production' && !decision.output.decision?.approved) {
        summary.productionSafety = false;
      }
      
      if (decision.input.context?.owaspCategory) {
        owaspCategories.add(decision.input.context.owaspCategory);
      }
    }

    summary.ccControlsCovered = Array.from(ccControls);
    summary.owaspCategoriesTested = Array.from(owaspCategories);

    return summary;
  }

  private generateRecommendations(
    decisions: AIDecisionLog[],
    analysis: {
      lowConfidenceDecisions: AIDecisionLog[];
      criticalDecisions: AIDecisionLog[];
      overriddenDecisions: AIDecisionLog[];
      complianceSummary: ComplianceSummary;
    }
  ): string[] {
    const recommendations: string[] = [];

    // Low confidence recommendations
    if (analysis.lowConfidenceDecisions.length > decisions.length * 0.2) {
      recommendations.push(
        'High number of low-confidence decisions detected. Consider improving AI prompts or providing more context.'
      );
    }

    // Critical decision recommendations
    if (analysis.criticalDecisions.length > 0) {
      recommendations.push(
        `${analysis.criticalDecisions.length} critical security decisions made. Manual review recommended for workflow validation.`
      );
    }

    // Override recommendations
    if (analysis.overriddenDecisions.length > decisions.length * 0.1) {
      recommendations.push(
        'Significant number of AI decisions were overridden. Consider adjusting decision thresholds or improving context.'
      );
    }

    // Compliance recommendations
    if (analysis.complianceSummary.dataExposureRisk) {
      recommendations.push(
        'Data exposure risk detected. Ensure proper data masking and limited scope for data extraction tests.'
      );
    }

    if (!analysis.complianceSummary.productionSafety) {
      recommendations.push(
        'Production safety concerns identified. Review and strengthen production environment restraints.'
      );
    }

    if (analysis.complianceSummary.ccControlsCovered.length < 5) {
      recommendations.push(
        'Limited SOC2 control coverage. Consider expanding test scope to cover more Trust Service Criteria.'
      );
    }

    // OWASP coverage
    if (analysis.complianceSummary.owaspCategoriesTested.length < 5) {
      recommendations.push(
        'Incomplete OWASP coverage. Add tests for missing OWASP Top 10 categories.'
      );
    }

    return recommendations;
  }

  private async persistDecision(decision: AIDecisionLog): Promise<void> {
    try {
      const filePath = path.join(
        this.persistPath,
        decision.workflowId,
        `${decision.timestamp.toISOString()}-${decision.id}.json`
      );
      
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(decision, null, 2));
    } catch (error) {
      logger.error('Failed to persist decision', { error, decisionId: decision.id });
    }
  }

  private async persistReport(report: AuditReport): Promise<void> {
    try {
      const filePath = path.join(
        this.persistPath,
        report.workflowId,
        `audit-report-${report.endTime.toISOString()}.json`
      );
      
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(report, null, 2));
      
      // Also create a human-readable summary
      const summaryPath = path.join(
        this.persistPath,
        report.workflowId,
        `audit-summary-${report.endTime.toISOString()}.md`
      );
      
      await fs.writeFile(summaryPath, this.generateMarkdownSummary(report));
    } catch (error) {
      logger.error('Failed to persist report', { error, workflowId: report.workflowId });
    }
  }

  private generateMarkdownSummary(report: AuditReport): string {
    return `# AI Decision Audit Report

## Workflow: ${report.workflowId}

**Duration**: ${report.startTime.toISOString()} - ${report.endTime.toISOString()}

## Summary Statistics
- **Total Decisions**: ${report.totalDecisions}
- **Average Confidence**: ${(report.averageConfidence * 100).toFixed(1)}%
- **Low Confidence Decisions**: ${report.lowConfidenceDecisions.length}
- **Critical Decisions**: ${report.criticalDecisions.length}
- **Overridden Decisions**: ${report.overriddenDecisions.length}

## Decision Breakdown
${Object.entries(report.decisionsByType).map(([type, count]) => 
  `- ${type}: ${count}`
).join('\n')}

## Compliance Summary
- **Total Tests**: ${report.complianceSummary.totalTests}
- **Tests with Approval**: ${report.complianceSummary.testsWithApproval}
- **Restraints Triggered**: ${report.complianceSummary.restraintsTriggered}
- **CC Controls Covered**: ${report.complianceSummary.ccControlsCovered.join(', ')}
- **OWASP Categories Tested**: ${report.complianceSummary.owaspCategoriesTested.join(', ')}
- **Data Exposure Risk**: ${report.complianceSummary.dataExposureRisk ? 'Yes' : 'No'}
- **Production Safety**: ${report.complianceSummary.productionSafety ? 'Maintained' : 'Compromised'}

## Recommendations
${report.recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')}

## Critical Decision Timeline
${report.timeline
  .filter(entry => entry.impact === 'high')
  .slice(0, 10)
  .map(entry => `- **${entry.timestamp.toISOString()}**: ${entry.summary} (Confidence: ${(entry.confidence * 100).toFixed(1)}%)`)
  .join('\n')}
`;
  }

  public async exportDecisions(workflowId: string): Promise<AIDecisionLog[]> {
    return this.decisions.get(workflowId) || [];
  }

  public clearWorkflowDecisions(workflowId: string): void {
    this.decisions.delete(workflowId);
  }
}