// backend/src/layers/intentClassification.ts
import { EmbeddingService } from '../services/embeddingService.js';
import { cosineSimilarity } from '../utils/cosineSimilarity.js';
import { attacks, Attack, attackEmbeddings } from '../compliance/mappings/attack-mapping.js';
import { createLogger } from '../utils/logger.js';
import * as promptBuilder from '../utils/promptBuilder.js';

const logger = createLogger('IntentClassifier');

export interface IntentClassificationResult {
  intent: 'SECURITY_TEST' | 'COMPLIANCE_AUDIT' | 'VULNERABILITY_SCAN' | 'UNKNOWN';
  confidence: number;
  matchedAttacks: AttackMatch[];
  extractedEntities: {
    targets: string[];
    attackTypes: string[];
    authContext: boolean;
  };
}

export interface AttackMatch {
  attack: Attack;
  similarity: number;
  relevance: 'high' | 'medium' | 'low';
}

export class IntentClassifier {
  private embeddingService: EmbeddingService;
  private attackEmbeddings: Map<string, number[]>;
  
  constructor(embeddingService: EmbeddingService) {
    this.embeddingService = embeddingService;
    this.attackEmbeddings = new Map();
    this.initializeAttackEmbeddings();
  }
  
  /**
   * Initialize attack embeddings from precomputed values or generate them
   */
  private async initializeAttackEmbeddings() {
    for (const attack of attacks) {
      if (attackEmbeddings[attack.id]) {
        this.attackEmbeddings.set(attack.id, attackEmbeddings[attack.id]);
      } else {
        // Generate embedding for attack description
        const embedding = await this.embeddingService.getEmbedding(
          `${attack.name} ${attack.description}`
        );
        this.attackEmbeddings.set(attack.id, embedding);
      }
    }
    logger.info('Attack embeddings initialized', { count: this.attackEmbeddings.size });
  }
  
  /**
   * Classify user input and match to relevant attacks
   */
  async classify(input: string): Promise<IntentClassificationResult> {
    logger.debug('Classifying input', { inputLength: input.length });
    
    // Build structured prompt for classification
    const prompt = promptBuilder.build('classification', input);
    
    // Generate embedding for input with prompt
    const inputEmbedding = await this.embeddingService.getEmbedding(prompt);
    
    // Extract entities from input
    const extractedEntities = this.extractEntities(input);
    
    // Calculate similarities with all attacks
    const attackMatches: AttackMatch[] = [];
    
    for (const attack of attacks) {
      const attackEmbedding = this.attackEmbeddings.get(attack.id);
      if (!attackEmbedding) continue;
      
      const similarity = cosineSimilarity(inputEmbedding, attackEmbedding);
      
      // Apply boost if attack type keywords are mentioned
      let adjustedSimilarity = similarity;
      if (this.containsAttackKeywords(input, attack)) {
        adjustedSimilarity = Math.min(1.0, similarity * 1.2);
      }
      
      // Filter by threshold
      if (adjustedSimilarity > 0.6) {
        attackMatches.push({
          attack,
          similarity: adjustedSimilarity,
          relevance: this.calculateRelevance(adjustedSimilarity)
        });
      }
    }
    
    // Sort by similarity
    attackMatches.sort((a, b) => b.similarity - a.similarity);
    
    // Determine intent based on input patterns
    const intent = this.determineIntent(input, attackMatches);
    const confidence = attackMatches.length > 0 ? attackMatches[0].similarity : 0;
    
    logger.info('Classification complete', {
      intent,
      confidence,
      matchedAttacks: attackMatches.length,
      topMatch: attackMatches[0]?.attack.name
    });
    
    return {
      intent,
      confidence,
      matchedAttacks: attackMatches,
      extractedEntities
    };
  }
  
  /**
   * Extract entities from user input
   */
  private extractEntities(input: string): IntentClassificationResult['extractedEntities'] {
    const lowerInput = input.toLowerCase();
    
    // Extract targets (URLs, IPs, domains)
    const urlPattern = /https?:\/\/[^\s]+/g;
    const ipPattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
    const domainPattern = /\b[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}\b/g;
    
    const targets = [
      ...(input.match(urlPattern) || []),
      ...(input.match(ipPattern) || []),
      ...(input.match(domainPattern) || [])
    ];
    
    // Extract attack type keywords
    const attackKeywords = [
      'sql injection', 'xss', 'csrf', 'injection', 'brute force',
      'authentication', 'access control', 'encryption', 'cryptographic',
      'misconfiguration', 'vulnerability', 'penetration test', 'security scan'
    ];
    
    const attackTypes = attackKeywords.filter(keyword => lowerInput.includes(keyword));
    
    // Detect authentication context
    const authKeywords = ['login', 'logged in', 'authenticated', 'post-login', 'after login', 'auth'];
    const authContext = authKeywords.some(keyword => lowerInput.includes(keyword));
    
    return {
      targets: [...new Set(targets)], // Remove duplicates
      attackTypes,
      authContext
    };
  }
  
  /**
   * Check if input contains keywords related to specific attack
   */
  private containsAttackKeywords(input: string, attack: Attack): boolean {
    const lowerInput = input.toLowerCase();
    const attackName = attack.name.toLowerCase();
    
    // Direct match
    if (lowerInput.includes(attackName)) {
      return true;
    }
    
    // Check for common variations
    const keywords = this.getAttackKeywords(attack.id);
    return keywords.some(keyword => lowerInput.includes(keyword));
  }
  
  /**
   * Get keywords associated with specific attack
   */
  private getAttackKeywords(attackId: string): string[] {
    const keywordMap: { [key: string]: string[] } = {
      'sql-injection': ['sql', 'database', 'query', 'injection'],
      'blind-sql-injection': ['blind sql', 'time based', 'boolean based'],
      'xss': ['xss', 'script', 'javascript', 'cross site'],
      'csrf': ['csrf', 'xsrf', 'forgery', 'cross site request'],
      'broken-access-control': ['access control', 'authorization', 'privilege'],
      'crypto-failures': ['encryption', 'crypto', 'ssl', 'tls', 'certificate'],
      'auth-failures': ['authentication', 'login', 'password', 'brute force'],
      'ssrf': ['ssrf', 'server side request', 'internal access'],
      'security-misconfig': ['misconfiguration', 'config', 'default', 'headers'],
      'vulnerable-components': ['dependency', 'library', 'component', 'outdated']
    };
    
    return keywordMap[attackId] || [];
  }
  
  /**
   * Calculate relevance based on similarity score
   */
  private calculateRelevance(similarity: number): 'high' | 'medium' | 'low' {
    if (similarity > 0.85) return 'high';
    if (similarity > 0.75) return 'medium';
    return 'low';
  }
  
  /**
   * Determine overall intent from input and matches
   */
  private determineIntent(
    input: string, 
    matches: AttackMatch[]
  ): IntentClassificationResult['intent'] {
    const lowerInput = input.toLowerCase();
    
    // Check for specific intent keywords
    if (lowerInput.includes('compliance') || lowerInput.includes('soc2') || lowerInput.includes('audit')) {
      return 'COMPLIANCE_AUDIT';
    }
    
    if (lowerInput.includes('vulnerability scan') || lowerInput.includes('security scan')) {
      return 'VULNERABILITY_SCAN';
    }
    
    if (matches.length > 0 && matches[0].similarity > 0.7) {
      return 'SECURITY_TEST';
    }
    
    return 'UNKNOWN';
  }
}