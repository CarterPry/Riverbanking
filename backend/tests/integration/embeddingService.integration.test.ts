import { EmbeddingService } from '../../src/services/embeddingService';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

describe('EmbeddingService Integration Tests', () => {
  let embeddingService: EmbeddingService;
  let pool: Pool;
  
  beforeAll(async () => {
    // Only run if PG connection is available
    if (!process.env.PG_CONNECTION_STRING) {
      console.log('Skipping integration tests - no PG connection');
      return;
    }
    
    pool = new Pool({
      connectionString: process.env.PG_CONNECTION_STRING,
      max: 1
    });
    
    embeddingService = new EmbeddingService(pool);
    
    // Ensure schema exists
    await pool.query(`
      CREATE SCHEMA IF NOT EXISTS soc2;
      CREATE EXTENSION IF NOT EXISTS vector;
    `).catch(() => {}); // Ignore if already exists
  });
  
  afterAll(async () => {
    if (embeddingService) {
      await embeddingService.close();
    }
    if (pool) {
      await pool.end();
    }
  });
  
  describe('RAG with pgvector', () => {
    it('should generate embedding for text', async () => {
      if (!process.env.PG_CONNECTION_STRING) {
        return;
      }
      
      const text = 'test SQL injection vulnerability';
      const embedding = await embeddingService.getEmbedding(text);
      
      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBeGreaterThan(0);
    });
    
    it('should find similar findings using vector search', async () => {
      if (!process.env.PG_CONNECTION_STRING) {
        return;
      }
      
      // First, store a test finding
      const testFinding = {
        finding_id: 'test-finding-001',
        content: 'SQL injection vulnerability found in login endpoint',
        metadata: {
          severity: 'high',
          finding_type: 'SQL Injection',
          target: 'https://example.com/login'
        }
      };
      
      await embeddingService.storeFinding(testFinding);
      
      // Now search for similar
      const queryEmbedding = await embeddingService.getEmbedding('SQL injection in authentication');
      const similar = await embeddingService.findSimilarFindings(queryEmbedding, 5);
      
      expect(similar).toBeDefined();
      expect(Array.isArray(similar)).toBe(true);
      expect(similar.length).toBeGreaterThan(0);
      
      // Should find our test finding
      const found = similar.find(f => f.finding_id === 'test-finding-001');
      expect(found).toBeDefined();
      expect(found?.content).toContain('SQL injection');
    });
    
    it('should find similar attack patterns', async () => {
      if (!process.env.PG_CONNECTION_STRING) {
        return;
      }
      
      const queryEmbedding = await embeddingService.getEmbedding('authentication bypass attack');
      const similar = await embeddingService.findSimilarAttackPatterns(queryEmbedding, 3);
      
      expect(similar).toBeDefined();
      expect(Array.isArray(similar)).toBe(true);
      // May be empty if no attack patterns are loaded
      if (similar.length > 0) {
        expect(similar[0]).toHaveProperty('attack_name');
        expect(similar[0]).toHaveProperty('tsc');
        expect(similar[0]).toHaveProperty('cc');
      }
    });
    
    it('should generate RAG context combining findings and patterns', async () => {
      if (!process.env.PG_CONNECTION_STRING) {
        return;
      }
      
      const query = 'How to test for SQL injection vulnerabilities?';
      const context = await embeddingService.generateRAGContext(query, {
        includeFinddings: true,
        includeAttackPatterns: true,
        limit: 2
      });
      
      expect(context).toBeDefined();
      expect(typeof context).toBe('string');
      
      // Should contain sections if data exists
      if (context.includes('Relevant historical findings:')) {
        expect(context).toContain('Finding ID:');
      }
      if (context.includes('Relevant attack patterns:')) {
        expect(context).toContain('TSC:');
        expect(context).toContain('CC:');
      }
    });
    
    it('should handle errors gracefully', async () => {
      if (!process.env.PG_CONNECTION_STRING) {
        return;
      }
      
      // Test with invalid embedding
      const invalidEmbedding: number[] = [];
      
      // Should not throw, but return empty results
      const findings = await embeddingService.findSimilarFindings(invalidEmbedding, 5);
      expect(findings).toBeDefined();
      expect(Array.isArray(findings)).toBe(true);
    });
  });
  
  describe('Caching behavior', () => {
    it('should cache embeddings for repeated queries', async () => {
      if (!process.env.PG_CONNECTION_STRING) {
        return;
      }
      
      const text = 'test caching behavior for embeddings';
      
      // First call - generates embedding
      const start1 = Date.now();
      const embedding1 = await embeddingService.getEmbedding(text);
      const duration1 = Date.now() - start1;
      
      // Second call - should use cache
      const start2 = Date.now();
      const embedding2 = await embeddingService.getEmbedding(text);
      const duration2 = Date.now() - start2;
      
      // Cache should be faster
      expect(duration2).toBeLessThan(duration1);
      
      // Should return same embedding
      expect(embedding1).toEqual(embedding2);
    });
  });
}); 