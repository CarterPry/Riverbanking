export const owaspKnowledgeBase = {
  // OWASP Top 10 Web Application Security Risks (2021)
  webTop10: {
    'A01:2021': { 
      name: 'Broken Access Control',
      description: 'Failures related to authorization allowing users to act outside their intended permissions',
      tests: ['auth-bypass', 'privilege-escalation', 'cors-misconfiguration', 'path-traversal', 'idor'],
      indicators: ['401/403 bypasses', 'horizontal privilege escalation', 'vertical privilege escalation'],
      ccMapping: ['CC6.1', 'CC6.2', 'CC6.3'],
      aiPrompt: 'Test for unauthorized access to functions and data. Check if users can access resources beyond their privileges.'
    },
    'A02:2021': { 
      name: 'Cryptographic Failures',
      description: 'Failures related to cryptography that lead to exposure of sensitive data',
      tests: ['weak-crypto', 'cleartext-transmission', 'weak-randomness', 'hardcoded-secrets', 'weak-tls'],
      indicators: ['HTTP usage', 'weak ciphers', 'outdated TLS', 'predictable tokens'],
      ccMapping: ['CC6.1', 'CC6.7', 'CC7.1'],
      aiPrompt: 'Identify sensitive data exposure and weak cryptography. Check for unencrypted data transmission and weak algorithms.'
    },
    'A03:2021': { 
      name: 'Injection',
      description: 'User-supplied data is not validated, filtered, or sanitized by the application',
      tests: ['sql-injection', 'nosql-injection', 'command-injection', 'ldap-injection', 'xpath-injection'],
      indicators: ['database errors', 'command execution', 'unexpected behavior with special characters'],
      ccMapping: ['CC6.1', 'CC7.1', 'CC7.2'],
      aiPrompt: 'Test all input vectors for injection vulnerabilities. Try SQL, NoSQL, OS command, and other injection types.'
    },
    'A04:2021': {
      name: 'Insecure Design',
      description: 'Missing or ineffective control design',
      tests: ['business-logic-flaws', 'race-conditions', 'workflow-bypass'],
      indicators: ['missing security controls', 'insufficient threat modeling', 'design flaws'],
      ccMapping: ['CC6.1', 'CC7.1', 'CC8.1'],
      aiPrompt: 'Identify design-level security flaws and missing controls. Look for business logic vulnerabilities.'
    },
    'A05:2021': {
      name: 'Security Misconfiguration',
      description: 'Missing appropriate security hardening or improperly configured permissions',
      tests: ['default-creds', 'unnecessary-features', 'verbose-errors', 'missing-patches'],
      indicators: ['default configurations', 'unnecessary services', 'detailed error messages'],
      ccMapping: ['CC6.1', 'CC6.6', 'CC7.1'],
      aiPrompt: 'Check for misconfigurations, default settings, unnecessary features, and verbose error messages.'
    },
    'A06:2021': {
      name: 'Vulnerable and Outdated Components',
      description: 'Using components with known vulnerabilities',
      tests: ['dependency-check', 'version-disclosure', 'cve-scanning'],
      indicators: ['outdated libraries', 'known CVEs', 'unsupported versions'],
      ccMapping: ['CC6.1', 'CC6.8', 'CC7.1'],
      aiPrompt: 'Identify outdated components and known vulnerabilities. Check versions against CVE databases.'
    },
    'A07:2021': {
      name: 'Identification and Authentication Failures',
      description: 'Confirmation of user identity, authentication, and session management failures',
      tests: ['weak-passwords', 'session-fixation', 'credential-stuffing', 'mfa-bypass'],
      indicators: ['weak password policy', 'session issues', 'missing MFA', 'credential exposure'],
      ccMapping: ['CC6.1', 'CC6.2', 'CC6.3'],
      aiPrompt: 'Test authentication mechanisms for weaknesses. Check password policies, session management, and MFA.'
    },
    'A08:2021': {
      name: 'Software and Data Integrity Failures',
      description: 'Code and infrastructure that does not protect against integrity violations',
      tests: ['insecure-deserialization', 'unsigned-updates', 'ci-cd-compromise'],
      indicators: ['unsigned code', 'insecure pipelines', 'deserialization flaws'],
      ccMapping: ['CC6.1', 'CC6.7', 'CC7.1'],
      aiPrompt: 'Check for integrity violations in software updates, CI/CD pipelines, and data serialization.'
    },
    'A09:2021': {
      name: 'Security Logging and Monitoring Failures',
      description: 'Insufficient logging, detection, monitoring and active response',
      tests: ['logging-gaps', 'log-injection', 'monitoring-blind-spots'],
      indicators: ['missing logs', 'unmonitored events', 'no alerting', 'log tampering'],
      ccMapping: ['CC6.1', 'CC7.2', 'CC7.3'],
      aiPrompt: 'Assess logging and monitoring capabilities. Check for gaps in security event detection.'
    },
    'A10:2021': {
      name: 'Server-Side Request Forgery (SSRF)',
      description: 'Fetching a remote resource without validating the user-supplied URL',
      tests: ['ssrf-detection', 'internal-port-scanning', 'cloud-metadata-access'],
      indicators: ['URL parameters', 'webhook functionality', 'PDF generators', 'image processors'],
      ccMapping: ['CC6.1', 'CC6.8', 'CC7.1'],
      aiPrompt: 'Test for SSRF vulnerabilities in URL inputs, webhooks, and file processing features.'
    }
  },
  
  // OWASP Top 10 for LLM Applications (2023)
  llmTop10: {
    'LLM01': {
      name: 'Prompt Injection',
      description: 'Manipulating LLM via crafted inputs to make it ignore instructions',
      mitigations: ['input-sanitization', 'context-isolation', 'output-validation', 'instruction-defense'],
      tests: ['prompt-override', 'instruction-injection', 'context-escape'],
      aiSafetyPrompt: 'Ensure user inputs cannot manipulate AI behavior or access unauthorized functions.'
    },
    'LLM02': {
      name: 'Insecure Output Handling',
      description: 'Insufficient validation of LLM outputs before passing to other systems',
      mitigations: ['output-encoding', 'content-validation', 'sanitization'],
      tests: ['xss-via-llm', 'injection-via-llm', 'command-execution'],
      aiSafetyPrompt: 'Validate and sanitize all AI-generated test payloads before execution.'
    },
    'LLM03': {
      name: 'Training Data Poisoning',
      description: 'Manipulation of training data to introduce vulnerabilities or biases',
      mitigations: ['data-validation', 'source-verification', 'anomaly-detection'],
      tests: ['backdoor-detection', 'bias-testing', 'poisoning-detection'],
      aiSafetyPrompt: 'Test for signs of compromised training data or malicious model behavior.'
    },
    'LLM04': {
      name: 'Model Denial of Service',
      description: 'Interactions that consume excessive resources',
      mitigations: ['rate-limiting', 'resource-monitoring', 'input-size-limits'],
      tests: ['resource-exhaustion', 'infinite-loops', 'memory-consumption'],
      aiSafetyPrompt: 'Implement resource limits and monitor for expensive operations.'
    },
    'LLM05': {
      name: 'Supply Chain Vulnerabilities',
      description: 'Vulnerable components or services in the LLM supply chain',
      mitigations: ['component-scanning', 'vendor-assessment', 'integrity-checks'],
      tests: ['dependency-audit', 'plugin-security', 'api-security'],
      aiSafetyPrompt: 'Audit all LLM dependencies and third-party integrations for vulnerabilities.'
    },
    'LLM06': {
      name: 'Sensitive Information Disclosure',
      description: 'LLM revealing confidential data in its responses',
      mitigations: ['output-filtering', 'pii-detection', 'data-classification'],
      tests: ['data-extraction', 'pii-leakage', 'secret-disclosure'],
      aiSafetyPrompt: 'Ensure LLM cannot reveal sensitive training data or system information.'
    },
    'LLM07': {
      name: 'Insecure Plugin Design',
      description: 'LLM plugins with insufficient access control and validation',
      mitigations: ['plugin-sandboxing', 'permission-models', 'input-validation'],
      tests: ['plugin-bypass', 'permission-escalation', 'command-injection'],
      aiSafetyPrompt: 'Test plugin security boundaries and permission enforcement.'
    },
    'LLM08': {
      name: 'Excessive Agency',
      description: 'LLM performing actions beyond intended scope',
      mitigations: ['action-limits', 'human-approval', 'scope-definition'],
      tests: ['unauthorized-actions', 'scope-creep', 'decision-override'],
      aiSafetyPrompt: 'Ensure LLM actions are limited to intended scope with proper controls.'
    },
    'LLM09': {
      name: 'Overreliance',
      description: 'Excessive dependence on LLM without adequate oversight',
      mitigations: ['human-review', 'confidence-thresholds', 'fallback-mechanisms'],
      tests: ['accuracy-testing', 'hallucination-detection', 'decision-validation'],
      aiSafetyPrompt: 'Implement checks for LLM accuracy and provide fallback mechanisms.'
    },
    'LLM10': {
      name: 'Model Theft',
      description: 'Unauthorized access or copying of the LLM model',
      mitigations: ['access-control', 'query-limits', 'watermarking'],
      tests: ['model-extraction', 'parameter-probing', 'architecture-discovery'],
      aiSafetyPrompt: 'Protect against model extraction and unauthorized access attempts.'
    }
  },
  
  // AI-specific testing patterns from OWASP AI Security Guide
  aiTestingPatterns: {
    'model-extraction': {
      description: 'Attempt to reverse-engineer AI models through queries',
      tests: ['query-analysis', 'response-pattern-mapping', 'parameter-estimation'],
      indicators: ['consistent patterns', 'parameter leakage', 'architecture hints'],
      restraint: 'Limit queries to avoid service disruption and detection'
    },
    'adversarial-inputs': {
      description: 'Craft inputs designed to cause misclassification or errors',
      tests: ['perturbation-testing', 'boundary-testing', 'gradient-attacks'],
      indicators: ['misclassifications', 'confidence drops', 'unexpected outputs'],
      restraint: 'Use benign examples only, avoid malicious payloads'
    },
    'data-poisoning': {
      description: 'Test for training data manipulation vulnerabilities',
      tests: ['input-boundary-testing', 'feedback-manipulation', 'backdoor-triggers'],
      indicators: ['biased outputs', 'triggered behaviors', 'inconsistent results'],
      restraint: 'Test with synthetic data only, no real poisoning attempts'
    },
    'membership-inference': {
      description: 'Determine if specific data was in training set',
      tests: ['confidence-analysis', 'output-comparison', 'timing-analysis'],
      indicators: ['high confidence on specific inputs', 'timing differences', 'detailed knowledge'],
      restraint: 'Respect privacy, test with public data only'
    },
    'model-inversion': {
      description: 'Reconstruct training data from model outputs',
      tests: ['output-analysis', 'gradient-inversion', 'feature-reconstruction'],
      indicators: ['data reconstruction', 'feature leakage', 'privacy violations'],
      restraint: 'Stop if private data is exposed, report immediately'
    }
  },
  
  // SOC2 Trust Service Criteria Mapping
  soc2Mapping: {
    'Security': {
      criteria: ['CC6.1', 'CC6.2', 'CC6.3', 'CC6.6', 'CC6.7', 'CC6.8'],
      description: 'Protection against unauthorized access',
      owaspAlignment: ['A01:2021', 'A02:2021', 'A03:2021', 'A07:2021']
    },
    'Availability': {
      criteria: ['CC7.1', 'CC7.2', 'CC7.3', 'CC7.4', 'CC7.5'],
      description: 'System availability for operation and use',
      owaspAlignment: ['A05:2021', 'A09:2021']
    },
    'Processing Integrity': {
      criteria: ['CC8.1'],
      description: 'System processing is complete, accurate, timely, and authorized',
      owaspAlignment: ['A04:2021', 'A08:2021']
    },
    'Confidentiality': {
      criteria: ['CC9.1', 'CC9.2'],
      description: 'Information designated as confidential is protected',
      owaspAlignment: ['A02:2021', 'A06:2021']
    },
    'Privacy': {
      criteria: ['CC10.1', 'CC10.2'],
      description: 'Personal information is collected, used, retained, and disclosed',
      owaspAlignment: ['A01:2021', 'A09:2021']
    }
  },
  
  // Tool to OWASP mapping
  toolMapping: {
    'sql-injection': {
      owaspCategories: ['A03:2021'],
      ccControls: ['CC6.1', 'CC7.1'],
      description: 'SQL injection testing tool',
      safetyLevel: 'medium',
      requiresAuth: false
    },
    'xss-scanner': {
      owaspCategories: ['A03:2021'],
      ccControls: ['CC6.1', 'CC7.2'],
      description: 'Cross-site scripting detection',
      safetyLevel: 'low',
      requiresAuth: false
    },
    'auth-bypass': {
      owaspCategories: ['A01:2021', 'A07:2021'],
      ccControls: ['CC6.1', 'CC6.2'],
      description: 'Authentication bypass testing',
      safetyLevel: 'high',
      requiresAuth: true
    },
    'jwt-analyzer': {
      owaspCategories: ['A02:2021', 'A07:2021'],
      ccControls: ['CC6.1', 'CC6.7'],
      description: 'JWT security analysis',
      safetyLevel: 'low',
      requiresAuth: false
    },
    'api-fuzzer': {
      owaspCategories: ['A01:2021', 'A03:2021', 'A05:2021'],
      ccControls: ['CC6.1', 'CC7.1'],
      description: 'API endpoint fuzzing',
      safetyLevel: 'medium',
      requiresAuth: false
    },
    'subdomain-scanner': {
      owaspCategories: ['A05:2021'],
      ccControls: ['CC6.6'],
      description: 'Subdomain enumeration',
      safetyLevel: 'low',
      requiresAuth: false
    },
    'port-scanner': {
      owaspCategories: ['A05:2021', 'A06:2021'],
      ccControls: ['CC6.6', 'CC7.1'],
      description: 'Port and service discovery',
      safetyLevel: 'low',
      requiresAuth: false
    },
    'directory-scanner': {
      owaspCategories: ['A01:2021', 'A05:2021'],
      ccControls: ['CC6.1', 'CC6.6'],
      description: 'Directory and file enumeration',
      safetyLevel: 'low',
      requiresAuth: false
    },
    'header-analyzer': {
      owaspCategories: ['A05:2021', 'A06:2021'],
      ccControls: ['CC6.1', 'CC6.7'],
      description: 'Security header analysis',
      safetyLevel: 'low',
      requiresAuth: false
    },
    'ssl-checker': {
      owaspCategories: ['A02:2021', 'A06:2021'],
      ccControls: ['CC6.1', 'CC6.7'],
      description: 'SSL/TLS configuration analysis',
      safetyLevel: 'low',
      requiresAuth: false
    }
  },
  
  // Progressive testing strategies
  progressiveStrategies: {
    'web-application': {
      phases: [
        {
          name: 'reconnaissance',
          objective: 'Map attack surface',
          tools: ['subdomain-scanner', 'port-scanner', 'directory-scanner', 'tech-fingerprint'],
          duration: 15,
          nextCondition: 'Found at least one web service'
        },
        {
          name: 'analysis',
          objective: 'Identify vulnerabilities',
          tools: ['header-analyzer', 'ssl-checker', 'form-finder', 'api-discovery'],
          duration: 30,
          nextCondition: 'Found potential vulnerabilities'
        },
        {
          name: 'exploitation',
          objective: 'Confirm and demonstrate impact',
          tools: ['sql-injection', 'xss-scanner', 'auth-bypass', 'api-fuzzer'],
          duration: 45,
          nextCondition: 'Demonstrated exploitable vulnerability'
        }
      ]
    },
    'api-focused': {
      phases: [
        {
          name: 'discovery',
          objective: 'Find and map API endpoints',
          tools: ['api-discovery', 'subdomain-scanner', 'port-scanner'],
          duration: 10,
          nextCondition: 'Found API endpoints'
        },
        {
          name: 'schema-analysis',
          objective: 'Understand API structure',
          tools: ['api-schema-extractor', 'parameter-analyzer', 'jwt-analyzer'],
          duration: 20,
          nextCondition: 'Mapped API structure'
        },
        {
          name: 'security-testing',
          objective: 'Test API security',
          tools: ['api-fuzzer', 'auth-bypass', 'injection-tester'],
          duration: 40,
          nextCondition: 'Completed security tests'
        }
      ]
    }
  },
  
  // Safety thresholds and limits
  safetyThresholds: {
    maxRequestsPerMinute: 60,
    maxConcurrentTests: 3,
    maxPayloadSize: 10240, // 10KB
    maxTestDuration: 300000, // 5 minutes
    requireApprovalFor: ['data-extraction', 'privilege-escalation', 'dos-testing'],
    prohibitedActions: ['data-deletion', 'system-shutdown', 'malware-upload'],
    rateLimits: {
      'low': { requestsPerSecond: 10 },
      'medium': { requestsPerSecond: 5 },
      'high': { requestsPerSecond: 1 }
    }
  }
};