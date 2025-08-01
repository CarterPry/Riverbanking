// backend/tests/unit/layers/intentClassification.unit.test.ts
import { IntentClassifier } from '../../../src/layers/intentClassification';
import { EmbeddingService } from '../../../src/services/embeddingService';

// Mock the embedding service
jest.mock('../../../src/services/embeddingService');

describe('IntentClassifier', () => {
  let classifier: IntentClassifier;
  let mockEmbeddingService: jest.Mocked<EmbeddingService>;
  
  beforeEach(() => {
    mockEmbeddingService = {
      getEmbedding: jest.fn()
    } as any;
    
    classifier = new IntentClassifier(mockEmbeddingService);
  });
  
  describe('classify', () => {
    it('should classify SQL injection intent correctly', async () => {
      // Mock embedding responses
      mockEmbeddingService.getEmbedding.mockResolvedValue(
        new Array(768).fill(0.5) // Mock embedding
      );
      
      const result = await classifier.classify(
        'Test SQL injection vulnerabilities on the login form'
      );
      
      expect(result.intent).toBe('SECURITY_TEST');
      expect(result.extractedEntities.attackTypes).toContain('sql injection');
      expect(result.confidence).toBeGreaterThan(0);
    });
    
    it('should detect authentication context', async () => {
      mockEmbeddingService.getEmbedding.mockResolvedValue(
        new Array(768).fill(0.5)
      );
      
      const result = await classifier.classify(
        'Test XSS after user login in the dashboard'
      );
      
      expect(result.extractedEntities.authContext).toBe(true);
    });
    
    it('should extract target URLs correctly', async () => {
      mockEmbeddingService.getEmbedding.mockResolvedValue(
        new Array(768).fill(0.5)
      );
      
      const result = await classifier.classify(
        'Scan https://example.com for vulnerabilities'
      );
      
      expect(result.extractedEntities.targets).toContain('https://example.com');
    });
    
    it('should classify compliance audit intent', async () => {
      mockEmbeddingService.getEmbedding.mockResolvedValue(
        new Array(768).fill(0.5)
      );
      
      const result = await classifier.classify(
        'Perform SOC2 compliance audit for security controls'
      );
      
      expect(result.intent).toBe('COMPLIANCE_AUDIT');
    });
    
    it('should handle unknown intent', async () => {
      mockEmbeddingService.getEmbedding.mockResolvedValue(
        new Array(768).fill(0.1) // Low similarity
      );
      
      const result = await classifier.classify(
        'Random text without security context'
      );
      
      expect(result.intent).toBe('UNKNOWN');
      expect(result.matchedAttacks.length).toBe(0);
    });
  });
});