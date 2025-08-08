import { v4 as uuidv4 } from 'uuid';
import { SecurityTool, prepareToolCommand } from '../tools/tools.js';
import { TestResult, Finding, Evidence } from '../../models/testResult.js';
import { DockerService } from '../../services/dockerService.js';
import { createLogger } from '../../utils/logger.js';
import { safeStringify } from '../../utils/serialize.js';
import path from 'path';
import fs from 'fs/promises';

const logger = createLogger('ToolHandler');

export interface ToolExecutionContext {
  tool: SecurityTool;
  params: Record<string, any>;
  workflowId: string;
  attackId: string;
}

export interface ToolExecutionOptions {
  timeout?: number;
  retryCount?: number;
  outputDir?: string;
}

export class ToolHandler {
  private dockerService: DockerService;
  private outputBaseDir: string;

  constructor() {
    this.dockerService = new DockerService();
    this.outputBaseDir = process.env.OUTPUT_DIR || '/tmp/mcp-results';
  }

  /**
   * Initialize the tool handler
   */
  async initialize(): Promise<void> {
    logger.info('Initializing tool handler');
    
    // Ensure output directory exists
    await fs.mkdir(this.outputBaseDir, { recursive: true });
    
    // Initialize Docker service only if not in mock mode
    if (process.env.MOCK_DOCKER !== 'true') {
      await this.dockerService.initialize();
    } else {
      logger.info('Docker initialization skipped - using mock mode');
    }
    
    logger.info('Tool handler initialized');
  }

  /**
   * Execute a security tool
   */
  async execute(
    context: ToolExecutionContext,
    options: ToolExecutionOptions = {}
  ): Promise<TestResult> {
    const startTime = Date.now();
    const { tool, params, workflowId, attackId } = context;
    const outputDir = path.join(this.outputBaseDir, workflowId, attackId);

    logger.info(`Executing tool: ${tool.name}`, { workflowId, attackId });

    try {
      // Create output directory
      await fs.mkdir(outputDir, { recursive: true });

      // Prepare command with parameters
      const command = prepareToolCommand(tool, params);
      
      // Execute in Docker
      const result = await this.executeInDocker(tool, command, outputDir, options);
      
      // Parse results based on tool type
      const findings = await this.parseToolOutput(tool, result.output, outputDir);
      
      // Collect evidence
      const evidence = await this.collectEvidence(tool, outputDir);

      const duration = Date.now() - startTime;

      return {
        id: uuidv4(),
        workflowId,
        attackType: tool.attackType,
        tool: tool.name,
        target: params.target || 'unknown',
        timestamp: new Date(),
        duration,
        findings,
        rawOutput: result.output,
        score: this.calculateScore(findings),
        severity: this.determineSeverity(findings),
        cost: {
          executionTime: duration,
          cpuUsage: result.metrics?.cpuUsage,
          memoryUsage: result.metrics?.memoryUsage
        },
        evidence,
        status: 'completed'
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Tool execution failed: ${tool.name}`, { error, workflowId, attackId });

      return {
        id: uuidv4(),
        workflowId,
        attackType: tool.attackType,
        tool: tool.name,
        target: params.target || 'unknown',
        timestamp: new Date(),
        duration,
        findings: [],
        rawOutput: error instanceof Error ? error.message : 'Unknown error',
        score: 100, // No findings = perfect score
        severity: 'info',
        cost: {
          executionTime: duration
        },
        evidence: [],
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Execute tool in Docker container
   */
  private async executeInDocker(
    tool: SecurityTool,
    command: string[],
    outputDir: string,
    options: ToolExecutionOptions
  ): Promise<{ output: string; exitCode: number; metrics?: any }> {
    const containerConfig = {
      image: tool.containerImage || 'kalilinux/kali-rolling',
      command,
      name: `soc2-test-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      workflowId: options.workflowId,
      volumes: {
        [outputDir]: '/output'
      },
      workingDir: '/output',
      timeout: options.timeout || tool.timeout || 300000, // 5 minutes default
      environment: {
        OUTPUT_DIR: '/output',
        ...process.env
      }
    };

            if (process.env.MOCK_DOCKER === 'true') {
      // Mock execution for testing
      logger.info('Mock Docker execution', { tool: tool.name, command });
      
      // Emit command execution event
      const commandDetails = {
        workflowId: workflowId || 'unknown',
        attackId: attackId || 'unknown',
        tool: tool.name,
        command: command.join(' '),
        container: tool.container,
        timestamp: new Date().toISOString()
      };
      
      // Emit globally so it can be caught by the server
      process.emit('workflow:command:execute' as any, commandDetails);
      
      // Add realistic delays based on tool type
      const executionTime = this.getRealisticExecutionTime(tool);
      logger.info(`Simulating ${tool.name} execution for ${executionTime}ms`);
      
      // Simulate progressive output
      await this.simulateProgressiveExecution(tool, workflowId, attackId, executionTime);
      
      return {
        output: this.generateMockOutput(tool),
        exitCode: 0,
        metrics: {
          cpuUsage: 20 + Math.random() * 60, // 20-80% CPU
          memoryUsage: 512 * 1024 * 1024 + Math.random() * 512 * 1024 * 1024 // 512MB-1GB
        }
      };
    }

    return this.dockerService.runContainer(containerConfig);
  }

  /**
   * Parse tool output based on tool type
   */
  private async parseToolOutput(
    tool: SecurityTool,
    output: string,
    outputDir: string
  ): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      switch (tool.name) {
        case 'port-scanning':
          // Parse nmap XML output
          const nmapFile = path.join(outputDir, 'scan_results.xml');
          if (await this.fileExists(nmapFile)) {
            const nmapData = await fs.readFile(nmapFile, 'utf-8');
            findings.push(...this.parseNmapResults(nmapData));
          }
          break;

        case 'xss-detection':
        case 'api-security-scan':
          // Parse ZAP JSON output
          findings.push(...this.parseZapResults(output));
          break;

        case 'blind-sql-injection':
          // Parse sqlmap output
          findings.push(...this.parseSqlmapResults(output));
          break;

        case 'ssl-tls-analysis':
          // Parse testssl.sh JSON output
          const sslFile = path.join(outputDir, 'ssl_report.json');
          if (await this.fileExists(sslFile)) {
            const sslData = await fs.readFile(sslFile, 'utf-8');
            findings.push(...this.parseTestsslResults(sslData));
          }
          break;

        default:
          // Generic parsing for other tools
          findings.push(...this.parseGenericOutput(output, tool));
      }
    } catch (error) {
      logger.error(`Failed to parse tool output: ${tool.name}`, { error });
    }

    return findings;
  }

  /**
   * Get realistic execution time for a tool
   */
  private getRealisticExecutionTime(tool: SecurityTool): number {
    const executionTimes: Record<string, [number, number]> = {
      'port-scanning': [15000, 30000], // 15-30 seconds
      'xss-detection': [8000, 15000], // 8-15 seconds
      'blind-sql-injection': [10000, 20000], // 10-20 seconds
      'clickjacking': [2000, 5000], // 2-5 seconds
      'ssl-tls-analysis': [5000, 10000], // 5-10 seconds
      'authentication-brute-force': [20000, 40000], // 20-40 seconds
      'data-validation': [5000, 12000], // 5-12 seconds
      'session-token-analysis': [8000, 15000], // 8-15 seconds
      'privilege-escalation': [12000, 25000], // 12-25 seconds
      'api-security-scan': [10000, 18000] // 10-18 seconds
    };
    
    const [min, max] = executionTimes[tool.name] || [5000, 10000];
    return Math.floor(Math.random() * (max - min) + min);
  }

  /**
   * Simulate progressive execution with status updates
   */
  private async simulateProgressiveExecution(
    tool: SecurityTool,
    workflowId: string,
    attackId: string,
    totalTime: number
  ): Promise<void> {
    const updates = [
      { percent: 10, message: 'Initializing tool...' },
      { percent: 25, message: 'Scanning target...' },
      { percent: 50, message: 'Analyzing results...' },
      { percent: 75, message: 'Generating report...' },
      { percent: 90, message: 'Finalizing...' }
    ];
    
    for (const update of updates) {
      await new Promise(resolve => setTimeout(resolve, (totalTime * update.percent) / 100));
      
      // Emit progress update
      process.emit('workflow:tool:progress' as any, {
        workflowId,
        attackId,
        tool: tool.name,
        progress: update.percent,
        message: update.message,
        timestamp: new Date().toISOString()
      });
    }
    
    // Wait for remaining time
    await new Promise(resolve => setTimeout(resolve, totalTime * 0.1));
  }

  /**
   * Mock output generation for testing
   */
  private generateMockOutput(tool: SecurityTool): string {
    const mockOutputs: Record<string, () => string> = {
      'port-scanning': () => {
        const ports = [22, 80, 443, 3306, 5432, 8080, 8443];
        const openPorts = ports.filter(() => Math.random() > 0.6);
        let output = 'PORT     STATE SERVICE\n';
        openPorts.forEach(port => {
          const service = {
            22: 'ssh', 80: 'http', 443: 'https', 
            3306: 'mysql', 5432: 'postgresql',
            8080: 'http-proxy', 8443: 'https-alt'
          }[port] || 'unknown';
          output += `${port}/tcp   open  ${service}\n`;
        });
        return output;
      },
      'xss-detection': () => {
        const hasVuln = Math.random() > 0.7;
        if (hasVuln) {
          return '{"alerts":[{"risk":"High","confidence":"Medium","url":"http://example.com/search","parameter":"q","attack":"<script>alert(1)</script>"}]}';
        }
        return '{"alerts":[]}';
      },
      'blind-sql-injection': () => {
        const hasVuln = Math.random() > 0.8;
        if (hasVuln) {
          return '[INFO] found SQL injection on parameter "id"\n[INFO] payload: id=1\' AND 5678=5678-- ';
        }
        return '[INFO] No SQL injection vulnerabilities found';
      },
      'clickjacking': () => {
        const hasHeader = Math.random() > 0.5;
        return hasHeader ? 'X-Frame-Options header is present' : 'X-Frame-Options header is not present';
      },
      'ssl-tls-analysis': () => {
        const vulnerabilities = [];
        if (Math.random() > 0.7) vulnerabilities.push({"id":"LUCKY13","severity":"LOW","finding":"potentially vulnerable"});
        if (Math.random() > 0.8) vulnerabilities.push({"id":"BEAST","severity":"MEDIUM","finding":"vulnerable"});
        return JSON.stringify({ vulnerabilities });
      }
    };

    const generator = mockOutputs[tool.name];
    return generator ? generator() : 'No vulnerabilities found';
  }

  /**
   * Parse Nmap results
   */
  private parseNmapResults(xmlData: string): Finding[] {
    const findings: Finding[] = [];
    
    // Simple XML parsing - in production, use xml2js
    const portMatches = xmlData.matchAll(/<port protocol="(\w+)" portid="(\d+)">.*?<state state="(\w+)"/g);
    
    for (const match of portMatches) {
      if (match[3] === 'open') {
        findings.push({
          id: uuidv4(),
          type: 'open-port',
          description: `Open port detected: ${match[2]}/${match[1]}`,
          severity: this.getPortSeverity(parseInt(match[2])),
          affectedComponent: `Port ${match[2]}`,
          remediation: 'Review if this port needs to be exposed and implement proper access controls'
        });
      }
    }

    return findings;
  }

  /**
   * Parse ZAP results
   */
  private parseZapResults(jsonOutput: string): Finding[] {
    const findings: Finding[] = [];
    
    try {
      const data = JSON.parse(jsonOutput);
      const alerts = data.alerts || [];

      for (const alert of alerts) {
        findings.push({
          id: uuidv4(),
          type: alert.pluginid || 'web-vulnerability',
          description: alert.name || alert.alert || 'Web vulnerability detected',
          severity: this.mapZapRiskToSeverity(alert.risk),
          cvssScore: alert.cvss,
          affectedComponent: alert.url || alert.parameter,
          remediation: alert.solution || 'Implement proper input validation and output encoding',
          evidence: alert.evidence || alert.attack
        });
      }
    } catch (error) {
      logger.error('Failed to parse ZAP results', { error });
    }

    return findings;
  }

  /**
   * Parse SQLMap results
   */
  private parseSqlmapResults(output: string): Finding[] {
    const findings: Finding[] = [];
    
    if (output.includes('found SQL injection') || output.includes('is vulnerable')) {
      findings.push({
        id: uuidv4(),
        type: 'sql-injection',
        description: 'SQL Injection vulnerability detected',
        severity: 'critical',
        cvssScore: 9.8,
        affectedComponent: 'Database query parameter',
        remediation: 'Use parameterized queries and input validation',
        evidence: output.match(/payload: (.+)/)?.[1]
      });
    }

    return findings;
  }

  /**
   * Parse testssl.sh results
   */
  private parseTestsslResults(jsonData: string): Finding[] {
    const findings: Finding[] = [];
    
    try {
      const data = JSON.parse(jsonData);
      const vulnerabilities = data.vulnerabilities || [];

      for (const vuln of vulnerabilities) {
        if (vuln.finding !== 'not vulnerable') {
          findings.push({
            id: uuidv4(),
            type: 'ssl-vulnerability',
            description: `SSL/TLS vulnerability: ${vuln.id}`,
            severity: this.mapSslSeverity(vuln.severity),
            cveId: vuln.cve,
            affectedComponent: 'SSL/TLS configuration',
            remediation: 'Update SSL/TLS configuration and cipher suites'
          });
        }
      }
    } catch (error) {
      logger.error('Failed to parse testssl results', { error });
    }

    return findings;
  }

  /**
   * Generic output parsing
   */
  private parseGenericOutput(output: string, tool: SecurityTool): Finding[] {
    const findings: Finding[] = [];
    
    // Look for common vulnerability indicators
    const vulnIndicators = [
      /vulnerability|vulnerable/i,
      /exploit|exploitable/i,
      /injection|injectable/i,
      /disclosure/i,
      /misconfiguration/i
    ];

    for (const indicator of vulnIndicators) {
      if (indicator.test(output)) {
        findings.push({
          id: uuidv4(),
          type: tool.attackType.toLowerCase().replace(/\s+/g, '-'),
          description: `Potential ${tool.attackType} vulnerability detected`,
          severity: 'medium',
          affectedComponent: tool.attackType,
          remediation: 'Review application security controls',
          evidence: output.substring(0, 200)
        });
        break;
      }
    }

    return findings;
  }

  /**
   * Collect evidence files
   */
  private async collectEvidence(tool: SecurityTool, outputDir: string): Promise<Evidence[]> {
    const evidence: Evidence[] = [];
    
    try {
      const files = await fs.readdir(outputDir);
      
      for (const file of files) {
        const filePath = path.join(outputDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isFile() && stats.size < 10 * 1024 * 1024) { // Max 10MB
          evidence.push({
            type: this.getEvidenceType(file),
            filename: file,
            path: filePath,
            size: stats.size,
            mimeType: this.getMimeType(file)
          });
        }
      }
    } catch (error) {
      logger.error('Failed to collect evidence', { error });
    }

    return evidence;
  }

  /**
   * Calculate security score based on findings
   */
  private calculateScore(findings: Finding[]): number {
    if (findings.length === 0) return 100;

    const severityWeights = {
      critical: 30,
      high: 20,
      medium: 10,
      low: 5,
      info: 1
    };

    const totalWeight = findings.reduce((sum, finding) => {
      return sum + (severityWeights[finding.severity] || 0);
    }, 0);

    return Math.max(0, 100 - Math.min(totalWeight, 100));
  }

  /**
   * Determine overall severity
   */
  private determineSeverity(findings: Finding[]): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    if (findings.some(f => f.severity === 'critical')) return 'critical';
    if (findings.some(f => f.severity === 'high')) return 'high';
    if (findings.some(f => f.severity === 'medium')) return 'medium';
    if (findings.some(f => f.severity === 'low')) return 'low';
    return 'info';
  }

  /**
   * Helper functions
   */
  private getPortSeverity(port: number): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    const criticalPorts = [22, 23, 445, 3389, 5432, 3306, 1433];
    const highPorts = [21, 25, 110, 143];
    
    if (criticalPorts.includes(port)) return 'high';
    if (highPorts.includes(port)) return 'medium';
    return 'low';
  }

  private mapZapRiskToSeverity(risk: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    const mapping: Record<string, 'critical' | 'high' | 'medium' | 'low' | 'info'> = {
      'Critical': 'critical',
      'High': 'high',
      'Medium': 'medium',
      'Low': 'low',
      'Informational': 'info'
    };
    return mapping[risk] || 'medium';
  }

  private mapSslSeverity(severity: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    return severity.toLowerCase() as any || 'medium';
  }

  private getEvidenceType(filename: string): 'screenshot' | 'log' | 'payload' | 'response' | 'file' {
    if (filename.endsWith('.png') || filename.endsWith('.jpg')) return 'screenshot';
    if (filename.endsWith('.log')) return 'log';
    if (filename.includes('payload')) return 'payload';
    if (filename.includes('response')) return 'response';
    return 'file';
  }

  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.txt': 'text/plain',
      '.log': 'text/plain',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.pdf': 'application/pdf'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up tool handler');
    await this.dockerService.cleanup();
  }
} 