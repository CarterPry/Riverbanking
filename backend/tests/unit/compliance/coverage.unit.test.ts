// backend/tests/unit/compliance/coverage.unit.test.ts
import { validateCoverage, validateEvidenceCollection, shouldIncludeAttack } from '../../../src/compliance/validators/coverage';
import { attacks } from '../../../src/compliance/mappings/attack-mapping';

describe('Coverage Validator', () => {
  describe('validateCoverage', () => {
    it('should validate adequate CC coverage for Security TSC', async () => {
      const context = {
        tsc: ['Security'],
        selectedAttacks: ['sql-injection', 'broken-access-control', 'crypto-failures', 'xss'],
        authenticated: true
      };
      
      const result = await validateCoverage(context);
      
      expect(result.valid).toBe(true);
      expect(result.coverage.percentage).toBeGreaterThan(70);
      expect(result.missingCC.length).toBeLessThan(3);
    });
    
    it('should identify missing CC coverage', async () => {
      const context = {
        tsc: ['Security'],
        selectedAttacks: ['port-scanning'], // Only one low-coverage attack
        authenticated: false
      };
      
      const result = await validateCoverage(context);
      
      expect(result.valid).toBe(false);
      expect(result.missingCC.length).toBeGreaterThan(5);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
    
    it('should provide recommendations for missing coverage', async () => {
      const context = {
        tsc: ['Security'],
        selectedAttacks: [],
        targetCC: ['CC6.1', 'CC7.1']
      };
      
      const result = await validateCoverage(context);
      
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations[0]).toContain('Add');
      expect(result.recommendations[0]).toContain('to cover CC');
    });
  });
  
  describe('validateEvidenceCollection', () => {
    it('should validate complete evidence collection', () => {
      const attackId = 'sql-injection';
      const collected = ['sql_payloads', 'db_dumps', 'injection_logs'];
      
      const result = validateEvidenceCollection(attackId, collected);
      
      expect(result.valid).toBe(true);
      expect(result.missing.length).toBe(0);
    });
    
    it('should identify missing evidence', () => {
      const attackId = 'sql-injection';
      const collected = ['sql_payloads']; // Missing db_dumps and injection_logs
      
      const result = validateEvidenceCollection(attackId, collected);
      
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('db_dumps');
      expect(result.missing).toContain('injection_logs');
    });
  });
  
  describe('shouldIncludeAttack', () => {
    it('should filter by authentication requirement', () => {
      const constraints = { requiresAuth: false };
      
      const noAuthAttack = shouldIncludeAttack('port-scanning', constraints);
      const authAttack = shouldIncludeAttack('sql-injection', constraints);
      
      expect(noAuthAttack).toBe(true);
      expect(authAttack).toBe(false);
    });
    
    it('should filter by severity', () => {
      const constraints = { maxSeverity: 'medium' as const };
      
      const mediumAttack = shouldIncludeAttack('clickjacking', constraints);
      const criticalAttack = shouldIncludeAttack('sql-injection', constraints);
      
      expect(mediumAttack).toBe(true);
      expect(criticalAttack).toBe(false);
    });
    
    it('should filter by category', () => {
      const constraints = { categories: ['OWASP_TOP_10' as const] };
      
      const owaspAttack = shouldIncludeAttack('sql-injection', constraints);
      const customAttack = shouldIncludeAttack('clickjacking', constraints);
      
      expect(owaspAttack).toBe(true);
      expect(customAttack).toBe(false);
    });
  });
});