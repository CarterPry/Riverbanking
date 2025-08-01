import { Pool } from 'pg';
import axios from 'axios';
import dotenv from 'dotenv';
import logger, { 
  logEmbeddingQuery, 
  logEmbeddingGeneration, 
  logDatabaseOperation, 
  logRAGContext 
} from '../utils/logger.js';
import { cosineSimilarity } from '../utils/cosineSimilarity.js';
import * as groundingService from './groundingService.js';

dotenv.config();

interface EmbeddingConfig {
  embeddingApiUrl: string;
  modelName: string;
  maxRetries: number;
  cacheResults: boolean;
}

interface FindingEmbedding {
  id: string;
  finding_id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
  created_at: Date;
}

interface AttackPattern {
  attack_id: string;
  attack_name: string;
  description: string;
  embedding: number[];
  tsc: string[];
  cc: string[];
}

export class EmbeddingService {
  private pool: Pool;
  private config: EmbeddingConfig;

  constructor(pool?: Pool) {
    this.pool = pool || new Pool({
      connectionString: process.env.PG_CONNECTION_STRING
    });

    this.config = {
      embeddingApiUrl: process.env.EMBEDDING_API_URL || 'https://api.openai.com/v1/embeddings',
      modelName: 'text-embedding-ada-002',
      maxRetries: 3,
      cacheResults: true
    };
  }

  /**
   * Generate embedding for given text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Determine if using OpenAI
      const isOpenAI = this.config.embeddingApiUrl.includes('openai.com');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      
      if (isOpenAI && process.env.OPENAI_API_KEY) {
        headers['Authorization'] = `Bearer ${process.env.OPENAI_API_KEY}`;
      }

      // OpenAI expects 'input' and 'model', Ollama expects 'prompt' and 'model'
      const data = isOpenAI
        ? { input: text, model: this.config.modelName }
        : { model: this.config.modelName, prompt: text };

      const response = await axios.post(this.config.embeddingApiUrl, data, {
        timeout: 30000,
        headers
      });

      // OpenAI: response.data.data[0].embedding, Ollama: response.data.embedding
      if (isOpenAI && response.data?.data && Array.isArray(response.data.data) && response.data.data[0]?.embedding) {
        return response.data.data[0].embedding;
      }
      
      if (!isOpenAI && response.data?.embedding && Array.isArray(response.data.embedding)) {
        return response.data.embedding;
      }

      throw new Error('Invalid embedding response');

    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error('Embedding API error', {
          status: error.response?.status,
          message: error.message
        });
      }
      
      // Return mock embedding for development
      if (process.env.NODE_ENV === 'development' || process.env.MOCK_EMBEDDINGS === 'true') {
        logger.warn('Using mock embedding');
        return this.generateMockEmbedding(text);
      }
      
      throw error;
    }
  }

  /**
   * Generate mock embedding for testing
   */
  private generateMockEmbedding(text: string): number[] {
    const dimension = 1536; // OpenAI ada-002 dimension
    const embedding: number[] = [];
    
    for (let i = 0; i < dimension; i++) {
      // Generate deterministic values based on text
      const charCode = text.charCodeAt(i % text.length);
      embedding.push((Math.sin(charCode * (i + 1)) + 1) / 2);
    }
    
    return embedding;
  }

  /**
   * Get or create embedding for text
   */
  async getEmbedding(text: string): Promise<number[]> {
    // Add grounding for security context
    const grounding = groundingService.fetch('security');
    const ragText = await this.appendRAGContext(text);
    const enrichedText = `${text}\n\nContext:\n${grounding}\n\nHistorical context:\n${ragText}`;

    // Check cache first
    if (this.config.cacheResults) {
      const cached = await this.getCachedEmbedding(enrichedText);
      if (cached) {
        logEmbeddingQuery('embedding_cache', [], 1, 0);
        return cached;
      }
    }

    // Generate new embedding
    const startTime = Date.now();
    const embedding = await this.generateEmbedding(enrichedText);
    const duration = Date.now() - startTime;

    logEmbeddingGeneration(enrichedText, this.config.modelName, false, duration);

    // Cache the result
    if (this.config.cacheResults) {
      await this.cacheEmbedding(enrichedText, embedding);
    }

    return embedding;
  }

  /**
   * Append RAG context to text
   */
  private async appendRAGContext(text: string): Promise<string> {
    try {
      const baseEmbedding = await this.generateEmbedding(text);
      const context = await this.generateRAGContext(text, {
        includeFinddings: true,
        includeAttackPatterns: true,
        limit: 2
      });
      return context;
    } catch (error) {
      logger.warn('Failed to append RAG context', { error });
      return '';
    }
  }

  /**
   * Get cached embedding
   */
  private async getCachedEmbedding(text: string): Promise<number[] | null> {
    try {
      const result = await this.pool.query(
        'SELECT embedding FROM soc2.embedding_cache WHERE content_hash = MD5($1)',
        [text]
      );

      if (result.rows.length > 0) {
        return result.rows[0].embedding;
      }

      return null;
    } catch (error) {
      logger.error('Cache lookup error', { error });
      return null;
    }
  }

  /**
   * Cache embedding
   */
  private async cacheEmbedding(text: string, embedding: number[]): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO soc2.embedding_cache (content_hash, content, embedding) 
         VALUES (MD5($1), $2, $3::vector) 
         ON CONFLICT (content_hash) DO NOTHING`,
        [text, text, JSON.stringify(embedding)]
      );
    } catch (error) {
      logger.error('Cache write error', { error });
    }
  }

  /**
   * Find similar findings using vector similarity
   */
  async findSimilarFindings(queryEmbedding: number[], limit: number = 5): Promise<FindingEmbedding[]> {
    const startTime = Date.now();
    
    try {
      const result = await this.pool.query(
        `SELECT 
          id, finding_id, content, embedding, metadata, created_at,
          1 - (embedding <=> $1::vector) as similarity
         FROM soc2.findings
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
        [JSON.stringify(queryEmbedding), limit]
      );

      const duration = Date.now() - startTime;
      logDatabaseOperation('find_similar_findings', 'findings', duration, result.rows.length);

      return result.rows;
    } catch (error) {
      logger.error('Similar findings query error', { error });
      throw error;
    }
  }

  /**
   * Find similar attack patterns
   */
  async findSimilarAttackPatterns(queryEmbedding: number[], limit: number = 5): Promise<AttackPattern[]> {
    const startTime = Date.now();
    
    try {
      const result = await this.pool.query(
        `SELECT 
          attack_id, attack_name, description, embedding, tsc, cc,
          1 - (embedding <=> $1::vector) as similarity
         FROM soc2.attack_patterns
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
        [JSON.stringify(queryEmbedding), limit]
      );

      const duration = Date.now() - startTime;
      logDatabaseOperation('find_similar_attacks', 'attack_patterns', duration, result.rows.length);

      return result.rows;
    } catch (error) {
      logger.error('Similar attacks query error', { error });
      throw error;
    }
  }

  /**
   * Generate RAG context from similar findings and patterns
   */
  async generateRAGContext(query: string, options: {
    includeFinddings?: boolean;
    includeAttackPatterns?: boolean;
    limit?: number;
  } = {}): Promise<string> {
    const {
      includeFinddings = true,
      includeAttackPatterns = true,
      limit = 3
    } = options;

    // Get embedding for query
    const queryEmbedding = await this.getEmbedding(query);
    const contextParts: string[] = [];

    // Find similar findings
    if (includeFinddings) {
      const findings = await this.findSimilarFindings(queryEmbedding, limit);
      if (findings.length > 0) {
        contextParts.push('Relevant historical findings:');
        findings.forEach(f => {
          contextParts.push(`- ${f.content} (Finding ID: ${f.finding_id})`);
        });
      }
    }

    // Find similar attack patterns
    if (includeAttackPatterns) {
      const attacks = await this.findSimilarAttackPatterns(queryEmbedding, limit);
      if (attacks.length > 0) {
        contextParts.push('\nRelevant attack patterns:');
        attacks.forEach(a => {
          contextParts.push(`- ${a.attack_name}: ${a.description}`);
          contextParts.push(`  TSC: ${a.tsc.join(', ')}, CC: ${a.cc.join(', ')}`);
        });
      }
    }

    const context = contextParts.join('\n');
    const sources = [];
    if (includeFinddings) sources.push({ type: 'findings', count: limit });
    if (includeAttackPatterns) sources.push({ type: 'attacks', count: limit });
    logRAGContext(query, contextParts.length, sources, Date.now() - (queryEmbedding ? 100 : 0));

    return context;
  }

  /**
   * Store a new finding with embedding
   */
  async storeFinding(finding: {
    finding_id: string;
    content: string;
    metadata: Record<string, any>;
  }): Promise<void> {
    const embedding = await this.getEmbedding(finding.content);
    
    await this.pool.query(
      `INSERT INTO soc2.findings (finding_id, content, embedding, metadata)
       VALUES ($1, $2, $3::vector, $4)
       ON CONFLICT (finding_id) DO UPDATE SET
         content = EXCLUDED.content,
         embedding = EXCLUDED.embedding,
         metadata = EXCLUDED.metadata,
         updated_at = CURRENT_TIMESTAMP`,
      [finding.finding_id, finding.content, JSON.stringify(embedding), finding.metadata]
    );

    logger.info('Finding stored with embedding', { finding_id: finding.finding_id });
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
} 