// backend/src/compliance/mappings/attack-mapping.ts
export interface Attack {
  id: string;
  name: string;
  description: string;
  tsc: string[];
  cc: string[];
  tools: { name: string; command: string[] }[];
  requiresAuth: boolean;
  progressive: boolean;
  evidenceRequired: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'OWASP_TOP_10' | 'CUSTOM';
}

// Curated attacks based on OWASP Top 10 2021 and custom security tests
export const attacks: Attack[] = [
  // A01: Broken Access Control
  {
    id: 'broken-access-control',
    name: 'Broken Access Control',
    description: 'Tests for access control violations, privilege escalation, and unauthorized data access',
    tsc: ['Security'],
    cc: ['CC6.1', 'CC6.3', 'CC6.4'], // Logical access controls
    tools: [
      { name: 'zap', command: ['zap-cli', 'active-scan', '--target', '{target}', '--policy', 'access-control'] },
      { name: 'burp', command: ['burp-cli', 'scan', '--target', '{target}', '--check', 'access-control'] }
    ],
    requiresAuth: true,
    progressive: true,
    evidenceRequired: ['escalation_proofs', 'unauthorized_access_logs', 'screenshots'],
    severity: 'critical',
    category: 'OWASP_TOP_10'
  },

  // A02: Cryptographic Failures
  {
    id: 'crypto-failures',
    name: 'Cryptographic Failures',
    description: 'Tests for weak encryption, exposed sensitive data, and improper crypto implementation',
    tsc: ['Security', 'Confidentiality'],
    cc: ['CC6.1', 'CC6.6'], // Boundary protection
    tools: [
      { name: 'sslscan', command: ['sslscan', '{target}'] },
      { name: 'testssl', command: ['testssl.sh', '--full', '{target}'] }
    ],
    requiresAuth: false,
    progressive: false,
    evidenceRequired: ['weak_cipher_logs', 'certificate_analysis', 'protocol_issues'],
    severity: 'high',
    category: 'OWASP_TOP_10'
  },

  // A03: Injection
  {
    id: 'sql-injection',
    name: 'SQL Injection',
    description: 'Tests for SQL injection vulnerabilities in application inputs and parameters',
    tsc: ['Security'],
    cc: ['CC6.1', 'CC7.1'], // Logical access and monitoring
    tools: [
      { name: 'sqlmap', command: ['sqlmap', '-u', '{target}', '--batch', '--level=5', '--risk=3'] }
    ],
    requiresAuth: true,
    progressive: true,
    evidenceRequired: ['sql_payloads', 'db_dumps', 'injection_logs'],
    severity: 'critical',
    category: 'OWASP_TOP_10'
  },

  {
    id: 'blind-sql-injection',
    name: 'Blind SQL Injection',
    description: 'Injects SQL to infer data via true/false responses; common post-login in queries',
    tsc: ['Security'],
    cc: ['CC6.1', 'CC7.1'],
    tools: [
      { name: 'sqlmap', command: ['sqlmap', '-u', '{target}', '--batch', '--level=5', '--technique=B'] }
    ],
    requiresAuth: true,
    progressive: true,
    evidenceRequired: ['timing_analysis', 'boolean_responses', 'inference_logs'],
    severity: 'critical',
    category: 'OWASP_TOP_10'
  },

  {
    id: 'xpath-injection',
    name: 'XPath Injection',
    description: 'Tests for XPath injection in XML-based applications',
    tsc: ['Security'],
    cc: ['CC6.1'],
    tools: [
      { name: 'custom', command: ['python3', '/scripts/xpath_injector.py', '--target', '{target}'] }
    ],
    requiresAuth: true,
    progressive: true,
    evidenceRequired: ['xml_dumps', 'xpath_payloads'],
    severity: 'high',
    category: 'OWASP_TOP_10'
  },

  // A04: Insecure Design
  {
    id: 'insecure-design',
    name: 'Insecure Design Flaws',
    description: 'Tests for design-level security flaws and missing security controls',
    tsc: ['Security'],
    cc: ['CC3.2', 'CC5.1'], // Risk assessment and control activities
    tools: [
      { name: 'custom', command: ['python3', '/scripts/design_analyzer.py', '--target', '{target}'] }
    ],
    requiresAuth: false,
    progressive: true,
    evidenceRequired: ['design_flaws', 'missing_controls', 'threat_model'],
    severity: 'high',
    category: 'OWASP_TOP_10'
  },

  // A05: Security Misconfiguration
  {
    id: 'security-misconfig',
    name: 'Security Misconfiguration',
    description: 'Tests for misconfigurations in servers, frameworks, and applications',
    tsc: ['Security'],
    cc: ['CC7.1', 'CC8.1'], // Configuration management
    tools: [
      { name: 'nikto', command: ['nikto', '-h', '{target}', '-Format', 'json'] },
      { name: 'nmap', command: ['nmap', '-sV', '--script', 'vuln', '{target}'] }
    ],
    requiresAuth: false,
    progressive: false,
    evidenceRequired: ['config_issues', 'default_creds', 'unnecessary_services'],
    severity: 'medium',
    category: 'OWASP_TOP_10'
  },

  // A06: Vulnerable and Outdated Components
  {
    id: 'vulnerable-components',
    name: 'Vulnerable and Outdated Components',
    description: 'Scans for known vulnerabilities in third-party components and libraries',
    tsc: ['Security'],
    cc: ['CC9.2'], // Vendor risks
    tools: [
      { name: 'dependency-check', command: ['dependency-check', '--scan', '{target}', '--format', 'JSON'] }
    ],
    requiresAuth: false,
    progressive: false,
    evidenceRequired: ['vulnerable_libs', 'cve_list', 'patch_recommendations'],
    severity: 'high',
    category: 'OWASP_TOP_10'
  },

  // A07: Identification and Authentication Failures
  {
    id: 'auth-failures',
    name: 'Authentication Failures',
    description: 'Tests for weak authentication mechanisms and session management issues',
    tsc: ['Security'],
    cc: ['CC6.1', 'CC6.2'], // User registration and access
    tools: [
      { name: 'hydra', command: ['hydra', '-L', '/lists/users.txt', '-P', '/lists/passwords.txt', '{target}', 'http-post-form'] }
    ],
    requiresAuth: false,
    progressive: true,
    evidenceRequired: ['weak_passwords', 'session_issues', 'auth_bypass'],
    severity: 'critical',
    category: 'OWASP_TOP_10'
  },

  // A08: Software and Data Integrity Failures
  {
    id: 'integrity-failures',
    name: 'Software and Data Integrity Failures',
    description: 'Tests for insecure deserialization and CI/CD pipeline vulnerabilities',
    tsc: ['Security', 'ProcessingIntegrity'],
    cc: ['CC8.1'], // Change management
    tools: [
      { name: 'custom', command: ['python3', '/scripts/integrity_checker.py', '--target', '{target}'] }
    ],
    requiresAuth: true,
    progressive: true,
    evidenceRequired: ['deserialization_flaws', 'unsigned_code', 'pipeline_vulns'],
    severity: 'high',
    category: 'OWASP_TOP_10'
  },

  // A09: Security Logging and Monitoring Failures
  {
    id: 'logging-failures',
    name: 'Security Logging and Monitoring Failures',
    description: 'Tests for insufficient logging, monitoring, and incident response',
    tsc: ['Security'],
    cc: ['CC7.2', 'CC7.3', 'CC7.4'], // Monitoring and incident response
    tools: [
      { name: 'custom', command: ['python3', '/scripts/log_analyzer.py', '--target', '{target}'] }
    ],
    requiresAuth: true,
    progressive: false,
    evidenceRequired: ['missing_logs', 'unmonitored_events', 'detection_gaps'],
    severity: 'medium',
    category: 'OWASP_TOP_10'
  },

  // A10: Server-Side Request Forgery (SSRF)
  {
    id: 'ssrf',
    name: 'Server-Side Request Forgery (SSRF)',
    description: 'Tests for SSRF vulnerabilities allowing unauthorized server requests',
    tsc: ['Security'],
    cc: ['CC6.1', 'CC6.6'], // Access control and boundary protection
    tools: [
      { name: 'ssrfmap', command: ['python3', '/tools/SSRFmap/ssrfmap.py', '-u', '{target}'] }
    ],
    requiresAuth: true,
    progressive: true,
    evidenceRequired: ['internal_access_logs', 'ssrf_payloads', 'network_traces'],
    severity: 'high',
    category: 'OWASP_TOP_10'
  },

  // Additional custom attacks from provided list
  {
    id: 'xss',
    name: 'Cross-Site Scripting (XSS)',
    description: 'Tests for reflected, stored, and DOM-based XSS vulnerabilities',
    tsc: ['Security'],
    cc: ['CC6.1'],
    tools: [
      { name: 'xsstrike', command: ['python3', '/tools/XSStrike/xsstrike.py', '-u', '{target}'] },
      { name: 'zap', command: ['zap-cli', 'active-scan', '--target', '{target}', '--policy', 'xss'] }
    ],
    requiresAuth: true,
    progressive: true,
    evidenceRequired: ['xss_payloads', 'alert_screenshots', 'dom_analysis'],
    severity: 'high',
    category: 'OWASP_TOP_10'
  },

  {
    id: 'csrf',
    name: 'Cross-Site Request Forgery (CSRF)',
    description: 'Tests for CSRF vulnerabilities in state-changing operations',
    tsc: ['Security'],
    cc: ['CC6.1'],
    tools: [
      { name: 'zap', command: ['zap-cli', 'active-scan', '--target', '{target}', '--policy', 'csrf'] }
    ],
    requiresAuth: true,
    progressive: true,
    evidenceRequired: ['csrf_tokens', 'request_replays', 'poc_forms'],
    severity: 'medium',
    category: 'OWASP_TOP_10'
  },

  {
    id: 'clickjacking',
    name: 'Clickjacking',
    description: 'Tests for UI redressing attacks and missing frame protection headers',
    tsc: ['Security'],
    cc: ['CC6.1'],
    tools: [
      { name: 'nikto', command: ['nikto', '-h', '{target}', '-Plugins', 'headers'] }
    ],
    requiresAuth: false,
    progressive: false,
    evidenceRequired: ['header_analysis', 'iframe_poc'],
    severity: 'low',
    category: 'CUSTOM'
  },

  {
    id: 'parameter-tampering',
    name: 'Parameter Tampering',
    description: 'Tests for parameter manipulation vulnerabilities',
    tsc: ['Security'],
    cc: ['CC6.1'],
    tools: [
      { name: 'burp', command: ['burp-cli', 'intruder', '--target', '{target}', '--positions', 'params'] }
    ],
    requiresAuth: true,
    progressive: false,
    evidenceRequired: ['tampered_requests', 'response_diffs'],
    severity: 'medium',
    category: 'CUSTOM'
  },

  {
    id: 'cors-misconfig',
    name: 'CORS Misconfiguration',
    description: 'Tests for Cross-Origin Resource Sharing misconfigurations',
    tsc: ['Security'],
    cc: ['CC6.1', 'CC6.6'],
    tools: [
      { name: 'cors-scanner', command: ['python3', '/scripts/cors_scanner.py', '--target', '{target}'] }
    ],
    requiresAuth: false,
    progressive: false,
    evidenceRequired: ['cors_headers', 'origin_tests', 'preflight_analysis'],
    severity: 'medium',
    category: 'CUSTOM'
  },

  {
    id: 'port-scanning',
    name: 'Port Scanning',
    description: 'Identifies open ports and services for security assessment',
    tsc: ['Security'],
    cc: ['CC7.2'], // Security event detection
    tools: [
      { name: 'nmap', command: ['nmap', '-sS', '-sV', '-p-', '{target}'] }
    ],
    requiresAuth: false,
    progressive: false,
    evidenceRequired: ['open_ports', 'service_versions', 'os_detection'],
    severity: 'low',
    category: 'CUSTOM'
  },

  {
    id: 'ip-spoofing',
    name: 'IP Spoofing via Headers',
    description: 'Tests for IP spoofing vulnerabilities through HTTP headers',
    tsc: ['Security'],
    cc: ['CC7.1', 'CC7.2'],
    tools: [
      { name: 'custom', command: ['python3', '/scripts/ip_spoof_test.py', '--target', '{target}'] }
    ],
    requiresAuth: true,
    progressive: false,
    evidenceRequired: ['header_manipulation', 'log_poisoning', 'bypass_evidence'],
    severity: 'medium',
    category: 'CUSTOM'
  }
];

// Precomputed embeddings for attacks (to be generated by scripts/generate-embeddings.py)
export const attackEmbeddings: { [attackId: string]: number[] } = {};

// Helper function to get attacks by CC
export function getAttacksByCC(cc: string): Attack[] {
  return attacks.filter(attack => attack.cc.includes(cc));
}

// Helper function to get attacks by TSC
export function getAttacksByTSC(tsc: string): Attack[] {
  return attacks.filter(attack => attack.tsc.includes(tsc));
}

// Helper function to get attacks requiring authentication
export function getAuthRequiredAttacks(): Attack[] {
  return attacks.filter(attack => attack.requiresAuth);
}

// Helper function to get progressive attacks
export function getProgressiveAttacks(): Attack[] {
  return attacks.filter(attack => attack.progressive);
}