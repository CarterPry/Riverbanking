/**
 * Represents viable attacks after context enrichment
 */
export interface ViableAttacks {
  workflowId: string;
  critical: EnrichedAttack[];
  standard: EnrichedAttack[];
  lowPriority: EnrichedAttack[];
  totalCount: number;
  requiresAuth: EnrichedAttack[];
  metadata: EnrichmentMetadata;
}

export interface EnrichedAttack {
  attackId: string;
  attackName: string;
  description: string;
  priority: 'critical' | 'standard' | 'low';
  confidence: number; // 0-1
  historicalSuccess: number; // 0-1 based on past results
  estimatedDuration: number; // milliseconds
  tools: ToolConfig[];
  tsc: string[];
  cc: string[];
  requiresAuth: boolean;
  progressive: boolean;
  evidenceRequired: string[];
  dependencies?: string[]; // Other attacks that should run first
  exclusions?: string[]; // Attacks that conflict with this one
}

export interface ToolConfig {
  name: string;
  version?: string;
  command: string[];
  arguments: Record<string, any>;
  timeout: number; // milliseconds
  retryCount: number;
  containerImage?: string;
  environment?: Record<string, string>;
}

export interface EnrichmentMetadata {
  enrichmentTimestamp: Date;
  historicalDataUsed: boolean;
  embeddingSimilarityThreshold: number;
  confidenceThreshold: number;
  totalAttacksConsidered: number;
  filteredCount: number;
  reasoning: string[];
}

export interface AttackExecutionPlan {
  viableAttacks: ViableAttacks;
  executionOrder: ExecutionPhase[];
  estimatedTotalDuration: number;
  resourceRequirements: ResourceEstimate;
  requiresHITL: boolean;
  hitlCheckpoints: HITLCheckpoint[];
}

export interface ExecutionPhase {
  phase: number;
  attacks: string[]; // Attack IDs that can run in parallel
  estimatedDuration: number;
  resourceRequirements: ResourceEstimate;
}

export interface ResourceEstimate {
  maxConcurrentContainers: number;
  estimatedCPU: string;
  estimatedMemory: string;
  estimatedNetworkBandwidth?: string;
}

export interface HITLCheckpoint {
  attackId: string;
  reason: 'requires-auth' | 'critical-operation' | 'high-risk' | 'manual-verification';
  description: string;
  approvalRequired: boolean;
  metadata?: Record<string, any>;
} 