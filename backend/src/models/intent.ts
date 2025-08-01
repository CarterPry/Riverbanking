/**
 * Represents the classified intent from user input
 */
export interface Intent {
  id: string;
  type: 'security' | 'availability' | 'authentication' | 'authorization' | 'data-integrity' | 'comprehensive';
  rawInput: string;
  matchedAttacks: MatchedAttack[];
  confidence: number; // 0-1 confidence score
  embedding?: number[]; // Vector embedding of the intent
  timestamp: Date;
}

export interface MatchedAttack {
  attackId: string;
  attackName: string;
  description: string;
  similarity: number; // 0-1 cosine similarity score
  tsc: string[]; // Trust Service Criteria
  cc: string[]; // Common Criteria controls
  tools: ToolMapping[];
  requiresAuth: boolean;
  progressive: boolean;
  evidenceRequired: string[];
}

export interface ToolMapping {
  name: string;
  command: string[];
  priority: 'critical' | 'standard' | 'low';
  estimatedDuration: number; // milliseconds
  resourceRequirements: {
    cpu?: string;
    memory?: string;
    network?: boolean;
  };
}

export interface ClassificationResult {
  intent: Intent;
  suggestedMethodology: 'quick-scan' | 'standard' | 'comprehensive';
  estimatedDuration: number;
  requiresHITL: boolean;
  reasoning?: string;
} 