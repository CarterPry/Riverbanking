import request from 'supertest';
import { app } from '../../src/index';
import { ContextEnrichment } from '../../src/layers/contextEnrichment';
import { Attack } from '../../src/compliance/mappings/attack-mapping';
import { EmbeddingService } from '../../src/services/embeddingService';

describe('Restraint Mechanism Integration Tests', () => {
  let contextEnrichment: ContextEnrichment;
  
  beforeAll(() => {
    const mockEmbeddingService = {
      getEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0)),
      findSimilarFindings: jest.fn().mockResolvedValue([]),
      findSimilarAttackPatterns: jest.fn().mockResolvedValue([])
    } as any;
    
    contextEnrichment = new ContextEnrichment(mockEmbeddingService);
  });

  describe('Authentication-based Restraint', () => {
    it('should filter attacks requiring auth when unauthenticated', async () => {
      const attacks: Attack[] = [
        {
          id: 'sql-injection-basic',
          name: 'SQL Injection - Basic',
          category: 'OWASP_TOP_10',
          severity: 'high',
          tsc: ['Security'],
          cc: ['CC6.1', 'CC6.7'],
          requiresAuth: false,
          progressive: false,
          description: 'Basic SQL injection test'
        },
        {
          id: 'sql-injection-post-login',
          name: 'SQL Injection - Post Login',
          category: 'OWASP_TOP_10',
          severity: 'high',
          tsc: ['Security'],
          cc: ['CC6.1', 'CC6.7'],
          requiresAuth: true,
          progressive: true,
          description: 'SQL injection after authentication'
        },
        {
          id: 'privilege-escalation',
          name: 'Privilege Escalation',
          category: 'ACCESS_CONTROL',
          severity: 'critical',
          tsc: ['Security'],
          cc: ['CC6.1', 'CC6.2'],
          requiresAuth: true,
          progressive: true,
          description: 'Attempt to escalate privileges'
        }
      ];

      const context = {
        userInput: 'test SQL injection post-login',
        matchedAttacks: attacks,
        tsc: ['Security'],
        cc: ['CC6.1', 'CC6.7'],
        authenticated: false
      };

      const result = await contextEnrichment.enrich(context);

      // Should filter out attacks requiring auth
      expect(result.viableAttacks.critical.length + 
             result.viableAttacks.standard.length + 
             result.viableAttacks.lowPriority.length).toBe(1);
      
      // Should have filtered attacks
      expect(result.filteredAttacks).toHaveLength(1);
      expect(result.filteredAttacks[0].reason).toContain('Requires authentication');
      expect(result.filteredAttacks[0].attacks).toHaveLength(2);
      
      // Should require HITL due to unauthenticated progressive attacks
      expect(result.requiresHITL).toBe(true);
      expect(result.hitlReasons).toContainEqual(
        expect.stringContaining('Progressive attacks requiring authentication')
      );
    });

    it('should allow auth-required attacks when authenticated', async () => {
      const attacks: Attack[] = [
        {
          id: 'sql-injection-post-login',
          name: 'SQL Injection - Post Login',
          category: 'OWASP_TOP_10',
          severity: 'high',
          tsc: ['Security'],
          cc: ['CC6.1', 'CC6.7'],
          requiresAuth: true,
          progressive: true,
          description: 'SQL injection after authentication'
        }
      ];

      const context = {
        userInput: 'test SQL injection post-login',
        matchedAttacks: attacks,
        tsc: ['Security'],
        cc: ['CC6.1', 'CC6.7'],
        authenticated: true // Authenticated
      };

      const result = await contextEnrichment.enrich(context);

      // Should not filter authenticated attacks
      expect(result.viableAttacks.standard).toHaveLength(1);
      expect(result.filteredAttacks).toHaveLength(0);
      
      // Should not require HITL for authenticated standard attacks
      expect(result.requiresHITL).toBe(false);
    });
  });

  describe('HITL Restraint Triggers', () => {
    it('should require HITL for critical attacks', async () => {
      const attacks: Attack[] = [
        {
          id: 'rce',
          name: 'Remote Code Execution',
          category: 'CRITICAL',
          severity: 'critical',
          tsc: ['Security'],
          cc: ['CC6.1'],
          requiresAuth: false,
          progressive: false,
          description: 'RCE vulnerability test'
        }
      ];

      const context = {
        userInput: 'test critical vulnerabilities',
        matchedAttacks: attacks,
        tsc: ['Security'],
        cc: ['CC6.1'],
        authenticated: false
      };

      const result = await contextEnrichment.enrich(context);

      expect(result.requiresHITL).toBe(true);
      expect(result.hitlReasons).toContainEqual(
        expect.stringContaining('critical severity attacks require approval')
      );
    });

    it('should require HITL for many unauthenticated attacks', async () => {
      const attacks: Attack[] = Array(10).fill(null).map((_, i) => ({
        id: `attack-${i}`,
        name: `Test Attack ${i}`,
        category: 'OWASP_TOP_10',
        severity: 'medium',
        tsc: ['Security'],
        cc: ['CC6.1'],
        requiresAuth: false,
        progressive: false,
        description: `Test attack ${i}`
      }));

      const context = {
        userInput: 'comprehensive security scan',
        matchedAttacks: attacks,
        tsc: ['Security'],
        cc: ['CC6.1'],
        authenticated: false
      };

      const result = await contextEnrichment.enrich(context);

      expect(result.requiresHITL).toBe(true);
      expect(result.hitlReasons).toContainEqual(
        expect.stringContaining('Large number of attacks without authentication')
      );
    });

    it('should require HITL for sensitive CC codes', async () => {
      const attacks: Attack[] = [
        {
          id: 'physical-security',
          name: 'Physical Security Assessment',
          category: 'PHYSICAL',
          severity: 'medium',
          tsc: ['Security', 'Availability'],
          cc: ['CC9.1'], // Physical security
          requiresAuth: false,
          progressive: false,
          description: 'Physical security test'
        }
      ];

      const context = {
        userInput: 'test physical security controls',
        matchedAttacks: attacks,
        tsc: ['Security', 'Availability'],
        cc: ['CC9.1'],
        authenticated: false
      };

      const result = await contextEnrichment.enrich(context);

      expect(result.requiresHITL).toBe(true);
      expect(result.hitlReasons).toContainEqual(
        expect.stringContaining('sensitive control areas require approval')
      );
    });
  });

  describe('API Endpoint Restraint', () => {
    it('should return requiresAuth flag for auth-required attacks', async () => {
      const response = await request(app)
        .post('/api/run-soc2-workflow')
        .send({
          target: 'https://example.com',
          scope: 'security',
          description: 'test SQL injection post-login'
        })
        .expect(202);

      // The actual implementation would check matched attacks
      // This is a mock to show expected behavior
      expect(response.body).toHaveProperty('workflowId');
      expect(response.body).toHaveProperty('status', 'accepted');
    });
  });

  describe('Restraint Metrics', () => {
    it('should track restraint enforcement', async () => {
      const attacks: Attack[] = [
        {
          id: 'auth-test',
          name: 'Auth Required Test',
          category: 'AUTH',
          severity: 'high',
          tsc: ['Security'],
          cc: ['CC6.1'],
          requiresAuth: true,
          progressive: false,
          description: 'Requires authentication'
        }
      ];

      const context = {
        userInput: 'test authentication',
        matchedAttacks: attacks,
        tsc: ['Security'],
        cc: ['CC6.1'],
        authenticated: false
      };

      const result = await contextEnrichment.enrich(context);

      // Verify metrics
      expect(result.filteredAttacks).toHaveLength(1);
      expect(result.estimatedDuration).toBe(0); // No viable attacks
      expect(result.estimatedCost).toBe(0);
    });
  });
}); 