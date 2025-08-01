// backend/src/layers/contextEnrichment.ts
import { Attack } from '../compliance/mappings/attack-mapping.js';
import { EmbeddingService } from '../services/embeddingService.js';
import { generateGroundingContext, checkViolation } from '../compliance/requirements.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ContextEnrichment');

export interface EnrichmentContext {
  userInput: string;
  matchedAttacks: Attack[];
  tsc: string[];
  cc: string[];
  authenticated: boolean;
  ragContext?: string;
  historicalFindings?: any[];
}

export interface EnrichedContext {
  viableAttacks: {
    critical: Attack[];
    standard: Attack[];
    lowPriority: Attack[];
  };
  filteredAttacks: {
    attacks: Attack[];
    reason: string;
  }[];
  ragContext: string;
  historicalContext: string;
  groundingContext: string;
  requiresHITL: boolean;
  hitlReasons: string[];
  estimatedDuration: number;
  estimatedCost: number;
}

export class ContextEnrichment {
  private embeddingService: EmbeddingService;
  
  constructor(embeddingService: EmbeddingService) {
    this.embeddingService = embeddingService;
  }
  
  /**
   * Enrich context with historical data, RAG, and apply restraints
   */
  async enrich(context: EnrichmentContext): Promise<EnrichedContext> {
    logger.debug('Enriching context', {
      attacks: context.matchedAttacks.length,
      authenticated: context.authenticated
    });
    
    // Generate RAG context from similar historical findings
    const ragContext = await this.generateRAGContext(context);
    
    // Build historical context
    const historicalContext = this.buildHistoricalContext(context.historicalFindings);
    
    // Generate grounding context for restraint
    const groundingContext = generateGroundingContext(context.tsc, context.cc);
    
    // Apply authentication-based filtering
    const { viable, filtered } = this.applyAuthFilter(
      context.matchedAttacks,
      context.authenticated
    );
    
    // Categorize viable attacks by priority
    const categorized = this.categorizeAttacks(viable);
    
    // Check if HITL is required
    const { requiresHITL, reasons } = this.checkHITLRequirement(
      categorized,
      context.authenticated
    );
    
    // Estimate duration and cost
    const { duration, cost } = this.estimateExecutionMetrics(categorized);
    
    const result: EnrichedContext = {
      viableAttacks: categorized,
      filteredAttacks: filtered,
      ragContext,
      historicalContext,
      groundingContext,
      requiresHITL,
      hitlReasons: reasons,
      estimatedDuration: duration,
      estimatedCost: cost
    };
    
    logger.info('Context enrichment complete', {
      viableTotal: viable.length,
      filteredTotal: filtered.length,
      requiresHITL,
      estimatedDuration: duration
    });
    
    return result;
  }
  
  /**
   * Generate RAG context from historical data using embeddings
   */
  private async generateRAGContext(context: EnrichmentContext): Promise<string> {
    try {
      // Generate embedding for the user input
      const queryEmbedding = await this.embeddingService.getEmbedding(context.userInput);
      
      // Find similar historical findings
      const similarFindings = await this.embeddingService.findSimilarFindings(queryEmbedding, 5);
      
      // Find similar attack patterns
      const similarAttacks = await this.embeddingService.findSimilarAttackPatterns(queryEmbedding, 3);
      
      let ragContext = 'Historical Context:\n';
      
      if (similarFindings.length > 0) {
        ragContext += '\nSimilar Previous Findings:\n';
        similarFindings.forEach((finding, idx) => {
          const metadata = finding.metadata || {};
          ragContext += `${idx + 1}. ${metadata.finding_type || 'Unknown'} - ${finding.content}\n`;
          if (metadata.severity) ragContext += `   Severity: ${metadata.severity}\n`;
        });
      }
      
      if (similarAttacks.length > 0) {
        ragContext += '\nRelevant Attack Patterns:\n';
        similarAttacks.forEach((pattern, idx) => {
          ragContext += `${idx + 1}. ${pattern.attack_name}: ${pattern.description}\n`;
          ragContext += `   TSC: ${pattern.tsc.join(', ')}, CC: ${pattern.cc.join(', ')}\n`;
        });
      }
      
      return ragContext;
    } catch (error) {
      logger.warn('Failed to generate RAG context', { error });
      return 'No historical context available.';
    }
  }
  
  /**
   * Build context from historical findings
   */
  private buildHistoricalContext(findings?: any[]): string {
    if (!findings || findings.length === 0) {
      return 'No previous findings for this target.';
    }
    
    let context = 'Previous Assessment Summary:\n';
    
    // Group findings by severity
    const bySeverity = findings.reduce((acc, finding) => {
      const severity = finding.severity || 'info';
      if (!acc[severity]) acc[severity] = [];
      acc[severity].push(finding);
      return acc;
    }, {} as Record<string, any[]>);
    
    Object.entries(bySeverity).forEach(([severity, items]) => {
      context += `- ${severity.toUpperCase()}: ${(items as any[]).length} findings\n`;
    });
    
    // Add recent critical findings
    const recentCritical = findings
      .filter(f => f.severity === 'critical')
      .slice(0, 3);
    
    if (recentCritical.length > 0) {
      context += '\nRecent Critical Findings:\n';
      recentCritical.forEach(finding => {
        context += `- ${finding.finding_type}: ${finding.description}\n`;
      });
    }
    
    return context;
  }
  
  /**
   * Apply authentication-based filtering with restraint
   */
  private applyAuthFilter(
    attacks: Attack[],
    authenticated: boolean
  ): {
    viable: Attack[];
    filtered: { attacks: Attack[]; reason: string }[];
  } {
    const viable: Attack[] = [];
    const filtered: { attacks: Attack[]; reason: string }[] = [];
    
    const authRequired: Attack[] = [];
    const destructive: Attack[] = [];
    
    attacks.forEach(attack => {
      // Check authentication requirement
      if (attack.requiresAuth && !authenticated) {
        authRequired.push(attack);
        return;
      }
      
      // Check for potentially destructive actions
      const violationCheck = checkViolation(attack.name, ['Security']);
      if (violationCheck.violates) {
        destructive.push(attack);
        return;
      }
      
      viable.push(attack);
    });
    
    // Group filtered attacks
    if (authRequired.length > 0) {
      filtered.push({
        attacks: authRequired,
        reason: 'Requires authentication - these attacks need authenticated session'
      });
    }
    
    if (destructive.length > 0) {
      filtered.push({
        attacks: destructive,
        reason: 'Potentially destructive - requires explicit approval'
      });
    }
    
    return { viable, filtered };
  }
  
  /**
   * Categorize attacks by priority
   */
  private categorizeAttacks(attacks: Attack[]): EnrichedContext['viableAttacks'] {
    const critical: Attack[] = [];
    const standard: Attack[] = [];
    const lowPriority: Attack[] = [];
    
    attacks.forEach(attack => {
      // Critical: High severity OWASP attacks or access control issues
      if (
        attack.severity === 'critical' ||
        (attack.severity === 'high' && attack.category === 'OWASP_TOP_10')
      ) {
        critical.push(attack);
      }
      // Low priority: Informational or low severity custom attacks
      else if (
        attack.severity === 'low' ||
        (attack.category === 'CUSTOM' && !attack.progressive)
      ) {
        lowPriority.push(attack);
      }
      // Standard: Everything else
      else {
        standard.push(attack);
      }
    });
    
    return { critical, standard, lowPriority };
  }
  
  /**
   * Check if Human-in-the-Loop approval is required
   */
  private checkHITLRequirement(
    categorized: EnrichedContext['viableAttacks'],
    authenticated: boolean
  ): { requiresHITL: boolean; reasons: string[] } {
    const reasons: string[] = [];
    
    // Critical attacks always require HITL
    if (categorized.critical.length > 0) {
      reasons.push(`${categorized.critical.length} critical severity attacks require approval`);
    }
    
    // Unauthenticated with many attacks
    if (!authenticated && (categorized.standard.length + categorized.critical.length) > 5) {
      reasons.push('Large number of attacks without authentication requires approval');
    }
    
    // Attacks targeting sensitive CC codes
    const sensitiveCC = ['CC1.1', 'CC1.2', 'CC6.5', 'CC9.1']; // Governance and physical security
    const hasSensitive = [...categorized.critical, ...categorized.standard].some(
      attack => attack.cc.some(cc => sensitiveCC.includes(cc))
    );
    
    if (hasSensitive) {
      reasons.push('Attacks targeting sensitive control areas require approval');
    }
    
    // Any progressive attacks without auth
    const progressiveNoAuth = [...categorized.critical, ...categorized.standard].some(
      attack => attack.progressive && attack.requiresAuth && !authenticated
    );
    
    if (progressiveNoAuth) {
      reasons.push('Progressive attacks requiring authentication need approval when unauthenticated');
    }
    
    return {
      requiresHITL: reasons.length > 0,
      reasons
    };
  }
  
  /**
   * Estimate execution duration and cost
   */
  private estimateExecutionMetrics(
    categorized: EnrichedContext['viableAttacks']
  ): { duration: number; cost: number } {
    let totalDuration = 0;
    let totalCost = 0;
    
    // Duration estimates (minutes)
    const durationMap = {
      critical: 30,
      standard: 15,
      lowPriority: 5
    };
    
    // Cost estimates (relative units)
    const costMap = {
      critical: 10,
      standard: 5,
      lowPriority: 1
    };
    
    totalDuration += categorized.critical.length * durationMap.critical;
    totalDuration += categorized.standard.length * durationMap.standard;
    totalDuration += categorized.lowPriority.length * durationMap.lowPriority;
    
    totalCost += categorized.critical.length * costMap.critical;
    totalCost += categorized.standard.length * costMap.standard;
    totalCost += categorized.lowPriority.length * costMap.lowPriority;
    
    // Add overhead for coordination
    if (categorized.critical.length + categorized.standard.length > 10) {
      totalDuration += 30; // 30 minutes overhead
      totalCost += 5;
    }
    
    return {
      duration: totalDuration,
      cost: totalCost
    };
  }
}