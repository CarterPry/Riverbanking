/**
 * Represents the result of a security test execution
 */
export interface TestResult {
  id: string;
  workflowId: string;
  attackType: string;
  tool: string;
  target: string;
  timestamp: Date;
  duration: number; // in milliseconds
  findings: Finding[];
  rawOutput: string;
  score: number; // 0-100 security score
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  cost: CostMetrics;
  evidence: Evidence[];
  status: 'completed' | 'failed' | 'timeout';
  error?: string;
}

export interface Finding {
  id: string;
  type: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  cvssScore?: number;
  cveId?: string;
  remediation?: string;
  affectedComponent?: string;
  evidence?: string;
}

export interface CostMetrics {
  executionTime: number; // milliseconds
  cpuUsage?: number; // percentage
  memoryUsage?: number; // bytes
  networkUsage?: number; // bytes
}

export interface Evidence {
  type: 'screenshot' | 'log' | 'payload' | 'response' | 'file';
  filename: string;
  content?: string;
  path?: string;
  mimeType?: string;
  size?: number;
}

export interface AggregatedResults {
  workflowId: string;
  overallScore: number;
  totalFindings: number;
  findingsBySeverity: Record<string, number>;
  completedTests: number;
  failedTests: number;
  totalDuration: number;
  totalCost: CostMetrics;
  testResults: TestResult[];
} 