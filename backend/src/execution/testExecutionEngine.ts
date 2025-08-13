import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import Docker from 'dockerode';
import { v4 as uuidv4 } from 'uuid';
import { EnhancedRestraintSystem } from '../restraint/enhancedRestraintSystem.js';
import { AIDecisionLogger } from '../audit/aiDecisionLogger.js';
import { createLogger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const logger = createLogger('TestExecutionEngine');
import { getDockerTool, isToolAvailable, DOCKER_TOOLS } from './dockerTools.js';
import { ToolValidator } from './toolValidator.js';

export interface ExecutionRequest {
  tool: string;
  parameters: Record<string, any>;
  workflowId: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  timeout?: number;
  metadata?: Record<string, any>;
}

interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  required: boolean;
  default?: any;
  description: string;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    enum?: any[];
  };
}

interface ToolDefinition {
  name: string;
  displayName: string;
  description: string;
  dockerImage: string;
  command: string;
  parameters: ToolParameter[];
  outputParser: (output: string) => any[];
  requiresAuth?: boolean;
  safetyLevel: 'low' | 'medium' | 'high' | 'critical';
  timeout: number;
  retryable: boolean;
  owaspCategories?: string[];
  ccControls?: string[];
}

export interface ExecutionResult {
  requestId: string;
  tool: string;
  status: 'success' | 'failed' | 'timeout' | 'skipped';
  startTime: Date;
  endTime: Date;
  duration: number;
  output?: string;
  findings?: any[];
  error?: string;
  metadata?: Record<string, any>;
}

export class TestExecutionEngine extends EventEmitter {
  private docker: Docker;
  private tools: Map<string, ToolDefinition> = new Map();
  private activeExecutions: Map<string, any> = new Map();
  private executionQueue: ExecutionRequest[] = [];
  private restraintSystem: EnhancedRestraintSystem;
  private decisionLogger: AIDecisionLogger;
  private maxConcurrent: number = 3;
  private currentExecutions: number = 0;
  private validator: ToolValidator;

  constructor(
    restraintSystem: EnhancedRestraintSystem,
    decisionLogger: AIDecisionLogger,
    options?: { maxConcurrent?: number }
  ) {
    super();
    this.docker = new Docker();
    this.restraintSystem = restraintSystem;
    this.decisionLogger = decisionLogger;
    this.maxConcurrent = options?.maxConcurrent || 3;
    this.validator = new ToolValidator();
    
    this.initializeTools();
    this.startQueueProcessor();
  }

  private initializeTools(): void {
    // Register tools from dockerTools.ts
    for (const [toolName, dockerTool] of Object.entries(DOCKER_TOOLS)) {
      this.registerTool({
        name: toolName,
        displayName: toolName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        description: `Execute ${toolName}`,
        dockerImage: dockerTool.image,
        command: '', // Will be built dynamically from dockerTool
        parameters: [
          {
            name: 'target',
            type: 'string',
            required: true,
            description: 'Target to scan'
          }
        ],
        outputParser: this.parseGenericOutput.bind(this),
        safetyLevel: 'low',
        timeout: dockerTool.timeout,
        retryable: true,
        owaspCategories: ['A05:2021'],
        ccControls: ['CC6.6']
      });
    }

    // Override specific parsers for known tools
    const subdomainTool = this.tools.get('subdomain-scanner');
    if (subdomainTool) {
      subdomainTool.outputParser = this.parseSubdomainOutput.bind(this);
    }

    const portTool = this.tools.get('port-scanner');
    if (portTool) {
      portTool.outputParser = this.parseNmapOutput.bind(this);
    }
  }

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    logger.info('Tool registered', { 
      tool: tool.name, 
      dockerImage: tool.dockerImage 
    });
  }

  getAvailableTools(): string[] {
    return Array.from(this.tools.keys());
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const requestId = uuidv4();
    const startTime = new Date();

    logger.info('Execution request received', {
      requestId,
      tool: request.tool,
      workflowId: request.workflowId
    });

    // Check if tool exists
    const tool = this.tools.get(request.tool);
    if (!tool) {
      logger.error('Tool not found', { tool: request.tool });
      return {
        requestId,
        tool: request.tool,
        status: 'failed',
        startTime,
        endTime: new Date(),
        duration: 0,
        error: `Tool ${request.tool} not found`
      };
    }

    // Apply restraints
    const restraintDecision = await this.restraintSystem.evaluateTest({
      workflowId: request.workflowId,
      test: {
        tool: request.tool,
        parameters: request.parameters,
        requiresAuth: tool.requiresAuth,
        priority: request.priority
      },
      target: request.parameters.target
    });

    if (!restraintDecision.approved) {
      logger.warn('Execution denied by restraint system', {
        requestId,
        reason: restraintDecision.reason
      });

      return {
        requestId,
        tool: request.tool,
        status: 'skipped',
        startTime,
        endTime: new Date(),
        duration: 0,
        error: `Restraint: ${restraintDecision.reason}`
      };
    }

    // Apply mitigations if any
    if (restraintDecision.mitigations) {
      request.parameters = { ...request.parameters, ...restraintDecision.mitigations };
    }

    // Queue execution
    return new Promise((resolve) => {
      const execution = {
        requestId,
        request,
        tool,
        startTime,
        resolve,
        retryCount: 0
      };

      this.executionQueue.push(request);
      this.activeExecutions.set(requestId, execution);
      
      // Process queue
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    while (this.executionQueue.length > 0 && this.currentExecutions < this.maxConcurrent) {
      const request = this.executionQueue.shift()!;
      this.currentExecutions++;
      
      // Execute in background
      this.executeRequest(request).catch(error => {
        logger.error('Execution failed', { error, tool: request.tool });
      }).finally(() => {
        this.currentExecutions--;
        // Process next in queue
        setImmediate(() => this.processQueue());
      });
    }
  }

  private async executeRequest(request: ExecutionRequest): Promise<void> {
    const execution = Array.from(this.activeExecutions.values()).find(
      e => e.request === request
    );
    
    if (!execution) {
      logger.error('Execution not found for request');
      return;
    }

    const { requestId, tool, startTime, resolve } = execution;

    try {
      // Get Docker tool definition
      const dockerTool = getDockerTool(tool.name);
      if (!dockerTool) {
        throw new Error(`Docker tool ${tool.name} not found in dockerTools`);
      }

      logger.info('Executing tool', {
        requestId,
        tool: tool.name,
        dockerImage: dockerTool.image
      });

      this.emit('execution:start', {
        requestId,
        tool: tool.name,
        workflowId: request.workflowId
      });

      // Guardrail: sanitize target(s) and validate wordlists
      try {
        // 1) Sanitize target values (dedupe scheme like https://https://)
        const normalizeUrl = (val: string) => {
          let v = val.trim();
          v = v.replace(/^https?:\/\/(https?:\/\/)/i, 'https://');
          v = v.replace(/^http:\/\/https:\/\//i, 'https://');
          v = v.replace(/^https:\/\/http:\/\//i, 'http://');
          return v;
        };
        if (typeof request.parameters.target === 'string') {
          request.parameters.target = normalizeUrl(request.parameters.target);
        } else if (Array.isArray(request.parameters.target)) {
          request.parameters.target = request.parameters.target.map((t: any) => typeof t === 'string' ? normalizeUrl(t) : t);
        }

        // 2) Wordlist auto-resolution within mounted SecLists
        if (typeof request.parameters.wordlist === 'string' && dockerTool.volumeMounts && dockerTool.volumeMounts.length > 0) {
          const wl: string = request.parameters.wordlist;
          if (wl.startsWith('/seclists/')) {
            const bind = dockerTool.volumeMounts.find(b => b.split(':')[1] === '/seclists');
            if (bind) {
              const [hostBase, containerBase] = bind.split(':');
              const toHost = (containerPath: string) => path.join(hostBase, containerPath.substring(containerBase.length));
              const desiredHost = toHost(wl);

              const exists = (p: string) => {
                try { return fs.existsSync(p); } catch { return false; }
              };

              let chosen = wl;
              if (!exists(desiredHost)) {
                // Optimized search: if user provided a filename, search for it under hostBase once
                const filename = path.basename(wl);
                let foundHostPath: string | null = null;
                try {
                  // Use find to return the first absolute match quickly
                  const out = spawnSync('bash', ['-lc', `find ${JSON.stringify(hostBase)} -type f -name ${JSON.stringify(filename)} -print -quit`], { encoding: 'utf8' });
                  const hit = out.stdout.trim();
                  if (hit) { foundHostPath = hit; }
                } catch {}

                if (foundHostPath && exists(foundHostPath)) {
                  // Map back to container path
                  const containerPath = '/seclists' + foundHostPath.substring(hostBase.length);
                  chosen = containerPath;
                } else {
                  // Fallback candidates by category
                  const isApi = wl.includes('/api/');
                  const candidates: string[] = isApi
                    ? [
                        '/seclists/Discovery/Web-Content/api/api-endpoints.txt',
                        '/seclists/Discovery/Web-Content/api/api-seen-in-wild.txt',
                        '/seclists/Discovery/Web-Content/api/api-endpoints-res.txt',
                        '/seclists/Discovery/Web-Content/api/common-api-endpoints-mazen160.txt',
                        '/seclists/Discovery/Web-Content/common.txt'
                      ]
                    : [
                        '/seclists/Discovery/Web-Content/common.txt',
                        '/seclists/Discovery/Web-Content/directory-list-2.3-small.txt'
                      ];
                  for (const c of candidates) {
                    if (exists(toHost(c))) { chosen = c; break; }
                  }
                }

                if (chosen !== wl) {
                  logger.warn('Wordlist not found; using alternative', { original: wl, chosen });
                  request.parameters.wordlist = chosen;
                } else {
                  logger.warn('Wordlist not found and no alternative located', { original: wl });
                }
              }
            }
          }
        }
      } catch (paramGuardError) {
        logger.warn('Parameter guard failed (non-fatal)', { error: paramGuardError instanceof Error ? paramGuardError.message : String(paramGuardError) });
      }

      // Validate & normalize parameters against tool-catalog
      try {
        const { params, warnings } = this.validator.validateAndNormalize(tool.name, request.parameters);
        request.parameters = params;
        for (const w of warnings) {
            // Down-rank noisy meta-param warnings
            if (String(w).includes("Unknown parameter") && /readOnly|url|endpoints|aggressive|intrusiveLevel|extensions|threads|maxThreads|delayMs|requestsPerSecond/.test(String(w))) {
                logger.info('Meta parameter ignored', { tool: tool.name, warning: w });
            } else {
                logger.warn('Tool parameter validation warning', { tool: tool.name, warning: w });
            }
        }
      } catch (e) {
        logger.warn('Tool parameter validation failed (non-fatal)', { tool: tool.name, error: e instanceof Error ? e.message : String(e) });
      }

      // Build command array from dockerTool
      let command: string[] = [];
      let output = '';
      
      // Handle array targets (e.g., from parameter substitution)
      if (Array.isArray(request.parameters.target)) {
        logger.info('Handling array target', {
          tool: tool.name,
          targetCount: request.parameters.target.length,
          targets: request.parameters.target.slice(0, 5) // Log first 5
        });
        
        // For tools that need to run on each target individually
        if (['port-scanner', 'tech-fingerprint', 'directory-scanner', 'directory-bruteforce', 'api-discovery', 'api-fuzzer'].includes(tool.name)) {
          // Run tool for each target and combine outputs
          const outputs: string[] = [];
          for (const target of request.parameters.target) {
            try {
              let singleCommand = dockerTool.command(target, request.parameters);
              // Argv-level validation/defaults
              try {
                const { argv: validatedArgv, warnings } = this.validator.validateArgv(tool.name, singleCommand);
                singleCommand = validatedArgv;
                for (const w of warnings) {
                  logger.warn('Tool argv validation warning', { tool: tool.name, warning: w });
                }
                try { (this as any).metrics?.inc('validator_pass'); } catch {}
              } catch (e) {
                logger.warn('Tool argv validation failed (non-fatal)', { tool: tool.name, error: e instanceof Error ? e.message : String(e) });
                try { (this as any).metrics?.inc('validator_fail'); } catch {}
              }
              const singleOutput = await this.runInDocker(
                dockerTool.image,
                singleCommand,
                Math.max((request.timeout || tool.timeout) / request.parameters.target.length, 60000), // Divide timeout, at least 60s per target
                dockerTool.volumeMounts
              );
              try { (this as any).metrics?.incrementExecuted(Array.isArray(request.parameters.target)? String(target) : undefined); } catch {}
              outputs.push(singleOutput);
            } catch (error) {
              logger.warn('Failed to execute tool on target', {
                tool: tool.name,
                target,
                error: error instanceof Error ? error.message : String(error)
              });
            }
          }
          output = outputs.join('\n');
        } else {
          // For tools that accept multiple targets via stdin or file
          // For now, just use the first target
          command = dockerTool.command(request.parameters.target[0], request.parameters);
          // Argv-level validation/defaults
          try {
            const { argv: validatedArgv, warnings } = this.validator.validateArgv(tool.name, command);
            command = validatedArgv;
            for (const w of warnings) {
              logger.warn('Tool argv validation warning', { tool: tool.name, warning: w });
            }
            try { (this as any).metrics?.inc('validator_pass'); } catch {}
          } catch (e) {
            logger.warn('Tool argv validation failed (non-fatal)', { tool: tool.name, error: e instanceof Error ? e.message : String(e) });
            try { (this as any).metrics?.inc('validator_fail'); } catch {}
          }
          output = await this.runInDocker(
            dockerTool.image,
            command,
            request.timeout || tool.timeout,
            dockerTool.volumeMounts
          );
          try { (this as any).metrics?.incrementExecuted(String(request.parameters.target?.[0] || '')); } catch {}
        }
      } else {
        // Single target
        command = dockerTool.command(request.parameters.target, request.parameters);
        // Argv-level validation/defaults
        try {
          const { argv: validatedArgv, warnings } = this.validator.validateArgv(tool.name, command);
          command = validatedArgv;
          for (const w of warnings) {
            logger.warn('Tool argv validation warning', { tool: tool.name, warning: w });
          }
          try { (this as any).metrics?.inc('validator_pass'); } catch {}
        } catch (e) {
          logger.warn('Tool argv validation failed (non-fatal)', { tool: tool.name, error: e instanceof Error ? e.message : String(e) });
          try { (this as any).metrics?.inc('validator_fail'); } catch {}
        }
        output = await this.runInDocker(
          dockerTool.image,
          command,
          request.timeout || tool.timeout,
          dockerTool.volumeMounts
        );
        try { (this as any).metrics?.incrementExecuted(typeof request.parameters.target === 'string' ? request.parameters.target : undefined); } catch {}
      }
      
      // Parse output
      const findings = tool.outputParser(output);
      
      const endTime = new Date();
      const result: ExecutionResult = {
        requestId,
        tool: tool.name,
        status: 'success',
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        output,
        findings,
        metadata: {
          dockerImage: dockerTool.image,
          command: (command && command.length > 0) ? command.join(' ').substring(0, 100) + '...' : 'Multiple targets',
          parametersUsed: Object.keys(request.parameters),
          targetCount: Array.isArray(request.parameters.target) ? request.parameters.target.length : 1
        }
      };

      logger.info('Tool execution completed', {
        requestId,
        tool: tool.name,
        findingsCount: findings.length,
        duration: result.duration
      });

      this.emit('execution:complete', {
        requestId,
        tool: tool.name,
        workflowId: request.workflowId,
        findings: findings.length
      });

      // Log to decision logger
      await this.decisionLogger.logDecision({
        workflowId: request.workflowId,
        decisionType: 'test-selection',
        input: {
          tool: tool.name,
          parameters: request.parameters
        },
        output: {
          decision: 'executed',
          reasoning: `Executed ${tool.name} successfully`,
          confidence: 1.0
        },
        metadata: {
          model: 'execution-engine',
          tool: tool.name,
          latency: result.duration
        }
      });

      resolve(result);
    } catch (error) {
      const endTime = new Date();
      const result: ExecutionResult = {
        requestId,
        tool: tool.name,
        status: 'failed',
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        error: error instanceof Error ? error.message : String(error)
      };

      logger.error('Tool execution failed', {
        requestId,
        tool: tool.name,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack
        } : String(error)
      });

      this.emit('execution:failed', {
        requestId,
        tool: tool.name,
        workflowId: request.workflowId,
        error: result.error
      });

      resolve(result);
    } finally {
      this.activeExecutions.delete(requestId);
    }
  }

  private async runInDocker(
    image: string,
    command: string[],
    timeout: number = 300000,
    volumeMounts?: string[]
  ): Promise<string> {
    try {
      // Auto-build local images if missing
      if (image.startsWith('local/kiterunner:')) {
        this.ensureLocalKiterunnerImage(image);
      } else if (image.startsWith('local/runner:')) {
        await this.ensureLocalRunnerImage(image);
      }

      logger.info('Starting Docker execution', { image, command });
      
      // First, try to pull the image if it doesn't exist
      try {
        await this.docker.getImage(image).inspect();
        logger.info('Docker image exists', { image });
      } catch (error) {
        // If this is a local image, pulling will fail; ensure we built it above
        if (!image.startsWith('local/')) {
          logger.info('Pulling Docker image', { image });
          try {
            const stream = await this.docker.pull(image);
            await new Promise((resolve, reject) => {
              this.docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
            });
          } catch (pullError) {
            logger.error('Failed to pull Docker image', {
              image,
              error: pullError instanceof Error ? pullError.message : String(pullError)
            });
            throw pullError;
          }
        } else {
          // Re-check after attempted local build
          await this.docker.getImage(image).inspect();
          logger.info('Docker image exists after local build', { image });
        }
      }

      logger.info('Creating Docker container', { image, command });
      
      let container: any;
      try {
        const HostConfig: any = {
          AutoRemove: true,
          Memory: 2 * 1024 * 1024 * 1024, // 2GB to avoid OOM (exit 137)
          CpuQuota: 80000, // allow up to ~80% CPU
          SecurityOpt: ['no-new-privileges'],
          ReadonlyRootfs: false,
          NetworkMode: 'bridge'
        };
        if (volumeMounts && volumeMounts.length > 0) {
          HostConfig.Binds = volumeMounts;
        }

        container = await this.docker.createContainer({
          Image: image,
          Cmd: command,
          HostConfig,
          // Platform: 'linux/amd64' // not supported by dockerode types; rely on daemon default
        });
        logger.info('Docker container created', { containerId: container.id });
      } catch (createError) {
        logger.error('Failed to create Docker container', {
          image,
          command,
          error: createError instanceof Error ? {
            message: createError.message,
            stack: createError.stack
          } : String(createError)
        });
        throw createError;
      }

      let stream;
      try {
        logger.info('Attaching to container stream');
        stream = await container.attach({ stream: true, stdout: true, stderr: true });
        logger.info('Stream attached successfully');
      } catch (attachError) {
        logger.error('Failed to attach to container', {
          containerId: container.id,
          error: attachError instanceof Error ? {
            message: attachError.message,
            stack: attachError.stack
          } : String(attachError)
        });
        throw attachError;
      }
      
      try {
        logger.info('Starting container');
        await container.start();
        logger.info('Container started successfully');
      } catch (startError) {
        logger.error('Failed to start container', {
          containerId: container.id,
          error: startError instanceof Error ? {
            message: startError.message,
            stack: startError.stack
          } : String(startError)
        });
        throw startError;
      }

      let output = '';
      let stderr = '';
      let timeoutHandle: NodeJS.Timeout;

      return new Promise((resolve, reject) => {
        try {
          // Set timeout
          timeoutHandle = setTimeout(async () => {
            try {
              await container.kill();
            } catch (e) {
              // Container might already be stopped
            }
            reject(new Error('Execution timeout'));
          }, timeout);

          logger.info('Setting up stream handlers');

          // Demux stdout/stderr so we capture errors
          const stdoutStream = new PassThrough();
          const stderrStream = new PassThrough();
          (this.docker.modem as any).demuxStream(stream, stdoutStream, stderrStream);

          stdoutStream.on('data', (chunk) => {
            if (chunk) {
              output += chunk.toString();
            }
          });
          stderrStream.on('data', (chunk) => {
            if (chunk) {
              stderr += chunk.toString();
            }
          });

          logger.info('Stream handlers set up successfully');
        } catch (setupError) {
          logger.error('Failed to set up stream handlers', {
            error: setupError instanceof Error ? {
              message: setupError.message,
              stack: setupError.stack
            } : String(setupError)
          });
          reject(setupError);
        }

        stream.on('end', async () => {
          clearTimeout(timeoutHandle);
          
          try {
            const info = await container.inspect();
            if (info.State.ExitCode !== 0) {
              logger.warn('Container exited with non-zero code', { 
                exitCode: info.State.ExitCode,
                stderr: stderr.substring(0, 500)
              });
              // Don't fail, just return what we have
              resolve(output || stderr);
            } else {
              resolve(output || stderr);
            }
          } catch (error) {
            // Container might be removed already
            resolve(output || stderr);
          }
        });

        stream.on('error', (error: any) => {
          clearTimeout(timeoutHandle);
          reject(error);
        });
      });
    } catch (error) {
      logger.error('Docker execution failed', {
        image,
        command: (command || []).join(' '),
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private ensureLocalKiterunnerImage(image: string): void {
    const tag = image; // expected format local/kiterunner:1.0.2
    try {
      const res = spawnSync('bash', ['-lc', `docker image inspect ${tag} >/dev/null 2>&1`], { encoding: 'utf8' });
      if (res.status === 0) {
        return;
      }
    } catch {}

    logger.info('Building local kiterunner image (auto)', { image: tag });
    const dockerfile = [
      'FROM debian:stable-slim',
      'RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*',
      'ARG KR_URL=https://github.com/assetnote/kiterunner/releases/download/v1.0.2/kiterunner_1.0.2_linux_amd64.tar.gz',
      'RUN curl -L "$KR_URL" | tar xz -C /usr/local/bin',
      'ENTRYPOINT ["kr"]'
    ].join('\n');
    const build = spawnSync('bash', ['-lc', `docker build -t ${tag} - <<'EOF'\n${dockerfile}\nEOF`], { encoding: 'utf8' });
    if (build.status !== 0) {
      logger.error('Failed to auto-build local kiterunner image', { stdout: build.stdout, stderr: build.stderr });
      throw new Error('Failed to build local kiterunner image automatically');
    }
  }

  private async ensureLocalRunnerImage(image: string): Promise<void> {
    try {
      await this.docker.getImage(image).inspect();
      return;
    } catch {}
    const tag = image; // e.g., local/runner:latest or pinned
    const contextDir = path.resolve(__dirname, '../../../docker/runner');
    logger.info('Building local runner image (auto)', { image: tag, contextDir });
    // Build context must include seclists and backend/wrappers. Use repo root as context.
    const repoRoot = path.resolve(contextDir, '../..');
    const buildCmd = `docker build -t ${tag} -f ${contextDir}/Dockerfile ${repoRoot}`;
    const res = spawnSync('bash', ['-lc', buildCmd], { encoding: 'utf8' });
    if (res.status !== 0) {
      logger.error('Failed to auto-build local runner image', { stdout: res.stdout, stderr: res.stderr });
      throw new Error('Failed to build local runner image automatically');
    }
  }

  private startQueueProcessor(): void {
    setInterval(() => {
      if (this.executionQueue.length > 0) {
        this.processQueue();
      }
    }, 1000);
  }

  // Output Parsers
  private parseGenericOutput(output: string): any[] {
    const findings = [];
    if (output && output.trim()) {
      findings.push({
        type: 'generic',
        severity: 'info',
        title: 'Tool output received',
        description: 'Tool execution completed with output',
        evidence: output.substring(0, 1000)
      });
    }
    return findings;
  }

  private parseSubdomainOutput(output: string): any[] {
    const findings = [];
    try {
      const lines = output.trim().split('\n');
      for (const line of lines) {
        if (line && line.trim()) {
          // Skip error messages
          if (line.includes('error') || line.includes('Error')) continue;
          
          findings.push({
            type: 'subdomain',
            severity: 'info',
            confidence: 0.95,
            title: `Subdomain found: ${line.trim()}`,
            description: `Discovered subdomain ${line.trim()}`,
            evidence: { host: line.trim() }
          });
        }
      }
    } catch (error) {
      logger.error('Failed to parse subdomain output', { error });
    }
    return findings;
  }

  private parseNmapOutput(output: string): any[] {
    const findings = [];
    try {
      // Parse XML output or text output
      const lines = output.split('\n');
      for (const line of lines) {
        // Look for open ports
        if (line.includes('open') && line.includes('/tcp')) {
          const match = line.match(/(\d+)\/tcp\s+open\s+(\S+)/);
          if (match) {
            findings.push({
              type: 'port',
              severity: 'info',
              title: `Open port: ${match[1]} (${match[2]})`,
              description: `Port ${match[1]} is open running ${match[2]}`,
              evidence: { port: match[1], service: match[2] }
            });
          }
        }
      }
    } catch (error) {
      logger.error('Failed to parse nmap output', { error });
    }
    return findings;
  }
}