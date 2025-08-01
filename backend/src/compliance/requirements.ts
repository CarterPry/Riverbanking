// backend/src/compliance/requirements.ts
export interface SecurityRequirement {
  specs: string;
  constraints: string;
  guidelines: string[];
  prohibitions: string[];
}

export const requirements: { [tsc: string]: SecurityRequirement } = {
  Security: {
    specs: 'Comprehensive security testing covering injection attacks, access control, cryptographic failures, and misconfigurations. Focus on authentication, authorization, and data protection.',
    constraints: 'Testing must be non-destructive and limited to authorized scope. Require explicit authentication for sensitive operations. No production data exposure.',
    guidelines: [
      'Prioritize OWASP Top 10 vulnerabilities',
      'Use progressive testing approach - start lightweight',
      'Document all findings with evidence',
      'Maintain audit trail of all tests performed',
      'Follow responsible disclosure for critical findings'
    ],
    prohibitions: [
      'No denial of service attacks',
      'No data exfiltration beyond proof of concept',
      'No privilege escalation to admin without approval',
      'No modification of production data',
      'No testing outside agreed scope'
    ]
  },
  
  Availability: {
    specs: 'Test system resilience, failover mechanisms, and recovery procedures. Validate uptime commitments and disaster recovery capabilities.',
    constraints: 'Availability testing must not impact production services. Coordinate with operations team for failover tests.',
    guidelines: [
      'Test backup and restore procedures',
      'Validate monitoring and alerting systems',
      'Verify capacity planning metrics',
      'Check redundancy configurations',
      'Test incident response procedures'
    ],
    prohibitions: [
      'No unscheduled service interruptions',
      'No resource exhaustion attacks',
      'No interference with production traffic',
      'No deletion of backup data'
    ]
  },
  
  ProcessingIntegrity: {
    specs: 'Validate data processing accuracy, completeness, and authorization. Test input validation, processing logic, and output integrity.',
    constraints: 'Use test data only. Validate processing logic without modifying production workflows.',
    guidelines: [
      'Test data validation rules',
      'Verify processing sequences',
      'Check transaction integrity',
      'Validate error handling',
      'Test authorization checks'
    ],
    prohibitions: [
      'No corruption of production data',
      'No bypass of validation rules in production',
      'No unauthorized transaction processing'
    ]
  },
  
  Confidentiality: {
    specs: 'Test data encryption, access controls, and information disclosure vulnerabilities. Validate data classification and handling procedures.',
    constraints: 'Handle any discovered confidential data according to data classification policy. Report but do not exfiltrate.',
    guidelines: [
      'Test encryption implementation',
      'Verify access control enforcement',
      'Check for information leakage',
      'Validate data masking/redaction',
      'Test secure communication channels'
    ],
    prohibitions: [
      'No extraction of confidential data',
      'No sharing of discovered secrets',
      'No decryption attempts on production data',
      'No bypass of classification controls'
    ]
  },
  
  Privacy: {
    specs: 'Test privacy controls, consent mechanisms, and data subject rights implementation. Validate PII handling and retention policies.',
    constraints: 'Use synthetic PII only. Respect privacy regulations and data subject rights.',
    guidelines: [
      'Test consent collection and management',
      'Verify data minimization practices',
      'Check retention policy enforcement',
      'Validate data subject request handling',
      'Test cross-border data transfer controls'
    ],
    prohibitions: [
      'No access to real PII without authorization',
      'No violation of privacy regulations',
      'No unauthorized data transfers',
      'No retention of discovered PII'
    ]
  }
};

/**
 * Get consolidated requirements for multiple TSCs
 */
export function getConsolidatedRequirements(tscs: string[]): SecurityRequirement {
  const consolidated: SecurityRequirement = {
    specs: '',
    constraints: '',
    guidelines: [],
    prohibitions: []
  };
  
  const specs: string[] = [];
  const constraints: string[] = [];
  const guidelinesSet = new Set<string>();
  const prohibitionsSet = new Set<string>();
  
  tscs.forEach(tsc => {
    if (requirements[tsc]) {
      specs.push(requirements[tsc].specs);
      constraints.push(requirements[tsc].constraints);
      requirements[tsc].guidelines.forEach(g => guidelinesSet.add(g));
      requirements[tsc].prohibitions.forEach(p => prohibitionsSet.add(p));
    }
  });
  
  consolidated.specs = specs.join(' ');
  consolidated.constraints = constraints.join(' ');
  consolidated.guidelines = Array.from(guidelinesSet);
  consolidated.prohibitions = Array.from(prohibitionsSet);
  
  return consolidated;
}

/**
 * Generate grounding context for AI agents
 */
export function generateGroundingContext(tscs: string[], ccCodes: string[]): string {
  const reqs = getConsolidatedRequirements(tscs);
  
  let context = `Security Testing Requirements:\n`;
  context += `Specifications: ${reqs.specs}\n\n`;
  context += `Constraints: ${reqs.constraints}\n\n`;
  context += `Guidelines:\n${reqs.guidelines.map(g => `- ${g}`).join('\n')}\n\n`;
  context += `Prohibitions:\n${reqs.prohibitions.map(p => `- ${p}`).join('\n')}\n\n`;
  
  if (ccCodes.length > 0) {
    context += `Target Common Criteria: ${ccCodes.join(', ')}\n`;
    context += `Focus testing on controls that generate evidence for these CC codes.\n`;
  }
  
  context += `\nREMEMBER: All testing must be safe, authorized, and non-destructive. When in doubt, request HITL approval.`;
  
  return context;
}

/**
 * Check if an action violates requirements
 */
export function checkViolation(action: string, tscs: string[]): {
  violates: boolean;
  reason?: string;
} {
  const reqs = getConsolidatedRequirements(tscs);
  
  // Check against prohibitions
  for (const prohibition of reqs.prohibitions) {
    if (action.toLowerCase().includes(prohibition.toLowerCase().replace('no ', ''))) {
      return { violates: true, reason: prohibition };
    }
  }
  
  // Check for keywords that indicate violations
  const dangerousKeywords = [
    'delete production',
    'drop table',
    'rm -rf',
    'format c:',
    'ddos',
    'flood',
    'exhaust resources',
    'bypass all',
    'disable security',
    'extract all data'
  ];
  
  for (const keyword of dangerousKeywords) {
    if (action.toLowerCase().includes(keyword)) {
      return { violates: true, reason: `Potentially dangerous action detected: ${keyword}` };
    }
  }
  
  return { violates: false };
}