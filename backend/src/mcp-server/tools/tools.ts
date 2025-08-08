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
    command: ['/usr/bin/sqlmap', '-u', '{target}', '--batch', '--level=5', '--risk=3', '--technique=BEUSTQ', '--random-agent', '--tamper=space2comment,charencode', '--threads=10', '--output-dir=/tmp/sqlmap', '--flush-session', '--fresh-queries'],
    attackType: 'Blind SQL Injection',
    tsc: ['Security'],
    cc: ['CC6.1', 'CC7.1'],
    requiresAuth: true,
    progressive: true,
    evidenceRequired: ['logs', 'db_dump', 'request_response'],
    timeout: 300000, // 5 minutes
    containerImage: 'secsi/sqlmap:latest'
  },
  {
    name: 'xss-detection',
    description: 'Tests for Cross-Site Scripting vulnerabilities',
    command: ['sh', '-c', 'cd /tmp && /zap/zap-baseline.py -t {target} -j -m 3 -T 3'],
    attackType: 'Cross-Site Scripting (XSS)',
    tsc: ['Security'],
    cc: ['CC6.1', 'CC7.2'],
    requiresAuth: false,
    progressive: true,
    evidenceRequired: ['vulnerability_report', 'payload_examples'],
    timeout: 180000, // 3 minutes
    containerImage: 'zaproxy/zap-stable:latest'
  },
  {
    name: 'clickjacking',
    description: 'Checks for clickjacking vulnerabilities through header analysis',
    command: ['/usr/bin/nikto', '-h', '{target}', '-Plugins', 'headers', '-Format', 'json', '-output', '/tmp/nikto-report.json'],
    attackType: 'Clickjacking',
    tsc: ['Security'],
    cc: ['CC6.1'],
    requiresAuth: false,
    progressive: false,
    evidenceRequired: ['headers_analysis', 'recommendations'],
    timeout: 120000, // 2 minutes
    containerImage: 'securecodebox/nikto:latest'
  },
  {
    name: 'port-scanning',
    description: 'Comprehensive port scan to identify exposed services',
    command: ['nmap', '-sS', '-sV', '-A', '-T4', '--top-ports', '1000', '{target}', '-oX', '/tmp/scan_results.xml'],
    attackType: 'Port Scanning',
    tsc: ['Availability', 'Security'],
    cc: ['CC6.6', 'CC7.1'],
    requiresAuth: false,
    progressive: true,
    evidenceRequired: ['open_ports', 'service_versions', 'os_detection'],
    timeout: 300000, // 5 minutes (reduced scope for faster results)
    containerImage: 'instrumentisto/nmap:latest'
  },
  {
    name: 'authentication-brute-force',
    description: 'Tests authentication mechanisms for weak credentials',
    command: ['sh', '-c', 'apt-get update -qq && apt-get install -qq -y hydra && echo "admin\\ntest" > /tmp/users.txt && echo "password\\n123456" > /tmp/passwords.txt && hydra -L /tmp/users.txt -P /tmp/passwords.txt -f -V -u {target} http-get /'],
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
    command: ['--jsonfile', 'ssl_report.json', '--severity', 'LOW', '{target}'],
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
    command: ['sh', '-c', 'cd /tmp && /zap/zap-baseline.py -t {target} -j -m 5 -d'],
    attackType: 'API Security',
    tsc: ['Security', 'Data Integrity'],
    cc: ['CC6.1', 'CC7.1', 'CC7.2'],
    requiresAuth: true,
    progressive: true,
    evidenceRequired: ['endpoint_vulnerabilities', 'authentication_issues', 'data_exposure'],
    timeout: 420000, // 7 minutes
    containerImage: 'zaproxy/zap-stable:latest'
  },
  {
    name: 'subdomain-scanner',
    description: 'Enumerate subdomains for the target domain',
    command: ['sh', '-c', 'echo "{domain}" | subfinder -silent'],
    attackType: 'Subdomain Enumeration',
    tsc: ['Security'],
    cc: ['CC6.6', 'CC7.1'],
    requiresAuth: false,
    progressive: true,
    evidenceRequired: ['discovered_subdomains', 'dns_records'],
    timeout: 300000, // 5 minutes
    containerImage: 'projectdiscovery/subfinder:latest'
  },
  {
    name: 'directory-scanner',
    description: 'Discover hidden directories and files',
    command: ['gobuster', 'dir', '-u', '{target}', '-w', '/usr/share/wordlists/dirb/common.txt', '-x', 'php,html,js,txt,json,xml,bak,old,log,sql,zip,tar,gz', '-o', '/tmp/directories.txt', '-q'],
    attackType: 'Directory Traversal',
    tsc: ['Security'],
    cc: ['CC6.1', 'CC6.6'],
    requiresAuth: false,
    progressive: true,
    evidenceRequired: ['discovered_paths', 'sensitive_files'],
    timeout: 300000, // 5 minutes
    containerImage: 'kalilinux/kali-rolling'
  },
  {
    name: 'jwt-scanner',
    description: 'Test JWT token vulnerabilities',
    command: ['jwt_tool', '{token}', '-M', 'at', '-t', '{target}', '-rc', '/tmp/jwt-config.json'],
    attackType: 'JWT Token Security',
    tsc: ['Security', 'Authentication'],
    cc: ['CC6.1', 'CC6.2'],
    requiresAuth: true,
    progressive: false,
    evidenceRequired: ['vulnerable_algorithms', 'token_manipulation', 'secret_weakness'],
    timeout: 180000, // 3 minutes
    containerImage: 'ticarpi/jwt_tool:latest'
  },
  {
    name: 'dependency-check',
    description: 'Scan for vulnerable dependencies',
    command: ['dependency-check.sh', '--project', 'target-scan', '--scan', '{target}', '--format', 'JSON', '--out', '/tmp/dependency-report.json'],
    attackType: 'Vulnerable Components',
    tsc: ['Security'],
    cc: ['CC7.1', 'CC8.1'],
    requiresAuth: false,
    progressive: false,
    evidenceRequired: ['vulnerable_libraries', 'cve_list', 'severity_scores'],
    timeout: 300000, // 5 minutes
    containerImage: 'owasp/dependency-check:latest'
  },
  {
    name: 'nmap',
    description: 'Alias for port-scanning tool',
    command: ['nmap', '-sS', '-sV', '-A', '-T4', '--top-ports', '1000', '{target}', '-oX', '/tmp/scan_results.xml'],
    attackType: 'Network Scanning',
    tsc: ['Availability', 'Security'],
    cc: ['CC6.6', 'CC7.1'],
    requiresAuth: false,
    progressive: true,
    evidenceRequired: ['open_ports', 'service_versions', 'os_detection'],
    timeout: 300000, // 5 minutes
    containerImage: 'instrumentisto/nmap:latest'
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
  // Extract domain from URL for subdomain scanner
  if (tool.name === 'subdomain-scanner' && params.target && !params.domain) {
    try {
      const url = new URL(params.target);
      params.domain = url.hostname;
    } catch (e) {
      // If not a valid URL, assume it's already a domain
      params.domain = params.target;
    }
  }
  
  return tool.command.map(arg => {
    // Replace placeholders with actual values
    return arg.replace(/{(\w+)}/g, (match, key) => {
      return params[key] || match;
    });
  });
} 