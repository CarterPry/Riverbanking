/**
 * Security testing tools definition for SOC2 compliance
 */

export interface SecurityTool {
  name: string;
  description: string;
  command: string[];
  attackType: string;
  tsc: string[];
  cc: string[];
  requiresAuth: boolean;
  progressive: boolean;
  evidenceRequired: string[];
  timeout?: number;
  containerImage?: string;
}

/**
 * Curated list of security testing tools covering ~80% of SOC2 requirements
 */
export const tools: SecurityTool[] = [
  {
    name: 'blind-sql-injection',
    description: 'Injects SQL to infer data existence through application behavior',
    command: ['sqlmap', '--url', '{target}', '--batch', '--level=5', '--risk=3', '--technique=B'],
    attackType: 'Blind SQL Injection',
    tsc: ['Security'],
    cc: ['CC6.1', 'CC7.1'],
    requiresAuth: true,
    progressive: true,
    evidenceRequired: ['logs', 'db_dump', 'request_response'],
    timeout: 300000, // 5 minutes
    containerImage: 'kalilinux/kali-rolling'
  },
  {
    name: 'xss-detection',
    description: 'Tests for Cross-Site Scripting vulnerabilities',
    command: ['zap-cli', 'active-scan', '--scanners', 'xss', '--url', '{target}'],
    attackType: 'Cross-Site Scripting (XSS)',
    tsc: ['Security'],
    cc: ['CC6.1', 'CC7.2'],
    requiresAuth: false,
    progressive: true,
    evidenceRequired: ['vulnerability_report', 'payload_examples'],
    timeout: 180000, // 3 minutes
    containerImage: 'zaproxy/zap-stable'
  },
  {
    name: 'clickjacking',
    description: 'Checks for clickjacking vulnerabilities through header analysis',
    command: ['nikto', '-h', '{target}', '-Plugins', 'headers', '-Format', 'json'],
    attackType: 'Clickjacking',
    tsc: ['Security'],
    cc: ['CC6.1'],
    requiresAuth: false,
    progressive: false,
    evidenceRequired: ['headers_analysis', 'recommendations'],
    timeout: 120000, // 2 minutes
    containerImage: 'kalilinux/kali-rolling'
  },
  {
    name: 'port-scanning',
    description: 'Comprehensive port scan to identify exposed services',
    command: ['nmap', '-sS', '-sV', '-O', '-A', '-p-', '{target}', '-oX', 'scan_results.xml'],
    attackType: 'Port Scanning',
    tsc: ['Availability', 'Security'],
    cc: ['CC6.6', 'CC7.1'],
    requiresAuth: false,
    progressive: true,
    evidenceRequired: ['open_ports', 'service_versions', 'os_detection'],
    timeout: 600000, // 10 minutes
    containerImage: 'kalilinux/kali-rolling'
  },
  {
    name: 'authentication-brute-force',
    description: 'Tests authentication mechanisms for weak credentials',
    command: ['hydra', '-L', 'users.txt', '-P', 'passwords.txt', '{target}', 'http-post-form', '{login_path}:username=^USER^&password=^PASS^:Invalid'],
    attackType: 'Authentication Brute Force',
    tsc: ['Security', 'Authentication'],
    cc: ['CC6.1', 'CC6.2'],
    requiresAuth: false,
    progressive: true,
    evidenceRequired: ['attempted_credentials', 'success_rate', 'lockout_policy'],
    timeout: 300000, // 5 minutes
    containerImage: 'kalilinux/kali-rolling'
  },
  {
    name: 'session-token-analysis',
    description: 'Analyzes session tokens for randomness and security',
    command: ['burpsuite', '--project-file', 'session_analysis.burp', '--config-file', 'token_analysis.json'],
    attackType: 'Session Token Security',
    tsc: ['Security', 'Authentication'],
    cc: ['CC6.1', 'CC6.3'],
    requiresAuth: true,
    progressive: false,
    evidenceRequired: ['token_samples', 'entropy_analysis', 'predictability_report'],
    timeout: 240000, // 4 minutes
    containerImage: 'kalilinux/kali-rolling'
  },
  {
    name: 'privilege-escalation',
    description: 'Tests for privilege escalation vulnerabilities',
    command: ['metasploit', '-r', 'privilege_escalation.rc', '-o', 'results.json'],
    attackType: 'Privilege Escalation',
    tsc: ['Security', 'Authorization'],
    cc: ['CC6.1', 'CC6.3', 'CC7.2'],
    requiresAuth: true,
    progressive: true,
    evidenceRequired: ['exploit_attempts', 'privilege_changes', 'system_access'],
    timeout: 480000, // 8 minutes
    containerImage: 'metasploitframework/metasploit-framework'
  },
  {
    name: 'data-validation',
    description: 'Tests input validation and data integrity controls',
    command: ['wfuzz', '-c', '-z', 'file,payloads.txt', '--hc', '404', '{target}/FUZZ'],
    attackType: 'Input Validation',
    tsc: ['Data Integrity', 'Security'],
    cc: ['CC6.1', 'CC7.3'],
    requiresAuth: false,
    progressive: true,
    evidenceRequired: ['invalid_inputs', 'error_responses', 'validation_gaps'],
    timeout: 180000, // 3 minutes
    containerImage: 'kalilinux/kali-rolling'
  },
  {
    name: 'ssl-tls-analysis',
    description: 'Analyzes SSL/TLS configuration for security weaknesses',
    command: ['testssl.sh', '--full', '{target}', '--jsonfile', 'ssl_report.json'],
    attackType: 'SSL/TLS Security',
    tsc: ['Security', 'Availability'],
    cc: ['CC6.1', 'CC6.7'],
    requiresAuth: false,
    progressive: false,
    evidenceRequired: ['cipher_suites', 'protocol_versions', 'certificate_analysis'],
    timeout: 180000, // 3 minutes
    containerImage: 'drwetter/testssl.sh'
  },
  {
    name: 'api-security-scan',
    description: 'Comprehensive API security testing',
    command: ['zap-cli', 'openapi', '-f', 'openapi.json', '-u', '{target}', '--format', 'json'],
    attackType: 'API Security',
    tsc: ['Security', 'Data Integrity'],
    cc: ['CC6.1', 'CC7.1', 'CC7.2'],
    requiresAuth: true,
    progressive: true,
    evidenceRequired: ['endpoint_vulnerabilities', 'authentication_issues', 'data_exposure'],
    timeout: 420000, // 7 minutes
    containerImage: 'zaproxy/zap-stable'
  }
];

/**
 * Get tools by attack type
 */
export function getToolsByAttackType(attackType: string): SecurityTool[] {
  return tools.filter(tool => tool.attackType === attackType);
}

/**
 * Get tools by TSC criteria
 */
export function getToolsByTSC(tsc: string): SecurityTool[] {
  return tools.filter(tool => tool.tsc.includes(tsc));
}

/**
 * Get tools that require authentication
 */
export function getAuthRequiredTools(): SecurityTool[] {
  return tools.filter(tool => tool.requiresAuth);
}

/**
 * Get progressive testing tools
 */
export function getProgressiveTools(): SecurityTool[] {
  return tools.filter(tool => tool.progressive);
}

/**
 * Prepare tool command with actual values
 */
export function prepareToolCommand(tool: SecurityTool, params: Record<string, string>): string[] {
  return tool.command.map(arg => {
    // Replace placeholders with actual values
    return arg.replace(/{(\w+)}/g, (match, key) => {
      return params[key] || match;
    });
  });
} 