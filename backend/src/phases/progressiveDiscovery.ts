import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { StrategicAIService, AttackStrategy, AttackStep } from '../services/strategicAIService.js';
import { createLogger } from '../utils/logger.js';
import { owaspKnowledgeBase } from '../knowledge/owaspKnowledgeBase.js';

const logger = createLogger('ProgressiveDiscovery');

export interface Phase {
  name: 'recon' | 'analyze' | 'exploit';
  displayName: string;
  tools: string[];
  objective: string;
  nextPhaseCondition: (findings: any[]) => boolean;
  requiresApproval?: boolean;
  maxDuration?: number;
}

export interface PhaseResult {
  phase: string;
  results: TestResult[];
  proceedToNext: boolean;
  aiReasoning: string;
  duration: number;
  findingSummary: FindingSummary;
}

export interface TestResult {
  id: string;
  tool: string;
  target: string;
  startTime: Date;
  endTime: Date;
  status: 'success' | 'failed' | 'timeout' | 'skipped';
  findings: Finding[];
  rawOutput?: string;
  error?: string;
  owaspCategories?: string[];
  ccMapping?: string[];
}

export interface Finding {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: number;
  title: string;
  description: string;
  evidence?: any;
  remediation?: string;
  owaspCategory?: string;
  cweId?: string;
  cvssScore?: number;
}

export interface FindingSummary {
  total: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  criticalFindings: Finding[];
}

export interface DiscoveryContext {
  workflowId: string;
  target: string;
  userIntent: string;
  constraints?: any;
  auth?: any;
}

export class ProgressiveDiscovery extends EventEmitter {
  private testResults: Map<string, Map<string, TestResult>> = new Map(); // workflowId -> (toolName -> result)
  private phases: Record<string, Phase> = {
    recon: {
      name: 'recon',
      displayName: 'Reconnaissance',
      tools: [
        'whois',
        'crtsh-lookup',
         'passive-dns',
         'search-dorking',
         'shodan-search',
         'wayback-urls',
         'company-registry',
         'paste-search',
        'bgpview-asn',
        'dig-any',
         'zone-transfer',
        'robots-fetch',
        'sitemap-fetch',
         'http-methods',
        'subdomain-scanner',
        'port-scanner',
         'vhost-enum',
        'directory-scanner',
        'directory-bruteforce',
         'favicon-hash',
         'error-page-analysis',
         'cookie-analysis',
         'source-leak-checks',
        'tech-fingerprint',
        'crawler',
        'parameter-discovery',
        'waf-detection',
        'ssl-scanner',
         'api-discovery',
         'api-fuzzer',
         'jwt-analyzer'
      ],
      objective: 'Map the attack surface comprehensively',
      nextPhaseCondition: (findings: any[]) => {
        // Proceed if we found any relevant information
        return findings.some(f => 
          f.type === 'service' || 
          f.type === 'endpoint' || 
          f.type === 'technology' ||
          f.type === 'subdomain' ||
          f.type === 'port'
        );
      },
      maxDuration: Number.POSITIVE_INFINITY // no time limit for recon
    },
    analyze: {
      name: 'analyze',
      displayName: 'Vulnerability Analysis',
      // Include JWT and API tools during analysis so AI suggestions are valid
      tools: ['vulnerability-scanner', 'tech-fingerprint', 'crawler', 'jwt-analyzer', 'api-discovery', 'api-fuzzer'],
      objective: 'Identify potential vulnerabilities in discovered assets',
      nextPhaseCondition: (findings: any[]) => {
        // Proceed if we found vulnerabilities worth exploiting
        return findings.some(f => 
          f.severity === 'high' || 
          f.severity === 'critical' ||
          (f.severity === 'medium' && f.confidence > 0.7)
        );
      },
      maxDuration: Number.POSITIVE_INFINITY // no time limit for analysis
    },
    exploit: {
      name: 'exploit',
      displayName: 'Safe Exploitation',
      tools: ['controlled-exploit', 'data-extractor', 'privilege-escalator'],
      objective: 'Safely confirm and demonstrate vulnerability impact',
      nextPhaseCondition: () => false, // No next phase after exploit
      requiresApproval: true,
      maxDuration: Number.POSITIVE_INFINITY // no time limit for exploit
    }
  };

  private aiService: StrategicAIService;
  private currentPhase: Phase | null = null;
  private phaseHistory: Map<string, PhaseResult[]> = new Map();
  private toolExecutor: any; // Will be injected
  
  private async runWithFallback(job: { tool: string; parameters: Record<string, any>; workflowId: string }): Promise<any> {
    const { getFallbackChain } = await import('../execution/fallbacks.js');
    try {
      return await this.toolExecutor.execute(job);
    } catch (e) {
      try { (this as any).metrics?.inc('fallback_invocations'); } catch {}
      const chain = getFallbackChain(job.tool);
      for (const alt of chain) {
        try {
          this.emit('fallback:invoke', { workflowId: job.workflowId, from: job.tool, to: alt });
          return await this.toolExecutor.execute({ ...job, tool: alt });
        } catch {}
        try { (this as any).metrics?.inc('fallback_invocations'); } catch {}
      }
      // Always allow pipeline to continue; return a synthetic failed result shape
      return { output: '', findings: [], error: e instanceof Error ? e.message : String(e), status: 'failed' };
    }
  }

  constructor(aiService: StrategicAIService) {
    super();
    this.aiService = aiService;
  }

  setToolExecutor(executor: any): void {
    this.toolExecutor = executor;
  }

  async executePhase(
    phaseName: 'recon' | 'analyze' | 'exploit',
    context: DiscoveryContext
  ): Promise<PhaseResult> {
    const phase = this.phases[phaseName];
    if (!phase) {
      throw new Error(`Unknown phase: ${phaseName}`);
    }

    this.currentPhase = phase;
    const phaseStartTime = Date.now();
    
    logger.info(`Starting ${phase.displayName} phase`, { 
      workflowId: context.workflowId,
      objective: phase.objective,
      target: context.target,
      availableTools: phase.tools.length
    });

    this.emit('phase:start', {
      workflowId: context.workflowId,
      phase: phaseName,
      objective: phase.objective
    });

    // Check if approval is required
    if (phase.requiresApproval) {
      const approved = await this.requestPhaseApproval(phase, context);
      if (!approved) {
        logger.warn('Phase approval denied', { 
          workflowId: context.workflowId,
          phase: phaseName 
        });
        return this.createSkippedPhaseResult(phase, 'Approval denied');
      }
    }

    // Get AI strategy for this phase
    const allFindings = this.getAllFindings(context.workflowId);
    const strategy = await this.aiService.planInitialStrategy({
      workflowId: context.workflowId,
      target: context.target,
      userIntent: context.userIntent,
      currentFindings: allFindings,
      completedTests: this.getCompletedTests(context.workflowId),
      availableTools: phase.tools,
      phase: phaseName,
      constraints: context.constraints
    });

    logger.info('AI strategy received', {
      workflowId: context.workflowId,
      phase: phaseName,
      recommendedTests: strategy.recommendations.length,
      confidence: strategy.confidenceLevel,
      reasoning: strategy.reasoning.substring(0, 200) + '...'
    });

    this.emit('phase:strategy', {
      workflowId: context.workflowId,
      phase: phaseName,
      strategy: {
        reasoning: strategy.reasoning,
        testCount: strategy.recommendations.length,
        estimatedDuration: strategy.estimatedDuration
      }
    });

    // Execute tests based on AI recommendations
    const results: TestResult[] = [];
    const phaseTimeout = phase.maxDuration || 3600000; // Default 1 hour
    const deadline = Date.now() + phaseTimeout;

    // Coverage guard: compute expected and expand plan before execution
    const inv = await this.inventoryTargets(context.workflowId);
    try { (this as any).metrics?.setAssets(inv.subs.length, inv.forms.length, inv.apis.length); } catch {}
    const PER_SUB = 4; // dir brute + port scan + tech + crawl
    const PER_FORM = 1; // sqli test placeholder
    const PER_API = 1; // api-fuzzer placeholder
    const expected = inv.subs.length * PER_SUB + inv.forms.length * PER_FORM + inv.apis.length * PER_API;
    strategy.recommendations = this.expandUntil(strategy.recommendations, inv, expected);
    try { (this as any).metrics?.setPlanned(strategy.recommendations.length); } catch {}
    if (strategy.recommendations.length < expected) {
      throw new Error(`coverage-guard: ${strategy.recommendations.length} < ${expected}`);
    }

    for (const recommendation of strategy.recommendations) {
      // Check timeout
      if (Date.now() > deadline) {
        logger.warn('Phase timeout reached', {
          workflowId: context.workflowId,
          phase: phaseName,
          completed: results.length,
          remaining: strategy.recommendations.length - results.length
        });
        break;
      }

      // Validate tool is available in this phase
      if (!phase.tools.includes(recommendation.tool)) {
        logger.warn('AI recommended unavailable tool', { 
          workflowId: context.workflowId,
          tool: recommendation.tool,
          phase: phaseName,
          availableTools: phase.tools
        });
        continue;
      }

      // Filter orchestrator/meta params before execution
      const metaKeys = new Set(['readOnly','aggressive','intrusiveLevel','extensions','threads','maxThreads','delayMs','requestsPerSecond','url','endpoints']);
      if (recommendation.parameters) {
        for (const k of Object.keys(recommendation.parameters)) {
          if (metaKeys.has(k)) delete (recommendation.parameters as any)[k];
        }
      }

      // Execute the test
      const testResult = await this.executeTest(recommendation, context);
      results.push(testResult);

      // Emit progress
      this.emit('test:complete', {
        workflowId: context.workflowId,
        phase: phaseName,
        test: {
          tool: recommendation.tool,
          status: testResult.status,
          findingsCount: testResult.findings.length
        }
      });

      // Feed results back to AI for adaptive planning
      if (testResult.findings.length > 0 && testResult.status === 'success') {
        try {
          const adaptedStrategy = await this.aiService.adaptStrategy(
            {
              workflowId: context.workflowId,
              target: context.target,
              userIntent: context.userIntent,
              currentFindings: [...allFindings, ...testResult.findings],
              completedTests: [...this.getCompletedTests(context.workflowId), recommendation.tool],
              availableTools: phase.tools,
              phase: phaseName,
              constraints: context.constraints
            },
            testResult.findings
          );
          
          // Add new recommendations to queue
          // For subdomain discoveries, we want to test ALL of them exhaustively
          const isSubdomainDiscovery = testResult.findings.some(f => f.type === 'subdomain');
          const newTests = isSubdomainDiscovery 
            ? adaptedStrategy.recommendations // Include all tests for subdomain expansion
            : adaptedStrategy.recommendations.filter(
                r => r.priority === 'critical' || r.priority === 'high'
              );
          
          if (newTests.length > 0) {
            logger.info('AI adapted strategy with new tests', {
              workflowId: context.workflowId,
              newTests: newTests.map(t => ({ tool: t.tool, target: t.parameters?.target })),
              isSubdomainExpansion: isSubdomainDiscovery,
              totalNewTests: newTests.length,
              reason: adaptedStrategy.reasoning.substring(0, 100) + '...'
            });
            
            // Filter out duplicates
            const existingIds = new Set([
              ...results.map(r => r.id),
              ...strategy.recommendations.map(r => r.id)
            ]);
            const uniqueNewTests = newTests.filter(t => !existingIds.has(t.id));
            
            strategy.recommendations.push(...uniqueNewTests);
          }
        } catch (error) {
          logger.error('Failed to adapt strategy', { error, workflowId: context.workflowId });
        }
      }
    }

    // Calculate phase duration
    const phaseDuration = Date.now() - phaseStartTime;

    // Summarize findings
    const findingSummary = this.summarizeFindings(results);
    
    // Determine if we should proceed to next phase
    const allPhaseFindings = results.flatMap(r => r.findings);
    const shouldProceed = phase.nextPhaseCondition(allPhaseFindings);
    
    const phaseResult: PhaseResult = {
      phase: phaseName,
      results,
      proceedToNext: shouldProceed,
      aiReasoning: strategy.reasoning,
      duration: phaseDuration,
      findingSummary
    };

    // Store phase result
    this.addPhaseResult(context.workflowId, phaseResult);

    // Emit phase completion
    this.emit('phase:complete', {
      workflowId: context.workflowId,
      phase: phaseName,
      summary: findingSummary,
      proceedToNext: shouldProceed,
      duration: phaseDuration
    });

    logger.info(`Completed ${phase.displayName} phase`, {
      workflowId: context.workflowId,
      testsRun: results.length,
      findingsCount: findingSummary.total,
      criticalFindings: findingSummary.criticalFindings.length,
      proceedToNext: shouldProceed,
      duration: `${Math.round(phaseDuration / 1000)}s`
    });

    try { (this as any).metrics?.finalizeAndWrite(process.env.METRICS_OUT || '/out/run-metrics.json'); } catch {}
    return phaseResult;
  }

  private async inventoryTargets(workflowId: string): Promise<{ subs: string[]; forms: any[]; apis: any[] }> {
    // Use stored results to derive inventory
    const history = this.getPhaseHistory(workflowId);
    const allFindings = history.flatMap(p => p.results.flatMap(r => r.findings));
    const subs = Array.from(new Set(allFindings.filter((f: any) => f.type === 'subdomain').map((f: any) => (f.evidence?.host || '').toString()).filter(Boolean)));
    const forms = allFindings.filter((f: any) => f.type === 'form');
    const apis = allFindings.filter((f: any) => f.type === 'api');
    return { subs, forms, apis };
  }

  private expandUntil(plan: any[], inv: { subs: string[]; forms: any[]; apis: any[] }, expected: number): any[] {
    const dedupe = (arr: any[]) => {
      const seen = new Set<string>();
      return arr.filter((r: any) => {
        const key = `${r.tool}|${r.parameters?.target || ''}|${r.parameters?.wordlist || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const out = [...plan];
    // Add per-sub patterns
    for (const sub of inv.subs) {
      const t = `https://${sub}`;
      out.push({ id: `dir-${sub}`, tool: 'directory-bruteforce', purpose: 'Per-sub dir brute', parameters: { target: t, wordlist: '/seclists/Discovery/Web-Content/common.txt' }, priority: 'high', safetyChecks: ['rate-limiting'] });
      out.push({ id: `port-${sub}`, tool: 'port-scanner', purpose: 'Per-sub ports', parameters: { target: sub }, priority: 'medium', safetyChecks: ['rate-limiting'] });
      out.push({ id: `tech-${sub}`, tool: 'tech-fingerprint', purpose: 'Per-sub tech', parameters: { target: t }, priority: 'medium', safetyChecks: ['passive-scan'] });
      out.push({ id: `crawl-${sub}`, tool: 'crawler', purpose: 'Per-sub crawl', parameters: { target: t }, priority: 'medium', safetyChecks: ['rate-limiting'] });
      if (out.length >= expected) break;
    }

    // Add per-form and per-api placeholders if needed
    for (const form of inv.forms) {
      out.push({ id: `sqli-${(form.data?.path || form.description || 'form').replace(/[^a-z0-9-]/gi, '-')}`, tool: 'sql-injector', purpose: 'SQLi on form', parameters: { target: form.data?.path || form.description }, priority: 'critical', safetyChecks: ['non-destructive'] });
      if (out.length >= expected) break;
    }
    for (const api of inv.apis) {
      out.push({ id: `api-${(api.evidence?.url || api.description || 'api').replace(/[^a-z0-9-]/gi, '-')}`, tool: 'api-fuzzer', purpose: 'API fuzzing', parameters: { target: api.evidence?.url || api.description }, priority: 'high', safetyChecks: ['rate-limiting'] });
      if (out.length >= expected) break;
    }

    return dedupe(out).slice(0, Math.max(expected, out.length));
  }

  async executeFullDiscovery(context: DiscoveryContext): Promise<{
    phases: PhaseResult[];
    totalFindings: Finding[];
    executiveSummary: string;
    owaspCoverage: Record<string, number>;
    duration: number;
  }> {
    const startTime = Date.now();
    const phases: PhaseResult[] = [];
    let currentPhaseName: 'recon' | 'analyze' | 'exploit' = 'recon';
    
    logger.info('Starting full progressive discovery', {
      workflowId: context.workflowId,
      target: context.target,
      intent: context.userIntent
    });

    // Execute phases progressively
    while (currentPhaseName) {
      const phaseResult = await this.executePhase(currentPhaseName, context);
      phases.push(phaseResult);

      if (!phaseResult.proceedToNext) {
        logger.info('Stopping discovery - phase condition not met', {
          workflowId: context.workflowId,
          phase: currentPhaseName,
          reason: phaseResult.findingSummary.total === 0 ? 'No findings' : 'Condition not satisfied'
        });
        break;
      }

      // Determine next phase
      const nextPhase = this.getNextPhase(currentPhaseName);
      if (!nextPhase) {
        logger.info('Discovery complete - no more phases', {
          workflowId: context.workflowId,
          completedPhases: phases.map(p => p.phase)
        });
        break;
      }

      currentPhaseName = nextPhase;
      
      // Brief pause between phases
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Collect all findings
    const allFindings = phases.flatMap(p => 
      p.results.flatMap(r => r.findings)
    );

    // Generate executive summary
    const executiveSummary = await this.aiService.generateExecutiveSummary(
      context.workflowId,
      allFindings
    );

    // Calculate OWASP coverage
    const owaspCoverage = this.calculateOwaspCoverage(phases);

    const totalDuration = Date.now() - startTime;

    logger.info('Progressive discovery complete', {
      workflowId: context.workflowId,
      phasesCompleted: phases.length,
      totalFindings: allFindings.length,
      criticalFindings: allFindings.filter(f => f.severity === 'critical').length,
      duration: `${Math.round(totalDuration / 1000)}s`
    });

    return {
      phases,
      totalFindings: allFindings,
      executiveSummary,
      owaspCoverage,
      duration: totalDuration
    };
  }

  private async executeTest(
    recommendation: AttackStep,
    context: DiscoveryContext
  ): Promise<TestResult> {
    const testId = uuidv4();
    const startTime = new Date();

    logger.info('Executing test', {
      workflowId: context.workflowId,
      testId,
      tool: recommendation.tool,
      purpose: recommendation.purpose
    });

    try {
      if (!this.toolExecutor) {
        throw new Error('Tool executor not set');
      }

      // Apply safety checks
      const safeParams = this.applySafetyChecks(
        recommendation.parameters,
        recommendation.safetyChecks
      );

      logger.debug('Parameters before substitution', {
        workflowId: context.workflowId,
        tool: recommendation.tool,
        params: safeParams
      });

      // Substitute parameters with results from previous tests
      const substitutedParams = this.substituteParameters(safeParams, context.workflowId);

      logger.debug('Parameters after substitution', {
        workflowId: context.workflowId,
        tool: recommendation.tool,
        params: substitutedParams
      });

      // Execute with deterministic fallback chain
      const toolResult = await this.runWithFallback({
        tool: recommendation.tool,
        parameters: substitutedParams,
        workflowId: context.workflowId
      });

      // Persist raw artifacts to findings pool
      await this.persistToolArtifacts(context.workflowId, recommendation.tool, substitutedParams.target, toolResult);

      // Parse and enrich findings
      const findings = this.parseToolFindings(toolResult, recommendation);
      
      // Get OWASP mapping
      const toolMapping = (owaspKnowledgeBase as any).toolMapping?.[recommendation.tool] || { owaspCategories: [], ccControls: [] };
      
      const testResult: TestResult = {
        id: testId,
        tool: recommendation.tool,
        target: context.target,
        startTime,
        endTime: new Date(),
        status: 'success',
        findings,
        rawOutput: toolResult.output,
        owaspCategories: toolMapping.owaspCategories || [],
        ccMapping: toolMapping.ccControls || []
      };

      // Store the test result for future parameter substitution
      this.storeTestResult(context.workflowId, recommendation.tool, testResult);

      // Best-effort: save artifacts from findings (GET/JS bodies)
      await this.saveFindingsArtifacts(context.workflowId, findings);

      return testResult;
    } catch (error) {
      logger.error('Test execution failed', {
        workflowId: context.workflowId,
        testId,
        tool: recommendation.tool,
        error
      });

      return {
        id: testId,
        tool: recommendation.tool,
        target: context.target,
        startTime,
        endTime: new Date(),
        status: 'failed',
        findings: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private applySafetyChecks(
    parameters: Record<string, any>,
    safetyChecks: string[]
  ): Record<string, any> {
    const safeParams = { ...parameters };

    for (const check of safetyChecks) {
      switch (check) {
        case 'rate-limiting':
          safeParams.rateLimit = owaspKnowledgeBase.safetyThresholds.maxRequestsPerMinute;
          break;
        case 'non-intrusive':
          safeParams.intrusiveLevel = 0;
          break;
        case 'read-only':
          safeParams.readOnly = true;
          break;
        case 'test-account':
          if (safeParams.username) {
            safeParams.username = `test_${safeParams.username}`;
          }
          break;
        case 'payload-limit':
          safeParams.maxPayloadSize = owaspKnowledgeBase.safetyThresholds.maxPayloadSize;
          break;
      }
    }

    return safeParams;
  }

  private parseToolFindings(toolResult: any, recommendation: AttackStep): Finding[] {
    const findings: Finding[] = [];

    // Tool-specific parsing logic
    switch (recommendation.tool) {
      case 'passive-dns':
        if (toolResult.output) {
          try {
            const data = JSON.parse(toolResult.output);
            const lines = Array.isArray(data) ? data : (data?.FDNS_A || data?.RDNS || []);
            const hosts: string[] = (lines || []).map((e: any) => (Array.isArray(e) ? e[0] : e?.hostname || e)?.toString());
            for (const host of Array.from(new Set(hosts.filter(Boolean)))) {
              findings.push({
                type: 'subdomain', severity: 'info', confidence: 0.7,
                title: `PassiveDNS: ${host}`, description: 'Historical DNS record', evidence: { host }
              });
            }
          } catch {}
        }
        break;
      case 'search-dorking':
        if (toolResult.output) {
          const urls = Array.from(toolResult.output.matchAll(/href=\"(https?:[^\"]+)/gi)).map((m: any) => m[1]);
          for (const url of Array.from(new Set(urls))) {
            findings.push({ type: 'endpoint', severity: 'info', confidence: 0.5, title: 'Dorked URL', description: url, evidence: { url } });
          }
        }
        break;
      case 'shodan-search':
        if (toolResult.output) {
          try {
            const data = JSON.parse(toolResult.output);
            for (const m of data?.matches || []) {
              findings.push({ type: 'service', severity: 'info', confidence: 0.7, title: `Shodan: ${m.ip_str}:${m.port}`, description: m.product || 'service', evidence: m });
            }
          } catch {}
        }
        break;
      case 'wayback-urls':
        if (toolResult.output) {
          try {
            const rows = JSON.parse(toolResult.output) as any[];
            const urls = rows.slice(1).map(r => r[0]).filter(Boolean);
            for (const u of urls) {
              findings.push({ type: 'endpoint', severity: 'info', confidence: 0.6, title: 'Wayback URL', description: u, evidence: { url: u } });
            }
          } catch {}
        }
        break;
      case 'company-registry':
        if (toolResult.output) {
          findings.push({ type: 'business-intel', severity: 'info', confidence: 0.5, title: 'Company registry data', description: 'OpenCorporates search results', evidence: toolResult.output.substring(0, 500) });
        }
        break;
      case 'paste-search':
        if (toolResult.output) {
          try {
            const data = JSON.parse(toolResult.output);
            for (const p of data?.data || []) {
              findings.push({ type: 'leak', severity: 'medium', confidence: 0.6, title: `Paste reference: ${p.id}`, description: p.full_url || p.id, evidence: p });
            }
          } catch {}
        }
        break;
      case 'news-osint':
        if (toolResult.output) {
          try {
            const data = JSON.parse(toolResult.output);
            for (const art of data?.articles || []) {
              findings.push({ type: 'news', severity: 'info', confidence: 0.5, title: art.title || 'News', description: art.url || '', evidence: art });
            }
          } catch {}
        }
        break;
      case 'zone-transfer':
        if (toolResult.output && /\sAXFR\s/.test(toolResult.output) || /IN\s+A\s+/.test(toolResult.output)) {
          const lines = toolResult.output.split('\n').filter((l: string) => l.includes('IN'));
          for (const l of lines) {
            findings.push({ type: 'dns-record', severity: 'high', confidence: 0.9, title: 'Zone data', description: l });
          }
        }
        break;
      case 'http-methods':
        if (toolResult.output) {
          const allow = toolResult.output.match(/Allow:\s*([^\r\n]+)/i)?.[1];
          if (allow) findings.push({ type: 'http-methods', severity: 'info', confidence: 0.8, title: `Allowed methods: ${allow}`, description: allow });
        }
        break;
      case 'vhost-enum':
        if (toolResult.output) {
          const lines = toolResult.output.split('\n').filter((l: string) => l.includes('Found:'));
          for (const l of lines) {
            const host = l.split('Found:')[1]?.trim();
            if (host) findings.push({ type: 'vhost', severity: 'info', confidence: 0.7, title: `VHost: ${host}`, description: host });
          }
        }
        break;
      case 'favicon-hash':
        if (toolResult.output) {
          findings.push({ type: 'fingerprint', severity: 'info', confidence: 0.6, title: 'Favicon hash', description: toolResult.output.trim() });
        }
        break;
      case 'error-page-analysis':
        if (toolResult.output) {
          findings.push({ type: 'error-page', severity: 'info', confidence: 0.6, title: 'Error page content', description: toolResult.output.substring(0, 200) });
        }
        break;
      case 'cookie-analysis':
        if (toolResult.output) {
          const cookies = toolResult.output.split('\n').filter((l: string) => /set-cookie/i.test(l));
          for (const c of cookies) {
            findings.push({ type: 'cookie', severity: 'info', confidence: 0.8, title: 'Set-Cookie', description: c });
          }
        }
        break;
      case 'source-leak-checks':
        if (toolResult.output) {
          const lines = toolResult.output.split('\n').filter(Boolean);
          for (const l of lines) {
            if (/^200\s/.test(l)) findings.push({ type: 'source-leak', severity: 'high', confidence: 0.9, title: 'Source control exposed', description: l });
          }
        }
        break;
      case 'whois':
        if (toolResult.output) {
          const lines: string[] = toolResult.output.split('\n').filter((ln: string) => ln.trim());
          const org = lines.find((ln: string) => /OrgName|Registrant Organization|Organization/i.test(ln));
          findings.push({
            type: 'whois',
            severity: 'info',
            confidence: 0.8,
            title: 'WHOIS information collected',
            description: org ? org : 'WHOIS data fetched',
            evidence: { sample: lines.slice(0, 20).join('\n') }
          });
        }
        break;
      case 'crtsh-lookup':
        if (toolResult.output) {
          try {
            const data = JSON.parse(toolResult.output);
            const hosts = Array.isArray(data) ? data.flatMap((d: any) => String(d.name_value || '').split('\n')) : [];
            const uniqueHosts = Array.from(new Set(hosts.filter(Boolean)));
            for (const host of uniqueHosts) {
              findings.push({
                type: 'subdomain',
                severity: 'info',
                confidence: 0.9,
                title: `CT log subdomain: ${host}`,
                description: `Discovered via crt.sh: ${host}`,
                evidence: { host }
              });
            }
          } catch {
            findings.push({
              type: 'ct-log',
              severity: 'info',
              confidence: 0.5,
              title: 'Certificate transparency output collected',
              description: 'Non-JSON crt.sh response',
              evidence: { output: toolResult.output.substring(0, 1000) }
            });
          }
        }
        break;
      case 'bgpview-asn':
        if (toolResult.output) {
          try {
            const data = JSON.parse(toolResult.output);
            const asns = data?.data?.asns || [];
            for (const asn of asns) {
              findings.push({
                type: 'asn',
                severity: 'info',
                confidence: 0.7,
                title: `ASN discovered: AS${asn.asn}`,
                description: `${asn.name} (${asn.country_code})`,
                evidence: { asn: asn.asn, name: asn.name }
              });
            }
          } catch {
            findings.push({
              type: 'asn',
              severity: 'info',
              confidence: 0.5,
              title: 'ASN lookup output collected',
              description: 'Non-JSON ASN response',
              evidence: { output: toolResult.output.substring(0, 500) }
            });
          }
        }
        break;
      case 'dig-any':
        if (toolResult.output) {
          const records = toolResult.output.split('\n').filter((l: string) => l.trim());
          for (const rec of records) {
            findings.push({
              type: 'dns-record',
              severity: 'info',
              confidence: 0.9,
              title: `DNS: ${rec}`,
              description: 'DNS ANY record',
              evidence: { record: rec }
            });
          }
        }
        break;
      case 'robots-fetch':
        if (toolResult.output) {
          const lines: string[] = toolResult.output.split('\n').filter((ln: string) => ln.trim());
          for (const line of lines) {
            const match = line.match(/^(Disallow|Allow):\s*(.+)$/i) as RegExpMatchArray | null;
            if (match) {
              findings.push({
                type: 'endpoint',
                severity: 'info',
                confidence: 0.8,
                title: `robots.txt ${match[1]} ${match[2]}`,
                description: `robots.txt directive: ${match[1]} ${match[2]}`,
                evidence: { directive: match[1], path: match[2] }
              });
            }
          }
        }
        break;
      case 'sitemap-fetch':
        if (toolResult.output) {
          const matches: RegExpMatchArray[] = Array.from(toolResult.output.matchAll(/<loc>([^<]+)<\/loc>/gi)) as RegExpMatchArray[];
          const urls: string[] = matches.map((mm: RegExpMatchArray) => mm[1]);
          for (const url of urls) {
            findings.push({
              type: 'endpoint',
              severity: 'info',
              confidence: 0.9,
              title: `Sitemap URL: ${url}`,
              description: 'URL discovered via sitemap.xml',
              evidence: { url }
            });
          }
        }
        break;
      case 'subdomain-scanner':
        // Parse subdomains from output
        if (toolResult.output) {
          const domains: string[] = toolResult.output
            .split('\n')
            .filter((line: string) => line.trim() && !line.startsWith('[') && !line.includes('error'));
            
          for (const domain of domains) {
            findings.push({
              type: 'subdomain',
              severity: 'info',
              confidence: 1.0,
              title: `Subdomain discovered: ${domain}`,
              description: `Found subdomain ${domain} for the target domain`,
              evidence: { domain }
            });
          }
        }
        break;

      case 'port-scanner':
        // Parse open ports from nmap XML output
        if (toolResult.output && toolResult.output.includes('port')) {
          // Simple parsing - in production, use proper XML parser
          const portMatches = toolResult.output.match(/port protocol="tcp" portid="(\d+)"/g) || [];
          for (const match of portMatches) {
            const port = match.match(/portid="(\d+)"/)?.[1];
            if (port) {
              findings.push({
                type: 'port',
                severity: 'info',
                confidence: 1.0,
                title: `Open port: ${port}`,
                description: `Port ${port} is open`,
                evidence: { port: parseInt(port) }
              });
            }
          }
        }
        break;

      case 'tech-fingerprint':
        // Parse technology detections from httpx output
        if (toolResult.output) {
          try {
            const lines: string[] = toolResult.output.split('\n').filter((l: string) => l.trim());
            for (const line of lines) {
              try {
                const data = JSON.parse(line);
                if (data.tech && data.tech.length > 0) {
                  findings.push({
                    type: 'technology',
                    severity: 'info',
                    confidence: 0.9,
                    title: `Technologies detected: ${data.tech.join(', ')}`,
                    description: `Detected technologies on ${data.url}: ${data.tech.join(', ')}`,
                    evidence: { technologies: data.tech, url: data.url }
                  });
                }
              } catch (e) {
                // Skip invalid JSON lines
              }
            }
          } catch (e) {
            logger.debug('Failed to parse tech-fingerprint output', { error: e });
          }
        }
        break;
      case 'crawler':
      case 'directory-scanner':
        if (toolResult.output) {
          const lines = toolResult.output.split('\n').filter((l: string) => l.trim());
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              const url = data.url || data.request?.url || data?.Result || data?.host;
              if (url) {
                findings.push({
                  type: 'endpoint',
                  severity: 'info',
                  confidence: 0.8,
                  title: `Discovered URL: ${url}`,
                  description: 'Discovered via crawler/katana',
                  evidence: { url }
                });
              }
            } catch {
              // ignore non-JSON lines
            }
          }
        }
        break;
      case 'directory-bruteforce':
        if (toolResult.output) {
          try {
            const data = JSON.parse(toolResult.output);
            const results = data?.results || [];
            for (const r of results) {
              findings.push({
                type: 'endpoint',
                severity: 'info',
                confidence: 0.9,
                title: `Bruteforced path: ${r.url || r.input || r.result}`,
                description: `ffuf found ${r.url || r.input}`,
                evidence: r
              });
            }
          } catch {
            // Try JSONL
            const lines = toolResult.output.split('\n').filter((l: string) => l.trim());
            for (const line of lines) {
              try {
                const r = JSON.parse(line);
                const url = r.url || r.input || r.result;
                if (url) {
                  findings.push({
                    type: 'endpoint',
                    severity: 'info',
                    confidence: 0.8,
                    title: `Bruteforced path: ${url}`,
                    description: 'ffuf discovered path',
                    evidence: r
                  });
                }
              } catch { /* noop */ }
            }
          }
        }
        break;
      case 'parameter-discovery':
        if (toolResult.output) {
          try {
            const data = JSON.parse(toolResult.output);
            const params = data?.[0]?.parameters || data?.parameters || [];
            for (const p of params) {
              findings.push({
                type: 'parameter',
                severity: 'info',
                confidence: 0.8,
                title: `Hidden parameter: ${p}`,
                description: 'Discovered via arjun',
                evidence: { parameter: p }
              });
            }
          } catch {
            findings.push({
              type: 'parameter',
              severity: 'info',
              confidence: 0.5,
              title: 'Parameter discovery output collected',
              description: 'Could not parse JSON; storing raw',
              evidence: { output: toolResult.output.substring(0, 1000) }
            });
          }
        }
        break;
      case 'waf-detection':
        if (toolResult.output) {
          findings.push({
            type: 'waf',
            severity: 'info',
            confidence: 0.7,
            title: 'WAF detection results',
            description: 'wafw00f output collected',
            evidence: { output: toolResult.output.substring(0, 1000) }
          });
        }
        break;
      case 'ssl-scanner':
        if (toolResult.output) {
          const weak = /vuln|weak|insecure/i.test(toolResult.output) ? 'SSL/TLS issues detected' : 'SSL/TLS report collected';
          findings.push({
            type: 'ssl',
            severity: 'info',
            confidence: 0.7,
            title: weak,
            description: 'testssl.sh output',
            evidence: { output: toolResult.output.substring(0, 1500) }
          });
        }
        break;
      case 'api-discovery':
      case 'api-fuzzer':
        if (toolResult.output) {
          const lines = toolResult.output.split('\n').filter((l: string) => /^https?:\/\//.test(l.trim()));
          for (const url of lines) {
            findings.push({
              type: 'api',
              severity: 'info',
              confidence: 0.8,
              title: `API endpoint: ${url}`,
              description: 'Discovered via kiterunner',
              evidence: { url }
            });
          }
        }
        break;

      default:
        // Generic vulnerability parsing for other tools
        if (toolResult.vulnerabilities) {
          for (const vuln of toolResult.vulnerabilities) {
            findings.push({
              type: vuln.type || recommendation.tool,
              severity: this.normalizeSeverity(vuln.severity),
              confidence: vuln.confidence || 0.8,
              title: vuln.title || `${recommendation.tool} finding`,
              description: vuln.description || 'No description provided',
              evidence: vuln.evidence,
              remediation: vuln.remediation,
              owaspCategory: recommendation.owaspCategory,
              cweId: vuln.cwe,
              cvssScore: vuln.cvss
            });
          }
        }
    }

    logger.debug('Parsed findings', {
      tool: recommendation.tool,
      findingsCount: findings.length,
      findings: findings.slice(0, 3) // Log first 3 for debugging
    });

    return findings;
  }

  private async ensureFindingsDir(workflowId: string): Promise<string> {
    const baseDir = path.resolve(process.cwd(), '..', 'logs', 'workflows', workflowId, 'findings-pool');
    await fs.mkdir(baseDir, { recursive: true });
    return baseDir;
  }

  private sanitizeFileName(input: string): string {
    return input
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 200) || 'target';
  }

  private async persistToolArtifacts(
    workflowId: string,
    tool: string,
    target: any,
    toolResult: any
  ): Promise<void> {
    try {
      const dir = await this.ensureFindingsDir(workflowId);
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const tgt = Array.isArray(target) ? 'multi' : (typeof target === 'string' ? this.sanitizeFileName(target) : 'unknown');
      const base = path.join(dir, `${ts}__${tool}__${tgt}`);
      if (toolResult?.output) {
        await fs.writeFile(`${base}.out`, toolResult.output, 'utf8');
      }
      await fs.writeFile(`${base}.meta.json`, JSON.stringify({ tool, target, ts, metadata: toolResult?.metadata || {} }, null, 2), 'utf8');
    } catch {
      // best-effort; do not block
    }
  }

  private async saveFindingsArtifacts(workflowId: string, findings: Finding[]): Promise<void> {
    const endpoints = findings
      .map(f => (f as any).evidence?.url || (f as any).description)
      .filter((u: any) => typeof u === 'string' && /^https?:\/\//i.test(u)) as string[];
    if (endpoints.length === 0) return;
    const dir = await this.ensureFindingsDir(workflowId);
    const httpDir = path.join(dir, 'http');
    const jsDir = path.join(dir, 'js');
    await fs.mkdir(httpDir, { recursive: true });
    await fs.mkdir(jsDir, { recursive: true });
    const limit = 30; // cap pulls per batch to avoid overload
    for (const url of endpoints.slice(0, limit)) {
      try {
        const isJs = /\.js(\?|$)/i.test(url);
        const resp = await axios.get(url, { timeout: 15000, validateStatus: () => true });
        const safe = this.sanitizeFileName(url.replace(/^https?:\/\//, '').replace(/\//g, '__'));
        const basePath = path.join(isJs ? jsDir : httpDir, safe);
        await fs.writeFile(`${basePath}.headers.json`, JSON.stringify(resp.headers, null, 2), 'utf8');
        const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
        await fs.writeFile(`${basePath}.body`, body, 'utf8');
      } catch {
        // best-effort
      }
    }
  }

  private normalizeSeverity(severity: any): Finding['severity'] {
    const severityMap: Record<string, Finding['severity']> = {
      'critical': 'critical',
      'high': 'high',
      'medium': 'medium',
      'low': 'low',
      'info': 'info',
      'informational': 'info',
      'minor': 'low',
      'major': 'high',
      'severe': 'critical'
    };

    const normalized = String(severity).toLowerCase();
    return severityMap[normalized] || 'medium';
  }

  private summarizeFindings(results: TestResult[]): FindingSummary {
    const allFindings = results.flatMap(r => r.findings);
    
    const bySeverity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0
    };

    const byCategory: Record<string, number> = {};
    const criticalFindings: Finding[] = [];

    for (const finding of allFindings) {
      bySeverity[finding.severity]++;
      
      if (finding.owaspCategory) {
        byCategory[finding.owaspCategory] = (byCategory[finding.owaspCategory] || 0) + 1;
      }

      if (finding.severity === 'critical') {
        criticalFindings.push(finding);
      }
    }

    return {
      total: allFindings.length,
      bySeverity,
      byCategory,
      criticalFindings
    };
  }

  private calculateOwaspCoverage(phases: PhaseResult[]): Record<string, number> {
    const coverage: Record<string, number> = {};
    
    // Initialize all OWASP categories to 0
    for (const category of Object.keys(owaspKnowledgeBase.webTop10)) {
      coverage[category] = 0;
    }

    // Count tests per category
    for (const phase of phases) {
      for (const result of phase.results) {
        if (result.owaspCategories) {
          for (const category of result.owaspCategories) {
            coverage[category] = (coverage[category] || 0) + 1;
          }
        }
      }
    }

    return coverage;
  }

  private async requestPhaseApproval(phase: Phase, context: DiscoveryContext): Promise<boolean> {
    logger.info('Requesting phase approval', {
      workflowId: context.workflowId,
      phase: phase.name
    });

    this.emit('approval:required', {
      workflowId: context.workflowId,
      phase: phase.name,
      reason: 'Phase requires explicit approval before execution',
      timeout: 300000 // 5 minutes
    });

    // In a real implementation, this would integrate with Slack/Teams
    // For now, auto-approve after a delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    return true;
  }

  private createSkippedPhaseResult(phase: Phase, reason: string): PhaseResult {
    return {
      phase: phase.name,
      results: [],
      proceedToNext: false,
      aiReasoning: reason,
      duration: 0,
      findingSummary: {
        total: 0,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        byCategory: {},
        criticalFindings: []
      }
    };
  }

  private getAllFindings(workflowId: string): Finding[] {
    const history = this.phaseHistory.get(workflowId) || [];
    return history.flatMap(phase => 
      phase.results.flatMap(result => result.findings)
    );
  }

  private getCompletedTests(workflowId: string): string[] {
    const history = this.phaseHistory.get(workflowId) || [];
    return history.flatMap(phase => 
      phase.results.map(result => result.tool)
    );
  }

  private addPhaseResult(workflowId: string, result: PhaseResult): void {
    const history = this.phaseHistory.get(workflowId) || [];
    history.push(result);
    this.phaseHistory.set(workflowId, history);
  }

  private getNextPhase(currentPhase: string): 'recon' | 'analyze' | 'exploit' | null {
    const phaseOrder: Array<'recon' | 'analyze' | 'exploit'> = ['recon', 'analyze', 'exploit'];
    const currentIndex = phaseOrder.indexOf(currentPhase as any);
    
    if (currentIndex === -1 || currentIndex === phaseOrder.length - 1) {
      return null;
    }
    
    return phaseOrder[currentIndex + 1];
  }

  public getPhaseHistory(workflowId: string): PhaseResult[] {
    return this.phaseHistory.get(workflowId) || [];
  }

  private storeTestResult(workflowId: string, tool: string, result: TestResult): void {
    if (!this.testResults.has(workflowId)) {
      this.testResults.set(workflowId, new Map());
    }
    
    const workflowResults = this.testResults.get(workflowId)!;
    workflowResults.set(tool, result);
    
    logger.debug('Stored test result', {
      workflowId,
      tool,
      findingsCount: result.findings.length
    });
  }

  private substituteParameters(params: Record<string, any>, workflowId: string): Record<string, any> {
    const substituted: Record<string, any> = {};
    const workflowResults = this.testResults.get(workflowId);
    
    logger.info('Starting parameter substitution', {
      workflowId,
      params,
      hasResults: !!workflowResults,
      resultCount: workflowResults?.size || 0
    });
    
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.includes('{{') && value.includes('}}')) {
        // Extract template variable
        const matches = value.match(/\{\{([\w-]+)\.([\w]+)\}\}/);
        if (matches) {
          const [fullMatch, toolName, property] = matches;
          const testResult = workflowResults?.get(toolName);
          
          logger.info('Found template to substitute', {
            workflowId,
            key,
            template: value,
            toolName,
            property,
            hasTestResult: !!testResult
          });
          
          if (testResult) {
            logger.debug('Substituting parameter', {
              workflowId,
              key,
              template: value,
              toolName,
              property
            });
            
            if (property === 'results') {
              // For subdomain scanner, extract domains from raw output
              if (toolName === 'subdomain-scanner' && testResult.rawOutput) {
                const controlCharRegex = /[\u0000-\u001F\u007F-\u009F]/g;
                const domainRegex = /^[a-z0-9.-]+$/i;
                const domains = testResult.rawOutput
                  .split('\n')
                  .map(line => line.replace(controlCharRegex, '').trim().toLowerCase())
                  .filter(line => line && domainRegex.test(line));

                substituted[key] = domains;
                logger.info('Substituted domains', {
                  workflowId,
                  key,
                  count: domains.length,
                  domains: domains.slice(0, 5)
                });
              } else {
                // For other tools, use findings to derive host-like values safely
                const derived = (testResult.findings || [])
                  .map(f => ((f as any).target || (f as any).data?.domain || (f as any).evidence?.host || '').toString())
                  .map(h => h.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim().toLowerCase())
                  .filter(h => h && /^[a-z0-9.-]+$/i.test(h));
                substituted[key] = derived;
              }
            } else if (property === 'output') {
              substituted[key] = testResult.rawOutput;
            } else {
              substituted[key] = value; // Keep original if property not found
            }
          } else {
            logger.warn('No test result found for parameter substitution', {
              workflowId,
              toolName,
              template: value
            });
            substituted[key] = value;
          }
        } else {
          substituted[key] = value;
        }
      } else if (Array.isArray(value)) {
        // Handle arrays recursively
        substituted[key] = value.map(item => 
          typeof item === 'string' && item.includes('{{') 
            ? this.substituteParameters({ value: item }, workflowId).value 
            : item
        );
      } else {
        substituted[key] = value;
      }
    }
    
    return substituted;
  }
}