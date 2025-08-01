// backend/src/compliance/validators/coverage.ts
import { attacks } from '../mappings/attack-mapping.js';
import { ccDefinitions, getAllCCCodes } from '../mappings/soc2-controls.js';
import { evidenceRules } from '../mappings/evidence-rules.js';

export interface CoverageValidationResult {
  valid: boolean;
  coverage: {
    totalCC: number;
    coveredCC: number;
    percentage: number;
  };
  missingCC: string[];
  excessiveCC: string[];
  recommendations: string[];
}

export interface WorkflowContext {
  tsc: string[];
  selectedAttacks: string[];
  targetCC?: string[];
  includeOptional?: boolean;
}

/**
 * Validates if the selected attacks provide adequate coverage for the required CC controls
 */
export async function validateCoverage(context: WorkflowContext): Promise<CoverageValidationResult> {
  // Get all CC codes that should be covered based on TSC
  const requiredCC = getRequiredCCForTSC(context.tsc);
  
  // If specific CC codes are targeted, use those instead
  const targetCC = context.targetCC || requiredCC;
  
  // Get CC codes covered by selected attacks
  const coveredCC = new Set<string>();
  const selectedAttackObjects = attacks.filter(a => context.selectedAttacks.includes(a.id));
  
  selectedAttackObjects.forEach(attack => {
    attack.cc.forEach(cc => coveredCC.add(cc));
  });
  
  // Calculate coverage
  const missingCC = targetCC.filter(cc => !coveredCC.has(cc));
  const excessiveCC = Array.from(coveredCC).filter(cc => !targetCC.includes(cc));
  
  const coverage = {
    totalCC: targetCC.length,
    coveredCC: targetCC.filter(cc => coveredCC.has(cc)).length,
    percentage: targetCC.length > 0 
      ? Math.round((targetCC.filter(cc => coveredCC.has(cc)).length / targetCC.length) * 100)
      : 0
  };
  
  // Generate recommendations
  const recommendations = generateRecommendations(missingCC, context);
  
  return {
    valid: missingCC.length === 0 || coverage.percentage >= 80, // 80% threshold
    coverage,
    missingCC,
    excessiveCC,
    recommendations
  };
}

/**
 * Gets required CC codes based on Trust Service Categories
 */
function getRequiredCCForTSC(tsc: string[]): string[] {
  const requiredCC = new Set<string>();
  
  // Security is always required
  if (tsc.includes('Security') || tsc.length === 0) {
    // Core security controls
    ['CC5.1', 'CC5.2', 'CC6.1', 'CC6.2', 'CC6.3', 'CC6.4', 'CC6.6', 'CC7.1', 'CC7.2'].forEach(cc => requiredCC.add(cc));
  }
  
  if (tsc.includes('Availability')) {
    // Availability-specific controls
    ['CC7.3', 'CC7.4', 'CC7.5', 'CC9.1'].forEach(cc => requiredCC.add(cc));
  }
  
  if (tsc.includes('ProcessingIntegrity')) {
    // Processing integrity controls
    ['CC5.1', 'CC5.3', 'CC8.1'].forEach(cc => requiredCC.add(cc));
  }
  
  if (tsc.includes('Confidentiality')) {
    // Confidentiality controls
    ['CC6.1', 'CC6.5', 'CC6.6', 'CC9.2'].forEach(cc => requiredCC.add(cc));
  }
  
  if (tsc.includes('Privacy')) {
    // Privacy controls
    ['CC1.1', 'CC2.3', 'CC3.2', 'CC6.1', 'CC6.4'].forEach(cc => requiredCC.add(cc));
  }
  
  return Array.from(requiredCC);
}

/**
 * Generates recommendations for missing CC coverage
 */
function generateRecommendations(missingCC: string[], context: WorkflowContext): string[] {
  const recommendations: string[] = [];
  
  missingCC.forEach(cc => {
    // Find attacks that could cover this CC
    const potentialAttacks = attacks.filter(a => a.cc.includes(cc) && !context.selectedAttacks.includes(a.id));
    
    if (potentialAttacks.length > 0) {
      // Prioritize by severity and auth requirements
      const sortedAttacks = potentialAttacks.sort((a, b) => {
        // Prefer attacks that don't require auth if not available
        if (!context.includeOptional && a.requiresAuth !== b.requiresAuth) {
          return a.requiresAuth ? 1 : -1;
        }
        // Then sort by severity
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });
      
      const topAttack = sortedAttacks[0];
      recommendations.push(
        `Add "${topAttack.name}" attack to cover ${cc} (${ccDefinitions[cc.split('.')[0]]?.subsections?.[cc]?.description || cc})`
      );
    } else {
      recommendations.push(
        `Manual testing recommended for ${cc} - no automated attack available`
      );
    }
  });
  
  return recommendations;
}

/**
 * Validates if evidence collection meets CC requirements
 */
export function validateEvidenceCollection(
  attackId: string, 
  collectedEvidence: string[]
): { valid: boolean; missing: string[]; details: string } {
  const attack = attacks.find(a => a.id === attackId);
  if (!attack) {
    return { valid: false, missing: [], details: 'Attack not found' };
  }
  
  const missing = attack.evidenceRequired.filter(req => !collectedEvidence.includes(req));
  
  return {
    valid: missing.length === 0,
    missing,
    details: missing.length > 0 
      ? `Missing required evidence: ${missing.join(', ')}`
      : 'All required evidence collected'
  };
}

/**
 * Checks if an attack should be included based on constraints
 */
export function shouldIncludeAttack(
  attackId: string,
  constraints: {
    requiresAuth?: boolean;
    maxSeverity?: 'critical' | 'high' | 'medium' | 'low';
    progressive?: boolean;
    categories?: ('OWASP_TOP_10' | 'CUSTOM')[];
  }
): boolean {
  const attack = attacks.find(a => a.id === attackId);
  if (!attack) return false;
  
  // Check auth requirement
  if (constraints.requiresAuth !== undefined && attack.requiresAuth !== constraints.requiresAuth) {
    return false;
  }
  
  // Check severity
  if (constraints.maxSeverity) {
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    if (severityOrder[attack.severity] > severityOrder[constraints.maxSeverity]) {
      return false;
    }
  }
  
  // Check progressive
  if (constraints.progressive !== undefined && attack.progressive !== constraints.progressive) {
    return false;
  }
  
  // Check categories
  if (constraints.categories && !constraints.categories.includes(attack.category)) {
    return false;
  }
  
  return true;
}