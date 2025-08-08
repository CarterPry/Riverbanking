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
  }
  
  async initialize(): Promise<void> {
    logger.info('Initializing intent classifier');
    await this.initializeAttackEmbeddings();
  }
  
  /**
   * Initialize attack embeddings from precomputed values or generate them
   */
  private async initializeAttackEmbeddings() {
    // First, load all precomputed embeddings
    let loadedCount = 0;
    for (const attack of attacks) {
      if (attackEmbeddings[attack.id]) {
        this.attackEmbeddings.set(attack.id, attackEmbeddings[attack.id]);
        loadedCount++;
      }
    }
    
    logger.info('Loaded precomputed attack embeddings', { 
      loaded: loadedCount, 
      total: attacks.length 
    });
    
    // Check if we have all required embeddings
    if (loadedCount < attacks.length) {
      const missing = attacks
        .filter(attack => !this.attackEmbeddings.has(attack.id))
        .map(attack => attack.id);
      
      logger.error('Missing embeddings for attacks', { 
        missing, 
        loadedCount, 
        totalAttacks: attacks.length 
      });
      
      throw new Error(
        `Missing embeddings for ${missing.length} attacks: ${missing.join(', ')}. ` +
        `Please run 'node scripts/generate-embeddings-direct.js' to generate all embeddings.`
      );
    }
    
    logger.info('Attack embeddings initialized', { count: this.attackEmbeddings.size });
  }
  
  /**
   * Classify user input and match to relevant attacks
   */
  async classify(input: string, workflowId?: string): Promise<IntentClassificationResult> {
    logger.info('Starting intent classification', { inputLength: input.length, workflowId });
    
    // Emit progress event
    if (workflowId) {
      process.emit('workflow:classification:progress' as any, {
        workflowId,
        message: 'Analyzing your security test request...',
        phase: 'classification',
        percent: 10
      });
    }
    
    // Build structured prompt for classification
    const prompt = promptBuilder.build('classification', input);
    logger.debug('Built classification prompt');
    
    // Generate embedding for input with prompt
    logger.info('Generating embedding for user input...');
    if (workflowId) {
      process.emit('workflow:classification:progress' as any, {
        workflowId,
        message: 'Processing your request with AI...',
        phase: 'classification',
        percent: 30
      });
    }
    
    const inputEmbedding = await this.embeddingService.getEmbedding(prompt);
    logger.info('Generated input embedding successfully');
    
    if (workflowId) {
      process.emit('workflow:classification:progress' as any, {
        workflowId,
        message: 'Matching your request to security tests...',
        phase: 'classification',
        percent: 60
      });
    }
    
    // Extract entities from input
    const extractedEntities = this.extractEntities(input);
    
    // Calculate similarities with all attacks
    const attackMatches: AttackMatch[] = [];
    
    logger.info('Analyzing security test matches', { 
      totalAttacks: attacks.length,
      userInput: input.substring(0, 100) + '...'
    });
    
    // Emit progress for similarity calculation
    if (workflowId) {
      process.emit('workflow:classification:progress' as any, {
        workflowId,
        message: `Comparing your request against ${attacks.length} security test types...`,
        phase: 'classification',
        percent: 70
      });
    }
    
    for (const attack of attacks) {
      const attackEmbedding = this.attackEmbeddings.get(attack.id);
      if (!attackEmbedding) continue;
      
      const similarity = cosineSimilarity(inputEmbedding, attackEmbedding);
      
      // Apply boost if attack type keywords are mentioned
      let adjustedSimilarity = similarity;
      const hasKeywords = this.containsAttackKeywords(input, attack);
      if (hasKeywords) {
        adjustedSimilarity = Math.min(1.0, similarity * 1.2);
        logger.debug('Keyword boost applied', {
          attack: attack.name,
          originalSimilarity: similarity.toFixed(4),
          boostedSimilarity: adjustedSimilarity.toFixed(4)
        });
      }
      
      // Log all similarities for transparency
      logger.debug('Attack similarity score', {
        attackId: attack.id,
        attackName: attack.name,
        similarity: similarity.toFixed(4),
        adjustedSimilarity: adjustedSimilarity.toFixed(4),
        meetsThreshold: adjustedSimilarity > 0.6
      });
      
      // Filter by threshold
      if (adjustedSimilarity > 0.6) {
        const relevance = this.calculateRelevance(adjustedSimilarity);
        attackMatches.push({
          attack,
          similarity: adjustedSimilarity,
          relevance
        });
        
        // Emit match found
        if (workflowId) {
          process.emit('workflow:classification:progress' as any, {
            workflowId,
            message: `Found relevant test: ${attack.name} (${relevance} relevance, ${(adjustedSimilarity * 100).toFixed(1)}% match)`,
            phase: 'classification',
            percent: 75 + (attackMatches.length * 2)
          });
        }
      }
    }
    
    // Sort by similarity
    attackMatches.sort((a, b) => b.similarity - a.similarity);
    
    // Log top matches
    if (attackMatches.length > 0) {
      logger.info('Top security test matches found', {
        totalMatches: attackMatches.length,
        topMatches: attackMatches.slice(0, 5).map(m => ({
          name: m.attack.name,
          similarity: (m.similarity * 100).toFixed(1) + '%',
          relevance: m.relevance
        }))
      });
      
      // Emit summary
      if (workflowId) {
        process.emit('workflow:classification:progress' as any, {
          workflowId,
          message: `Identified ${attackMatches.length} relevant security tests. Top match: ${attackMatches[0].attack.name} (${(attackMatches[0].similarity * 100).toFixed(1)}% confidence)`,
          phase: 'classification',
          percent: 90
        });
      }
    } else {
      logger.warn('No matching security tests found', { input: input.substring(0, 100) });
      
      if (workflowId) {
        process.emit('workflow:classification:progress' as any, {
          workflowId,
          message: 'No specific security tests matched your request. Using general security assessment.',
          phase: 'classification',
          percent: 90
        });
      }
    }
    
    // Determine intent based on input patterns
    const intent = this.determineIntent(input, attackMatches);
    const confidence = attackMatches.length > 0 ? attackMatches[0].similarity : 0;
    
    logger.info('Classification complete', {
      intent,
      confidence: (confidence * 100).toFixed(1) + '%',
      matchedAttacks: attackMatches.length,
      topMatch: attackMatches[0]?.attack.name,
      extractedEntities: {
        targets: extractedEntities.targets,
        attackTypes: extractedEntities.attackTypes,
        scope: extractedEntities.scope
      }
    });
    
    if (workflowId) {
      process.emit('workflow:classification:progress' as any, {
        workflowId,
        message: 'Classification complete. Moving to context enrichment...',
        phase: 'classification',
        percent: 100
      });
    }
    
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