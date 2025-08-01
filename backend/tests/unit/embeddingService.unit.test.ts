// Mock dependencies must be defined before imports
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: jest.fn().mockRejectedValue(new Error('Mock DB error')),
    end: jest.fn()
  }))
}));

jest.mock('axios');

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  },
  logEmbeddingQuery: jest.fn(),
  logEmbeddingGeneration: jest.fn(),
  logDatabaseOperation: jest.fn(),
  logRAGContext: jest.fn()
}));

import { EmbeddingService } from '../../src/services/embeddingService';

describe('EmbeddingService Unit Tests', () => {
  let embeddingService: EmbeddingService;

  beforeAll(() => {
    // Mock environment variables
    process.env.MOCK_EMBEDDINGS = 'true';
    process.env.NODE_ENV = 'development';
    
    embeddingService = new EmbeddingService();
  });

  describe('Mock Embedding Generation', () => {
    it('should generate mock embeddings in development mode', async () => {
      const text = 'Test SQL injection vulnerability';
      const embedding = await embeddingService.getEmbedding(text);

      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(1536); // OpenAI ada-002 dimension
      expect(embedding.every(val => typeof val === 'number')).toBe(true);
      expect(embedding.every(val => val >= 0 && val <= 1)).toBe(true);
    });

    it('should generate consistent mock embeddings for same text', async () => {
      const text = 'Consistent test';
      
      const embedding1 = await embeddingService.getEmbedding(text);
      const embedding2 = await embeddingService.getEmbedding(text);

      expect(embedding1).toEqual(embedding2);
    });

    it('should generate different embeddings for different text', async () => {
      const text1 = 'First text';
      const text2 = 'Completely different text';
      
      const embedding1 = await embeddingService.getEmbedding(text1);
      const embedding2 = await embeddingService.getEmbedding(text2);

      // Embeddings should be different
      const areDifferent = embedding1.some((val, idx) => val !== embedding2[idx]);
      expect(areDifferent).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty text gracefully', async () => {
      const embedding = await embeddingService.getEmbedding('');
      
      expect(embedding).toBeDefined();
      expect(embedding.length).toBe(1536);
    });

    it('should handle very long text', async () => {
      const longText = 'a'.repeat(10000);
      const embedding = await embeddingService.getEmbedding(longText);
      
      expect(embedding).toBeDefined();
      expect(embedding.length).toBe(1536);
    });

    it('should handle special characters', async () => {
      const specialText = '!@#$%^&*()_+-=[]{}|;:"<>,.?/~`';
      const embedding = await embeddingService.getEmbedding(specialText);
      
      expect(embedding).toBeDefined();
      expect(embedding.length).toBe(1536);
    });
  });
}); 