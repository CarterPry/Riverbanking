// backend/src/layers/trustClassifier.ts
import { Attack } from '../compliance/mappings/attack-mapping.js';
import { ccDefinitions, getTrustServiceCategories } from '../compliance/mappings/soc2-controls.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('TrustClassifier');

export interface TrustClassificationResult {
  primaryTSC: string[];
  secondaryTSC: string[];
  relevantCC: string[];
  confidence: number;
  rationale: string;
}

export class TrustClassifier {
  async initialize(): Promise<void> {
    logger.info('Trust classifier initialized');
  }
  
  /**
   * Classify attacks and return methodology
   */
  classify(params: { target: string; input: string; attacks: any[] }): { methodology: string; requiresHITL: boolean } {
    // Convert matched attacks to Attack format
    const attacks: Attack[] = params.attacks.map(a => ({
      id: a.attackId,
      name: a.attackName,
      description: a.description,
      tsc: a.tsc,
      cc: a.cc,
      category: 'SECURITY',
      command: []
    }));
    
    const result = this.classifyAttacks(attacks);
    const methodologyResult = this.getRecommendedMethodology(result.primaryTSC);
    
    return {
      methodology: methodologyResult.methodology,
      requiresHITL: methodologyResult.requiresHITL
    };
  }
  
  /**
   * Maps attacks to Trust Service Categories and CC codes
   */
  classifyAttacks(matchedAttacks: Attack[]): TrustClassificationResult {
    logger.debug('Classifying trust categories', { attacks: matchedAttacks.length });
    
    // Aggregate TSC and CC from all matched attacks
    const tscCounts = new Map<string, number>();
    const ccSet = new Set<string>();
    
    matchedAttacks.forEach(attack => {
      // Count TSC occurrences
      attack.tsc.forEach(tsc => {
        tscCounts.set(tsc, (tscCounts.get(tsc) || 0) + 1);
      });
      
      // Collect all CC codes
      attack.cc.forEach(cc => ccSet.add(cc));
    });
    
    // Sort TSC by frequency
    const sortedTSC = Array.from(tscCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tsc]) => tsc);
    
    // Determine primary and secondary TSC
    const primaryTSC = sortedTSC.slice(0, 2); // Top 2
    const secondaryTSC = sortedTSC.slice(2); // Rest
    
    // Always include Security if any attacks are matched
    if (matchedAttacks.length > 0 && !primaryTSC.includes('Security')) {
      primaryTSC.unshift('Security');
    }
    
    // Calculate confidence based on consistency
    const totalAttacks = matchedAttacks.length;
    const maxTSCCount = Math.max(...tscCounts.values());
    const confidence = totalAttacks > 0 ? maxTSCCount / totalAttacks : 0;
    
    // Generate rationale
    const rationale = this.generateRationale(matchedAttacks, primaryTSC, Array.from(ccSet));
    
    const result = {
      primaryTSC,
      secondaryTSC,
      relevantCC: Array.from(ccSet).sort(),
      confidence,
      rationale
    };
    
    logger.info('Trust classification complete', {
      primaryTSC,
      ccCount: result.relevantCC.length,
      confidence
    });
    
    return result;
  }
  
  /**
   * Generate human-readable rationale for classification
   */
  private generateRationale(attacks: Attack[], tsc: string[], cc: string[]): string {
    if (attacks.length === 0) {
      return 'No specific attacks identified. General security assessment recommended.';
    }
    
    const attackNames = attacks.slice(0, 3).map(a => a.name).join(', ');
    const remainingCount = attacks.length - 3;
    const attackSummary = remainingCount > 0 
      ? `${attackNames}, and ${remainingCount} more`
      : attackNames;
    
    let rationale = `Based on identified attacks (${attackSummary}), `;
    rationale += `the assessment will focus on ${tsc.join(' and ')} trust categories. `;
    
    // Add CC-specific context
    const ccGroups = this.groupCCBySeries(cc);
    const ccSummary = Object.entries(ccGroups)
      .map(([series, codes]) => `${series} (${codes.length} controls)`)
      .join(', ');
    
    rationale += `This covers Common Criteria: ${ccSummary}, `;
    rationale += `addressing ${cc.length} specific control objectives.`;
    
    return rationale;
  }
  
  /**
   * Group CC codes by series (CC1, CC2, etc.)
   */
  private groupCCBySeries(ccCodes: string[]): { [series: string]: string[] } {
    const groups: { [series: string]: string[] } = {};
    
    ccCodes.forEach(code => {
      const series = code.split('.')[0];
      if (!groups[series]) {
        groups[series] = [];
      }
      groups[series].push(code);
    });
    
    return groups;
  }
  
  /**
   * Get recommended methodology based on TSC
   */
  getRecommendedMethodology(tsc: string[]): {
    methodology: string;
    priority: 'comprehensive' | 'standard' | 'quick';
    estimatedDuration: number; // minutes
  } {
    // If multiple critical TSC, recommend comprehensive
    if (tsc.length > 2 || tsc.includes('Privacy')) {
      return {
        methodology: 'comprehensive',
        priority: 'comprehensive',
        estimatedDuration: 240
      };
    }
    
    // If only Security, can do standard
    if (tsc.length === 1 && tsc[0] === 'Security') {
      return {
        methodology: 'security-focused',
        priority: 'standard',
        estimatedDuration: 120
      };
    }
    
    // Quick scan for basic assessment
    return {
      methodology: 'quick-scan',
      priority: 'quick',
      estimatedDuration: 60
    };
  }
  
  /**
   * Validate if selected attacks adequately cover TSC requirements
   */
  validateCoverage(attacks: Attack[], requiredTSC: string[]): {
    adequate: boolean;
    missing: string[];
    coverage: { [tsc: string]: number };
  } {
    const coverage: { [tsc: string]: number } = {};
    
    // Initialize coverage
    requiredTSC.forEach(tsc => {
      coverage[tsc] = 0;
    });
    
    // Count attacks per TSC
    attacks.forEach(attack => {
      attack.tsc.forEach(tsc => {
        if (coverage[tsc] !== undefined) {
          coverage[tsc]++;
        }
      });
    });
    
    // Find TSC with no coverage
    const missing = requiredTSC.filter(tsc => coverage[tsc] === 0);
    
    // Adequate if all TSC have at least 2 attacks
    const adequate = missing.length === 0 && 
      Object.values(coverage).every(count => count >= 2);
    
    return { adequate, missing, coverage };
  }
}