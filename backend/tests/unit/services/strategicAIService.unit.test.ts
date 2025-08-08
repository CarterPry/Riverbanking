import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { StrategicAIService } from '../../../src/services/strategicAIService';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/utils/logger');
jest.mock('@anthropic-ai/sdk');

describe('StrategicAIService - Exhaustive Testing', () => {
  let service: StrategicAIService;
  let mockAnthropic: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Anthropic client
    mockAnthropic = {
      messages: {
        create: jest.fn()
      }
    };
    
    // Create service instance with mocked dependencies
    service = new StrategicAIService();
    (service as any).anthropic = mockAnthropic;
  });

  describe('Exhaustive Subdomain Handling', () => {
    it('should plan individual tests for each subdomain', async () => {
      const mockResponse = {
        content: [{
          text: JSON.stringify({
            phase: 'recon',
            reasoning: 'Found subdomains: sub1.example.com, sub2.example.com, sub3.example.com. Planning exhaustive testing...',
            recommendations: [
              {
                id: 'dir-1',
                tool: 'directory-bruteforce',
                purpose: 'Brute force directories on sub1.example.com',
                parameters: { 
                  target: 'https://sub1.example.com',
                  wordlist: '/seclists/Discovery/Web-Content/common.txt'
                },
                owaspCategory: 'A01:2021',
                priority: 'high',
                safetyChecks: ['rate-limiting']
              },
              {
                id: 'dir-2',
                tool: 'directory-bruteforce',
                purpose: 'Brute force directories on sub2.example.com',
                parameters: { 
                  target: 'https://sub2.example.com',
                  wordlist: '/seclists/Discovery/Web-Content/common.txt'
                },
                owaspCategory: 'A01:2021',
                priority: 'high',
                safetyChecks: ['rate-limiting']
              },
              {
                id: 'dir-3',
                tool: 'directory-bruteforce',
                purpose: 'Brute force directories on sub3.example.com',
                parameters: { 
                  target: 'https://sub3.example.com',
                  wordlist: '/seclists/Discovery/Web-Content/common.txt'
                },
                owaspCategory: 'A01:2021',
                priority: 'high',
                safetyChecks: ['rate-limiting']
              }
            ],
            confidenceLevel: 0.9,
            expectedOutcomes: [],
            nextPhaseConditions: ['directories_found'],
            estimatedDuration: 30,
            safetyConsiderations: ['Rate limited']
          })
        }]
      };

      mockAnthropic.messages.create.mockResolvedValue(mockResponse);

      const context = {
        target: 'https://example.com',
        phase: 'recon' as const,
        userIntent: 'Test all subdomains exhaustively',
        findings: [{
          type: 'subdomain',
          subdomains: ['sub1.example.com', 'sub2.example.com', 'sub3.example.com']
        }],
        constraints: {
          exhaustiveMode: true,
          useSecListsWordlists: true
        }
      };

      const plan = await service.planStrategy('test-workflow', context);

      // Verify exhaustive subdomain handling
      expect(plan.recommendations.length).toBeGreaterThanOrEqual(3);
      expect(plan.reasoning).toContain('sub1');
      expect(plan.reasoning).toContain('sub2');
      expect(plan.reasoning).toContain('sub3');
      
      // Check that each subdomain has its own test
      const subdomainTests = plan.recommendations.filter(r => 
        r.tool === 'directory-bruteforce'
      );
      expect(subdomainTests.length).toBe(3);
      
      // Verify SecLists wordlists are used
      subdomainTests.forEach(test => {
        expect(test.parameters.wordlist).toContain('/seclists/');
      });
    });

    it('should use appropriate SecLists wordlists based on context', async () => {
      const mockResponse = {
        content: [{
          text: JSON.stringify({
            phase: 'recon',
            reasoning: 'API subdomain detected, using API-specific wordlists',
            recommendations: [
              {
                id: 'api-dir',
                tool: 'directory-bruteforce',
                purpose: 'API endpoint discovery',
                parameters: { 
                  target: 'https://api.example.com',
                  wordlist: '/seclists/Discovery/Web-Content/api/api-endpoints-mazen160.txt'
                },
                owaspCategory: 'A01:2021',
                priority: 'critical',
                safetyChecks: ['rate-limiting']
              }
            ],
            confidenceLevel: 0.95,
            expectedOutcomes: [],
            nextPhaseConditions: ['api_endpoints_found'],
            estimatedDuration: 15,
            safetyConsiderations: ['Rate limited']
          })
        }]
      };

      mockAnthropic.messages.create.mockResolvedValue(mockResponse);

      const context = {
        target: 'https://api.example.com',
        phase: 'recon' as const,
        userIntent: 'Find API endpoints',
        findings: [],
        constraints: {
          useSecListsWordlists: true
        }
      };

      const plan = await service.planStrategy('test-workflow', context);

      // Verify API-specific wordlist is used
      const apiTest = plan.recommendations.find(r => 
        r.parameters.wordlist?.includes('api-endpoints')
      );
      expect(apiTest).toBeDefined();
      expect(apiTest?.parameters.wordlist).toContain('/seclists/Discovery/Web-Content/api/');
    });

    it('should validate tool safety and reject destructive tools', async () => {
      const mockResponse = {
        content: [{
          text: JSON.stringify({
            phase: 'exploit',
            reasoning: 'Attempting destructive action',
            recommendations: [
              {
                id: 'bad-1',
                tool: 'rm-tool',
                purpose: 'Delete files',
                parameters: { command: 'rm -rf /' },
                priority: 'high'
              }
            ],
            confidenceLevel: 0.8,
            expectedOutcomes: [],
            nextPhaseConditions: [],
            estimatedDuration: 5,
            safetyConsiderations: []
          })
        }]
      };

      mockAnthropic.messages.create.mockResolvedValue(mockResponse);

      const context = {
        target: 'https://example.com',
        phase: 'exploit' as const,
        userIntent: 'Delete everything',
        findings: [],
        constraints: {}
      };

      const plan = await service.planStrategy('test-workflow', context);

      // Should fallback to safe strategy
      expect(logger.error).toHaveBeenCalledWith(
        'Unsafe strategy detected', 
        expect.any(Object)
      );
      expect(plan.phase).toBe('recon');
      expect(plan.reasoning).toContain('fallback');
      expect(plan.recommendations[0].tool).toBe('subdomain-scanner');
    });

    it('should handle low confidence with appropriate warnings', async () => {
      const mockResponse = {
        content: [{
          text: JSON.stringify({
            phase: 'recon',
            reasoning: 'Uncertain about approach',
            recommendations: [{
              id: 'low-conf-1',
              tool: 'subdomain-scanner',
              purpose: 'Basic recon',
              parameters: { target: 'example.com' },
              priority: 'low'
            }],
            confidenceLevel: 0.5, // Low confidence
            expectedOutcomes: [],
            nextPhaseConditions: [],
            estimatedDuration: 10,
            safetyConsiderations: []
          })
        }]
      };

      mockAnthropic.messages.create.mockResolvedValue(mockResponse);

      const context = {
        target: 'https://example.com',
        phase: 'recon' as const,
        userIntent: 'Vague request',
        findings: [],
        constraints: {}
      };

      await service.planStrategy('test-workflow', context);

      // Should warn about low confidence
      expect(logger.warn).toHaveBeenCalledWith(
        'Low confidence strategy detected',
        expect.objectContaining({
          confidence: 0.5,
          phase: 'recon'
        })
      );
    });

    it('should filter recommendations requiring auth when no auth provided', async () => {
      const mockResponse = {
        content: [{
          text: JSON.stringify({
            phase: 'analyze',
            reasoning: 'Need authenticated testing',
            recommendations: [
              {
                id: 'auth-1',
                tool: 'auth-tester',
                purpose: 'Test authentication',
                parameters: { target: 'https://example.com/admin' },
                priority: 'high',
                requiresAuth: true
              },
              {
                id: 'no-auth-1',
                tool: 'header-analyzer',
                purpose: 'Analyze headers',
                parameters: { target: 'https://example.com' },
                priority: 'medium',
                requiresAuth: false
              }
            ],
            confidenceLevel: 0.85,
            expectedOutcomes: [],
            nextPhaseConditions: [],
            estimatedDuration: 20,
            safetyConsiderations: []
          })
        }]
      };

      mockAnthropic.messages.create.mockResolvedValue(mockResponse);

      const context = {
        target: 'https://example.com',
        phase: 'analyze' as const,
        userIntent: 'Test authentication',
        findings: [],
        constraints: {},
        auth: undefined // No auth provided
      };

      const plan = await service.planStrategy('test-workflow', context);

      // Should filter out auth-required recommendation
      expect(plan.recommendations.length).toBe(1);
      expect(plan.recommendations[0].tool).toBe('header-analyzer');
      expect(logger.info).toHaveBeenCalledWith(
        'Tool requires authentication',
        expect.objectContaining({
          tool: 'auth-tester',
          action: 'queuing for HITL approval'
        })
      );
    });
  });
});
