import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger.js';
import { owaspKnowledgeBase } from '../knowledge/owaspKnowledgeBase.js';

const logger = createLogger('StrategicAIService');

export interface StrategyContext {
  workflowId: string;
  target: string;
  userIntent: string;
  currentFindings: any[];
  completedTests: string[];
  availableTools: string[];
  phase: 'recon' | 'analyze' | 'exploit';
  constraints?: {
    timeLimit?: number;
    scope?: string[];
    excludeTests?: string[];
    requiresAuth?: boolean;
    environment?: string;
    minTestsPerPhase?: number;
  };
}

export interface AttackStrategy {
  phase: string;
  reasoning: string;
  recommendations: AttackStep[];
  confidenceLevel: number;
  expectedOutcomes: ExpectedOutcome[];
  nextPhaseConditions: string[];
  estimatedDuration: number;
  safetyConsiderations: string[];
}

export interface AttackStep {
  id: string;
  tool: string;
  purpose: string;
  expectedOutcome: string;
  parameters: Record<string, any>;
  dependsOn?: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  owaspCategory?: string;
  safetyChecks: string[];
  conditions?: TestCondition[];
  requiresAuth?: boolean;
}

export interface TestCondition {
  type: 'finding_exists' | 'finding_matches' | 'no_findings' | 'custom';
  field?: string;
  value?: any;
  operator?: 'equals' | 'contains' | 'greater_than' | 'exists' | 'not_exists';
}

export interface ExpectedOutcome {
  condition: string;
  testType: string;
  recommendedTool: string;
  parameters: Record<string, any>;
  conditionField: string;
  conditionValue: any;
  operator?: string;
}

export interface VulnerabilityAnalysis {
  finding: any;
  severity: 'critical' | 'high' | 'medium' | 'low';
  exploitable: boolean;
  nextSteps: AttackStep[];
  explanation: string;
  owaspMapping: string[];
  businessImpact: string;
  remediationAdvice: string;
}

interface ConversationEntry {
  timestamp: Date;
  phase: string;
  context: StrategyContext;
  strategy: AttackStrategy;
  findings?: any[];
  decisions?: string[];
}

export class StrategicAIService {
  private anthropic: Anthropic;
  private model = process.env.ANTHROPIC_MODEL || 'claude-opus-4-1-20250805';
  private conversationHistory: Map<string, ConversationEntry[]> = new Map();
  private decisionLog: Map<string, any[]> = new Map();
  
  constructor() {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    logger.info('Strategic AI Service initialized', { model: this.model });
  }

  async planInitialStrategy(context: StrategyContext): Promise<AttackStrategy> {
    logger.info('Planning initial attack strategy', { 
      workflowId: context.workflowId,
      target: context.target,
      phase: context.phase 
    });

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildPhasePrompt(context);
    
    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4096,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const strategy = this.parseStrategyResponse(response);
      
      // Validate confidence and safety
      if (strategy.confidenceLevel < 0.7) {
        logger.warn('Low confidence strategy detected', { 
          workflowId: context.workflowId, 
          confidence: strategy.confidenceLevel,
          phase: context.phase 
        });
        // Could trigger HITL review here
      }
      
      if (!this.isOutputSafe(strategy)) {
        logger.error('Unsafe strategy detected', { workflowId: context.workflowId });
        return this.getFallbackStrategy(context);
      }
      
      // Validate and filter recommendations
      strategy.recommendations = await this.enhancedValidateRecommendations(
        strategy.recommendations, 
        context
      );
      
      // ALWAYS force expansion for exhaustive testing
      // This is now the default behavior - no special flags needed
      if (context.phase === 'recon' || context.phase === 'analyze') {
        // If we have findings, expand based on those
        if (context.currentFindings && context.currentFindings.length > 0) {
          strategy.recommendations = this.expandRecommendationsIfNeeded(
            strategy.recommendations,
            context.currentFindings,
            context
          );
        }
        
        // Enforce minTestsPerPhase from constraints
        const minRequired = context.constraints?.minTestsPerPhase || 5;
        const assetBasedMin = context.phase === 'recon' ? 5 : 
          (context.currentFindings?.filter((f: any) => 
            f.type === 'subdomain' || f.type === 'form' || f.type === 'api'
          ).length || 1) * 3;
        const minRecommendations = Math.max(minRequired, assetBasedMin);
        if (strategy.recommendations.length < minRecommendations) {
          logger.info('Expanding recommendations to meet minimum', {
            current: strategy.recommendations.length,
            minimum: minRecommendations
          });
          // Add missing core tools if not present
          const hasSubdomainScan = strategy.recommendations.some(r => r.tool === 'subdomain-scanner');
          const hasPortScan = strategy.recommendations.some(r => r.tool === 'port-scanner');
          const hasDirBruteforce = strategy.recommendations.some(r => r.tool === 'directory-bruteforce');
          const hasTechFingerprint = strategy.recommendations.some(r => r.tool === 'tech-fingerprint');
          
          if (!hasSubdomainScan) {
            strategy.recommendations.push({
              id: `subdomain-scan-${Date.now()}`,
              tool: 'subdomain-scanner',
              purpose: 'Discover all subdomains for comprehensive coverage',
              parameters: { target: context.target },
              owaspCategory: 'A01:2021',
              priority: 'critical',
              safetyChecks: ['passive-scan'],
              requiresAuth: false,
              expectedOutcome: 'Complete subdomain enumeration'
            });
          }
          
          if (!hasDirBruteforce) {
            strategy.recommendations.push({
              id: `dir-bruteforce-main-${Date.now()}`,
              tool: 'directory-bruteforce',
              purpose: 'Directory brute-forcing on main domain with SecLists',
              parameters: {
                target: context.target,
                wordlist: '/seclists/Discovery/Web-Content/common.txt'
              },
              owaspCategory: 'A01:2021',
              priority: 'high',
              safetyChecks: ['rate-limiting'],
              requiresAuth: false,
              expectedOutcome: 'Discovery of hidden directories and endpoints'
            });
          }
        }
      }
      
      // Store in conversation history
      this.addToHistory(context.workflowId, {
        timestamp: new Date(),
        phase: context.phase,
        context,
        strategy
      });
      
      // Log decision
      this.logDecision(context.workflowId, {
        type: 'strategy_planning',
        phase: context.phase,
        input: context,
        output: strategy,
        reasoning: strategy.reasoning,
        confidence: strategy.confidenceLevel
      });

      return strategy;
    } catch (error) {
      logger.error('Failed to get AI strategy', { error, workflowId: context.workflowId });
      return this.getFallbackStrategy(context);
    }
  }

  async adaptStrategy(
    context: StrategyContext, 
    newFindings: any
  ): Promise<AttackStrategy> {
    logger.info('Adapting strategy based on new findings', {
      workflowId: context.workflowId,
      findingsCount: Array.isArray(newFindings) ? newFindings.length : 1
    });

    const history = this.getConversationHistory(context.workflowId);
    const systemPrompt = this.buildSystemPrompt();
    
    const userPrompt = `You are continuing a penetration test and need to adapt your strategy based on new findings.

Target: ${context.target}
Original Intent: "${context.userIntent}"
Current Phase: ${context.phase}
Completed Tests: ${context.completedTests.join(', ')}

Previous Strategy Summary:
${this.summarizeHistory(history)}

New Discovery:
${JSON.stringify(newFindings, null, 2)}

Based on this new information:
1. What vulnerabilities or attack vectors have we identified?
2. Should we continue in the current phase or move to the next?
3. What specific tests should we run next?
4. Are there any safety concerns with the discovered vulnerabilities?

Respond in JSON format with the same structure as before, adapting the strategy based on findings.`;

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4096,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const strategy = this.parseStrategyResponse(response);
      
      // Apply same exhaustive expansion logic as initial planning
      if (!this.isOutputSafe(strategy)) {
        logger.error('Unsafe adapted strategy detected', { workflowId: context.workflowId });
        return this.getFallbackStrategy(context);
      }
      
      // Validate and filter recommendations
      strategy.recommendations = await this.enhancedValidateRecommendations(
        strategy.recommendations, 
        context
      );
      
      // ALWAYS force expansion for exhaustive testing on adapted strategies too
      const allFindings = [...(context.currentFindings || []), ...(Array.isArray(newFindings) ? newFindings : [newFindings])];
      if (allFindings.length > 0) {
        strategy.recommendations = this.expandRecommendationsIfNeeded(
          strategy.recommendations,
          allFindings,
          context
        );
      }
      
      // Update history
      const lastEntry = history[history.length - 1];
      if (lastEntry) {
        lastEntry.findings = newFindings;
      }
      
      this.addToHistory(context.workflowId, {
        timestamp: new Date(),
        phase: context.phase,
        context,
        strategy,
        findings: newFindings
      });

      return strategy;
    } catch (error) {
      logger.error('Failed to adapt strategy', { error, workflowId: context.workflowId });
      return this.getFallbackStrategy(context);
    }
  }

  async analyzeVulnerability(
    finding: any,
    context: StrategyContext
  ): Promise<VulnerabilityAnalysis> {
    logger.info('Analyzing vulnerability', {
      workflowId: context.workflowId,
      findingType: finding.type
    });

    const prompt = `Analyze this security finding in detail:

Finding:
${JSON.stringify(finding, null, 2)}

Target: ${context.target}
Test Type: ${finding.testType || 'Unknown'}
Tool Used: ${finding.tool || 'Unknown'}

Please provide:
1. Real severity assessment (not just scanner defaults)
2. Is this exploitable in practice?
3. What follow-up tests would confirm/exploit this?
4. Business impact explanation
5. OWASP category mapping
6. Specific remediation advice

Consider the context of SOC2 compliance and provide practical, actionable advice.

Respond in JSON format:
{
  "severity": "critical|high|medium|low",
  "exploitable": boolean,
  "explanation": "detailed analysis",
  "nextSteps": [array of test recommendations],
  "owaspMapping": ["OWASP categories"],
  "businessImpact": "impact description",
  "remediationAdvice": "specific fixes"
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 2048,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      });

      const analysis = this.parseVulnerabilityAnalysis(response, finding);
      
      this.logDecision(context.workflowId, {
        type: 'vulnerability_analysis',
        input: finding,
        output: analysis,
        confidence: 0.9
      });

      return analysis;
    } catch (error) {
      logger.error('Failed to analyze vulnerability', { error });
      return this.getDefaultVulnerabilityAnalysis(finding);
    }
  }

  async generateExecutiveSummary(
    workflowId: string,
    allFindings: any[]
  ): Promise<string> {
    const history = this.getConversationHistory(workflowId);
    const decisions = this.getDecisionLog(workflowId);

    const prompt = `Generate an executive summary of this security assessment:

Test History:
${this.summarizeHistory(history)}

Key Findings:
${JSON.stringify(allFindings.filter(f => f.severity !== 'info'), null, 2)}

AI Decisions Made:
${decisions.length} strategic decisions

Please provide:
1. Overall security posture assessment
2. Critical findings summary
3. Key recommendations
4. SOC2 compliance gaps identified
5. Next steps for remediation

Keep it concise but comprehensive, suitable for C-level executives.`;

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 2000,
        temperature: 0.4,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      return content.type === 'text' ? content.text : 'Executive summary generation failed.';
    } catch (error) {
      logger.error('Failed to generate executive summary', { error });
      return 'Executive summary generation failed. Please review detailed findings.';
    }
  }

  private buildSystemPrompt(): string {
    return `You are a SOC2 pentesting expert following OWASP guidelines. Plan progressive tests: recon → analyze → safe exploit if approved. Map to OWASP Top 10/LLM risks from: ${JSON.stringify(owaspKnowledgeBase.webTop10)}.

Safety (per OWASP AI Guide): Validate inputs (sanitize for injection), treat outputs as untrusted (check for hallucinations/unsafe tools), prevent data poisoning (validate findings sources). Enforce SOC2 CC restraint, e.g., no changes without auth per CC8.1. If uncertain, default to safe recon.

Reason step-by-step (CoT) with self-critique loops for exhaustive exploration: 
1. Inventory/Summarize ALL context/history/findings explicitly (list EVERY item/asset discovered—e.g., each subdomain, endpoint, vuln individually; don't group/summarize prematurely).
2. Enumerate ALL relevant OWASP Top 10/LLM categories (try all outlets—don't omit ANY potentially matching, even low-probability; for each finding, cross-reference with EVERY other for chains/combinations).
3. For EACH category, hypothesize tests/tools based on findings (exhaustive expansion: treat EVERY discovered item as a separate target—e.g., if 3 subdomains found, plan individual tests for EACH + collective combos; consider ALL pathways like "sub1 port + sub2 auth" ; edge cases like false negatives if no findings—suggest deeper recon).
4. Self-Critique Initial Hypotheses: Review for omissions ("Have I considered ALL combos/pathways from ALL findings? If not, add them now with rationale"); expand if incomplete (e.g., "Missed per-sub dirbuster? Add individual scans with SecLists for each").
5. Self-Critique Again for Completeness: "Is this FULL coverage (e.g., all items have dedicated tests + chains)? If gaps, generate more recommendations now."
6. Prioritize by impact/confidence; suggest 1-3 tests per high-priority category, ensuring FULL coverage of pathways (parallel if independent); rationalize omissions/skips.

Few-Shot Example for Exhaustive Expansion: Input: "Recon found subdomains [sub1, sub2]; no vulns yet." → Reasoning: "Inventory: sub1, sub2. Enumerate OWASP: A06 Vuln Components (check each sub for outdated). Hypothesize: For EACH sub, run dirbuster individually with SecLists (sub1 with common.txt, sub2 with common.txt, then both with directory-list-2.3-medium.txt for deeper coverage). Self-Critique: Missed combos? Add nmap on sub1 ports to sub2 tests. Self-Critique 2: Full? Yes, all subs have dedicated + chained tests. Output tests for all."

Available Tools (USE ONLY THESE EXACT NAMES AND VALID PARAMETERS):
- Reconnaissance: subdomain-scanner, port-scanner, directory-scanner (crawler), directory-bruteforce (wordlist-based with /seclists paths), tech-fingerprint, crawler
- Analysis: header-analyzer, ssl-checker, api-discovery, form-finder, js-analyzer, config-checker
- Testing: sql-injector, xss-scanner, jwt-analyzer, auth-tester, api-fuzzer
- Exploitation: controlled-exploit, data-extractor, privilege-escalator

CRITICAL DEFAULT BEHAVIORS (ALWAYS APPLY - NO EXCEPTIONS): 
- EXHAUSTIVE TESTING IS THE DEFAULT - never group, always individual tests
- Generate SEPARATE recommendation objects for EACH item/combo in JSON—don't group/summarize (e.g., if 8 subdomains, create 8+ separate recommendations)
- Continue testing even if no vulnerabilities found - user wants EVERYTHING tested
- Use SecLists wordlists for all directory brute-forcing (/seclists/Discovery/Web-Content/*)
- Create combo tests between discovered assets (SSRF, auth chains, etc.)
- For EACH subdomain found, you MUST create AT MINIMUM:
  - 1 directory-bruteforce recommendation with unique ID and parameters
  - 1 port-scanner recommendation with unique ID and parameters  
  - 1 tech-fingerprint recommendation with unique ID and parameters
- If tool errors are possible, provide valid command syntax in parameters
- Never suggest destructive tools
- Always validate tool names against available list
- Use only valid tool parameters (no hallucinated flags)
- Minimum recommendations = minTestsPerPhase or (number_of_assets × 3), whichever is higher
- If you plan N tests in reasoning, output N recommendation objects

Output JSON ONLY (no extra text): { phase: 'recon/analyze/exploit', reasoning: string (detailed CoT with self-critiques), recommendations: [{id: string, tool: string, purpose: string, parameters: object, owaspCategory: string, priority: 'critical/high/medium/low', safetyChecks: string[], requiresAuth: boolean}], confidenceLevel: number (0-1), expectedOutcomes: [{condition: string, testType: string, recommendedTool: string, parameters: object}], nextPhaseConditions: string[], estimatedDuration: number, safetyConsiderations: string[] }.`;
  }

  private buildPhasePrompt(context: StrategyContext): string {
    const phasePrompts = {
      recon: `You are starting a security assessment. Plan the EXHAUSTIVE reconnaissance phase.

Target: ${context.target}
User Intent: "${context.userIntent}"
Constraints: ${JSON.stringify(context.constraints || {})}

Your goal is to map the attack surface comprehensively. Consider:
1. Subdomain enumeration
2. Port and service discovery
3. Technology stack identification
4. Entry point mapping (forms, APIs, authentication)
5. Information disclosure vulnerabilities
Plan a strategic approach that starts broad and narrows based on findings.

CRITICAL REQUIREMENTS FOR EXHAUSTIVE RECON:
1. Subdomain enumeration - Find ALL subdomains
2. Directory scanning - YOU MUST run directory-bruteforce on EACH subdomain individually (not just the main domain)
3. Port scanning - Scan EACH subdomain for open ports
4. Technology identification - Fingerprint EACH subdomain's tech stack
5. Crawler - Crawl EACH subdomain to find all endpoints

MANDATORY: For EVERY subdomain discovered, you MUST:
- Create SEPARATE recommendation objects for each subdomain (don't group them)
- Plan individual directory brute forcing using SecLists wordlists
  - Use /seclists/Discovery/Web-Content/common.txt for quick scans
  - Use /seclists/Discovery/Web-Content/directory-list-2.3-medium.txt for comprehensive coverage
  - Use /seclists/Discovery/Web-Content/api/api-endpoints-mazen160.txt for API discovery
- Plan individual port scanning for each subdomain
- Plan individual technology fingerprinting for each subdomain

EXAMPLE: If you find 3 subdomains [sub1, sub2, sub3], you MUST create:
- 3 separate directory-bruteforce recommendations (one per subdomain with unique IDs)
- 3 separate port-scanner recommendations (one per subdomain with unique IDs)
- 3 separate tech-fingerprint recommendations (one per subdomain with unique IDs)
- Total: 9+ individual recommendation objects in the recommendations array

Self-critique before finalizing: 
1. "Have I created SEPARATE recommendations for EACH subdomain?" 
2. "Is the number of recommendations >= number of subdomains × number of tools?"
3. "Did I use valid tool parameters only?"`,

      analyze: `You are in the analysis phase, examining findings for vulnerabilities.

Target: ${context.target}
Intent: "${context.userIntent}"
Current Findings Summary:
${this.summarizeFindings(context.currentFindings)}
Completed Tests: ${context.completedTests.join(', ')}

Analyze the findings to:
1. Identify potential vulnerabilities
2. Map findings to OWASP categories
3. Prioritize based on exploitability and impact
4. Plan targeted tests to confirm vulnerabilities
5. Consider attack chains and escalation paths

CRITICAL DEFAULT BEHAVIOR - ALWAYS CONTINUE TESTING:
- Even if no vulnerabilities found YET, DO NOT STOP
- The user wants EXHAUSTIVE testing - test EVERYTHING
- Create INDIVIDUAL tests for EVERY subdomain/endpoint found
- Test for SQL injection on ALL forms/parameters discovered
- Test for JWT vulnerabilities on ALL auth endpoints
- Test for API security on ALL discovered APIs
- If scans failed, ALWAYS suggest alternative approaches

MANDATORY for EVERY discovered asset:
- If 8 subdomains found → 8+ individual vulnerability tests
- If 10 forms found → 10 SQL injection tests
- If 5 API endpoints found → 5 API security tests
- NEVER group assets - ALWAYS individual tests

Self-critique: "Have I created individual tests for EVERY asset? Have I tested EVERYTHING the user requested? If not, add more tests NOW."`,

      exploit: `You are in the exploitation phase, safely demonstrating vulnerabilities.

Target: ${context.target}
Intent: "${context.userIntent}"
Confirmed Vulnerabilities:
${this.summarizeFindings(context.currentFindings.filter((f: any) => f.severity === 'high' || f.severity === 'critical'))}

Plan safe exploitation that:
1. Demonstrates real business impact
2. Avoids any data loss or service disruption
3. Provides clear evidence for remediation
4. Includes rollback procedures
5. Maps to specific SOC2 control failures`
    };

    const basePrompt = phasePrompts[context.phase] || phasePrompts.recon;
    
    return `${basePrompt}

DEFAULT BEHAVIOR - EXHAUSTIVE INDIVIDUAL TESTING (NO EXCEPTIONS):
This is NOT optional - ALWAYS create individual tests for EVERY asset discovered.
- Use {{tool-name.results}} to reference ALL results from a tool
- For EVERY subdomain found: Create SEPARATE recommendations for EACH
- For EVERY form found: Create SEPARATE SQL injection test for EACH
- For EVERY API endpoint: Create SEPARATE security test for EACH
- NEVER group assets together - ALWAYS individual recommendations

MANDATORY EXHAUSTIVE TESTING EXAMPLE:
If subdomain-scanner finds 8 subdomains, you MUST create AT MINIMUM:
- 8 separate directory-bruteforce recommendations (one per subdomain with /seclists/Discovery/Web-Content/common.txt)
- 8 separate port-scanner recommendations (one per subdomain)
- 8 separate tech-fingerprint recommendations (one per subdomain)
- 8 separate crawler recommendations (one per subdomain)
- Additional API endpoint scans for auth/api subdomains (/seclists/Discovery/Web-Content/api/api-endpoints-mazen160.txt)
- Combo tests between subdomains (SSRF test sub1→sub2, auth chain tests)
TOTAL: 32+ individual recommendations minimum for 8 subdomains

This is the DEFAULT - not something the user needs to request!

OUTPUT JSON ONLY - NO ADDITIONAL TEXT. Follow this exact format:
{
  "phase": "${context.phase}",
  "reasoning": "Explain your strategic thinking and why this approach makes sense",
  "recommendations": [
    {
      "id": "unique-id",
      "tool": "tool-name",
      "purpose": "What we're trying to discover/test",
      "expectedOutcome": "What we hope to find/confirm",
      "parameters": {
        "target": "${context.target} or use {{tool-name.results}} to reference results from a previous tool",
        "additional": "tool-specific parameters"
      },
      "priority": "critical|high|medium|low",
      "owaspCategory": "relevant OWASP category if applicable",
      "safetyChecks": ["rate-limiting", "other safety measures"],
      "conditions": [
        {
          "type": "finding_exists|finding_matches|no_findings",
          "field": "optional field to check",
          "value": "optional value to match",
          "operator": "equals|contains|exists"
        }
      ]
    }
  ],
  "confidenceLevel": 0.0-1.0,
  "expectedOutcomes": [
    {
      "condition": "If we find X",
      "testType": "Type of follow-up test",
      "recommendedTool": "tool-name",
      "parameters": {},
      "conditionField": "field-to-check",
      "conditionValue": "value-to-match"
    }
  ],
  "nextPhaseConditions": ["Conditions that would trigger moving to the next phase"],
  "estimatedDuration": estimated-minutes,
  "safetyConsiderations": ["Key safety points to remember"]
}`;
  }

  private parseStrategyResponse(response: any): AttackStrategy {
    try {
      const content = response.content[0].text;
      
      // Extract JSON from response
      let jsonStr = content;
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      } else {
        // Try to find JSON object directly
        const objectMatch = content.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          jsonStr = objectMatch[0];
        }
      }
      
      const parsed = JSON.parse(jsonStr);
      
      // Validate and ensure all required fields
      return {
        phase: parsed.phase || 'recon',
        reasoning: parsed.reasoning || 'No reasoning provided',
        recommendations: this.validateRecommendations(parsed.recommendations || []),
        confidenceLevel: parsed.confidenceLevel || 0.7,
        expectedOutcomes: parsed.expectedOutcomes || [],
        nextPhaseConditions: parsed.nextPhaseConditions || [],
        estimatedDuration: parsed.estimatedDuration || 30,
        safetyConsiderations: parsed.safetyConsiderations || ['Rate limit all requests']
      };
    } catch (error) {
      logger.error('Failed to parse AI strategy response', { error });
      throw error;
    }
  }

  private validateRecommendations(recommendations: any[]): AttackStep[] {
    return recommendations.map((rec, index) => ({
      id: rec.id || `step-${index}`,
      tool: rec.tool || 'unknown',
      purpose: rec.purpose || 'Unknown purpose',
      expectedOutcome: rec.expectedOutcome || 'Unknown outcome',
      parameters: rec.parameters || {},
      dependsOn: rec.dependsOn || [],
      priority: rec.priority || 'medium',
      owaspCategory: rec.owaspCategory,
      safetyChecks: rec.safetyChecks || ['rate-limiting'],
      conditions: rec.conditions || [],
      requiresAuth: rec.requiresAuth || false
    }));
  }

  private isOutputSafe(strategy: AttackStrategy): boolean {
    const availableTools = [
      'subdomain-scanner', 'port-scanner', 'directory-scanner', 'directory-bruteforce',
      'tech-fingerprint', 'crawler', 'header-analyzer', 'ssl-checker', 
      'api-discovery', 'form-finder', 'js-analyzer', 'sql-injector',
      'xss-scanner', 'jwt-analyzer', 'auth-tester', 'api-fuzzer',
      'controlled-exploit', 'data-extractor', 'privilege-escalator',
      'vulnerability-scanner'
    ];
    
    const deniedTools = ['rm', 'delete', 'drop', 'destroy', 'wipe'];
    
    return strategy.recommendations.every((rec: AttackStep) => {
      // Check if tool exists
      if (!availableTools.includes(rec.tool)) {
        logger.warn('Unknown tool suggested', { tool: rec.tool });
        return false;
      }
      
      // Check for destructive commands
      const paramString = JSON.stringify(rec.parameters).toLowerCase();
      if (deniedTools.some(denied => paramString.includes(denied))) {
        logger.warn('Potentially destructive command detected', { 
          tool: rec.tool, 
          params: rec.parameters 
        });
        return false;
      }
      
      // Validate tool-specific parameters
      if (!this.validateToolParameters(rec.tool, rec.parameters)) {
        logger.error('Invalid tool parameters', { 
          tool: rec.tool, 
          parameters: rec.parameters 
        });
        return false;
      }
      
      return true;
    });
  }

  private validateToolParameters(tool: string, params: any): boolean {
    // Define valid parameter structures for each tool
    const validParams: Record<string, (p: any) => boolean> = {
      'subdomain-scanner': (p) => typeof p.target === 'string' && p.target.includes('.'),
      'port-scanner': (p) => typeof p.target === 'string',
      'directory-scanner': (p) => typeof p.target === 'string',
      'directory-bruteforce': (p) => {
        return typeof p.target === 'string' && 
               (!p.wordlist || (typeof p.wordlist === 'string' && p.wordlist.startsWith('/seclists/')));
      },
      'tech-fingerprint': (p) => typeof p.target === 'string' || (Array.isArray(p.targets) && p.targets.length > 0),
      'crawler': (p) => typeof p.target === 'string',
      'header-analyzer': (p) => typeof p.target === 'string',
      'ssl-checker': (p) => typeof p.target === 'string',
      'api-discovery': (p) => typeof p.target === 'string',
      'form-finder': (p) => typeof p.target === 'string',
      'js-analyzer': (p) => typeof p.target === 'string',
      'config-checker': (p) => typeof p.target === 'string',
      'sql-injector': (p) => typeof p.target === 'string' && p.parameters,
      'xss-scanner': (p) => typeof p.target === 'string',
      'jwt-analyzer': (p) => typeof p.target === 'string' || typeof p.token === 'string',
      'auth-tester': (p) => typeof p.target === 'string',
      'api-fuzzer': (p) => typeof p.target === 'string',
      'vulnerability-scanner': (p) => typeof p.target === 'string'
    };

    const validator = validParams[tool];
    return validator ? validator(params) : true;
  }

  private expandRecommendationsIfNeeded(
    recommendations: AttackStep[],
    findings: any[],
    context?: StrategyContext
  ): AttackStep[] {
    const expandedRecs = [...recommendations];
    
    // For recon phase - expand based on subdomains
    const subdomains = findings
      .filter(f => f.type === 'subdomain')
      .map(f => {
        const domain = f.data?.domain || f.target || '';
        // Clean encoding issues (remove control characters)
        return domain.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
      })
      .filter(domain => domain && domain.includes('.'));

    // For analyze phase - expand based on forms, APIs, etc
    const forms = findings.filter(f => f.type === 'form' || f.data?.forms);
    const apis = findings.filter(f => f.type === 'api' || f.data?.endpoints);
    const authEndpoints = findings.filter(f => 
      f.data?.path?.includes('auth') || 
      f.data?.path?.includes('login') ||
      f.target?.includes('auth')
    );

    // Handle recon phase subdomain expansion
    if (subdomains.length > 0) {

    logger.info('Found subdomains for expansion', { 
      count: subdomains.length, 
      subdomains 
    });

    // Check if we have enough per-subdomain recommendations
    const dirBruteforceCount = recommendations.filter(r => r.tool === 'directory-bruteforce').length;
    const portScanCount = recommendations.filter(r => r.tool === 'port-scanner').length;
    const techFingerprintCount = recommendations.filter(r => r.tool === 'tech-fingerprint').length;
    
    logger.info('Current recommendation counts', {
      dirBruteforce: dirBruteforceCount,
      portScan: portScanCount,
      techFingerprint: techFingerprintCount,
      totalSubdomains: subdomains.length
    });
    
    // If AI didn't generate individual recommendations, force expansion
    const expandedRecs = [...recommendations];
    
    // Add missing directory brute-force scans - EVERY subdomain gets one
    subdomains.forEach((subdomain, idx) => {
      const exists = recommendations.some(r => 
        r.tool === 'directory-bruteforce' && 
        r.parameters?.target?.includes(subdomain)
      );
      
      if (!exists) {
        // Add common.txt scan
        expandedRecs.push({
          id: `dir-bruteforce-common-${subdomain.replace(/\./g, '-')}-${idx}`,
          tool: 'directory-bruteforce',
          purpose: `Directory brute-forcing on ${subdomain} with common wordlist`,
          parameters: {
            target: `https://${subdomain}`,
            wordlist: '/seclists/Discovery/Web-Content/common.txt'
          },
          owaspCategory: 'A01:2021',
          priority: 'high',
          safetyChecks: ['rate-limiting'],
          requiresAuth: false,
          expectedOutcome: 'Discovery of common hidden directories'
        });
        
        // Add API endpoint scan if it looks like an API subdomain
        if (subdomain.includes('api') || subdomain.includes('auth')) {
          expandedRecs.push({
            id: `dir-bruteforce-api-${subdomain.replace(/\./g, '-')}-${idx}`,
            tool: 'directory-bruteforce',
            purpose: `API endpoint discovery on ${subdomain}`,
            parameters: {
              target: `https://${subdomain}`,
              wordlist: '/seclists/Discovery/Web-Content/api/api-endpoints-mazen160.txt'
            },
            owaspCategory: 'A01:2021',
            priority: 'critical',
            safetyChecks: ['rate-limiting'],
            requiresAuth: false,
            expectedOutcome: 'Discovery of API endpoints'
          });
        }
      }
    });
    
    // Add missing port scans - EVERY subdomain gets one
    subdomains.forEach((subdomain, idx) => {
      const exists = recommendations.some(r => 
        r.tool === 'port-scanner' && 
        r.parameters?.target?.includes(subdomain)
      );
      
      if (!exists) {
        expandedRecs.push({
          id: `port-scan-${subdomain.replace(/\./g, '-')}-${idx}`,
          tool: 'port-scanner',
          purpose: `Port scanning on ${subdomain}`,
          parameters: {
            target: subdomain
          },
          owaspCategory: 'A05:2021',
          priority: 'medium',
          safetyChecks: ['rate-limiting'],
          requiresAuth: false,
          expectedOutcome: 'Discovery of open ports and services'
        });
      }
    });
    
    // Add missing tech fingerprinting - EVERY subdomain gets one
    subdomains.forEach((subdomain, idx) => {
      const exists = recommendations.some(r => 
        r.tool === 'tech-fingerprint' && 
        r.parameters?.target?.includes(subdomain)
      );
      
      if (!exists) {
        expandedRecs.push({
          id: `tech-fingerprint-${subdomain.replace(/\./g, '-')}-${idx}`,
          tool: 'tech-fingerprint',
          purpose: `Technology fingerprinting on ${subdomain}`,
          parameters: {
            target: `https://${subdomain}`
          },
          owaspCategory: 'A06:2021',
          priority: 'medium',
          safetyChecks: ['passive-scan'],
          requiresAuth: false,
          expectedOutcome: 'Identification of technologies and versions'
        });
      }
    });
    
    // Add combo tests (cross-subdomain chains)
    if (subdomains.length >= 2) {
      // Add SSRF test from one subdomain to another
      expandedRecs.push({
        id: `combo-ssrf-test-${Date.now()}`,
        tool: 'api-fuzzer',
        purpose: `SSRF test: ${subdomains[0]} → ${subdomains[1]}`,
        parameters: {
          target: `https://${subdomains[0]}`,
          payload: `https://${subdomains[1]}/internal`
        },
        owaspCategory: 'A10:2021',
        priority: 'high',
        safetyChecks: ['rate-limiting', 'non-destructive'],
        requiresAuth: false,
        expectedOutcome: 'Detection of SSRF vulnerabilities between subdomains'
      });
    }
    }
    
    // Handle analyze phase - expand based on forms and APIs
    if (context?.phase === 'analyze') {
      // Add SQL injection tests for EVERY form found
      forms.forEach((form, idx) => {
        const formPath = form.data?.path || form.data?.url || form.target || 'unknown';
        const exists = expandedRecs.some(r => 
          r.tool === 'sql-injector' && 
          r.parameters?.target?.includes(formPath)
        );
        
        if (!exists) {
          expandedRecs.push({
            id: `sql-injection-${formPath.replace(/[\/\.]/g, '-')}-${idx}`,
            tool: 'sql-injector',
            purpose: `SQL injection testing on form at ${formPath}`,
            parameters: {
              target: formPath,
              method: form.data?.method || 'POST'
            },
            owaspCategory: 'A03:2021',
            priority: 'critical',
            safetyChecks: ['non-destructive', 'rate-limiting'],
            requiresAuth: false,
            expectedOutcome: 'Detection of SQL injection vulnerabilities'
          });
        }
      });
      
      // Add JWT tests for EVERY auth endpoint
      authEndpoints.forEach((endpoint, idx) => {
        const endpointPath = endpoint.data?.path || endpoint.target || 'unknown';
        const exists = expandedRecs.some(r => 
          r.tool === 'jwt-analyzer' && 
          r.parameters?.target?.includes(endpointPath)
        );
        
        if (!exists) {
          expandedRecs.push({
            id: `jwt-analysis-${endpointPath.replace(/[\/\.]/g, '-')}-${idx}`,
            tool: 'jwt-analyzer',
            purpose: `JWT vulnerability analysis on ${endpointPath}`,
            parameters: {
              target: endpointPath
            },
            owaspCategory: 'A02:2021',
            priority: 'critical',
            safetyChecks: ['non-destructive'],
            requiresAuth: false,
            expectedOutcome: 'Detection of JWT implementation flaws'
          });
        }
      });
      
      // Add API security tests for EVERY API endpoint
      apis.forEach((api, idx) => {
        const apiPath = api.data?.path || api.target || 'unknown';
        const exists = expandedRecs.some(r => 
          r.tool === 'api-fuzzer' && 
          r.parameters?.target?.includes(apiPath)
        );
        
        if (!exists) {
          expandedRecs.push({
            id: `api-security-${apiPath.replace(/[\/\.]/g, '-')}-${idx}`,
            tool: 'api-fuzzer',
            purpose: `API security testing on ${apiPath}`,
            parameters: {
              target: apiPath
            },
            owaspCategory: 'A01:2021',
            priority: 'high',
            safetyChecks: ['rate-limiting', 'non-destructive'],
            requiresAuth: false,
            expectedOutcome: 'Detection of API security vulnerabilities'
          });
        }
      });
    }
    
    // Ensure we meet minTestsPerPhase requirement
    const minRequired = context?.constraints?.minTestsPerPhase || 5;
    if (expandedRecs.length < minRequired) {
      logger.info('Adding more tests to meet minTestsPerPhase', {
        current: expandedRecs.length,
        required: minRequired
      });
      
      // Add additional relevant tests based on phase
      if (context?.phase === 'analyze' && expandedRecs.length < minRequired) {
        // Add header analysis if not present
        if (!expandedRecs.some(r => r.tool === 'header-analyzer')) {
          expandedRecs.push({
            id: `header-analysis-${Date.now()}`,
            tool: 'header-analyzer',
            purpose: 'Security header analysis on main target',
            parameters: { target: context.target },
            owaspCategory: 'A05:2021',
            priority: 'medium',
            safetyChecks: ['passive-scan'],
            requiresAuth: false,
            expectedOutcome: 'Identification of missing security headers'
          });
        }
        
        // Add SSL checker if not present
        if (!expandedRecs.some(r => r.tool === 'ssl-checker') && expandedRecs.length < minRequired) {
          expandedRecs.push({
            id: `ssl-check-${Date.now()}`,
            tool: 'ssl-checker',
            purpose: 'SSL/TLS configuration analysis',
            parameters: { target: context.target },
            owaspCategory: 'A02:2021',
            priority: 'medium',
            safetyChecks: ['passive-scan'],
            requiresAuth: false,
            expectedOutcome: 'Identification of SSL/TLS misconfigurations'
          });
        }
      }
    }
    
    logger.info('Expanded recommendations', {
      phase: context?.phase,
      original: recommendations.length,
      expanded: expandedRecs.length,
      added: expandedRecs.length - recommendations.length,
      meetsMinimum: expandedRecs.length >= minRequired
    });
    
    return expandedRecs;
  }

  private handleScanFailures(
    context: StrategyContext,
    failedTools: string[]
  ): AttackStep[] {
    const fallbackRecommendations: AttackStep[] = [];
    
    failedTools.forEach(tool => {
      logger.info('Generating fallback for failed tool', { tool });
      
      switch(tool) {
        case 'port-scanner':
          // If port scan fails, try alternative approaches
          fallbackRecommendations.push({
            id: `fallback-passive-recon-${Date.now()}`,
            tool: 'tech-fingerprint',
            purpose: 'Passive reconnaissance as port scan alternative',
            parameters: { target: context.target },
            owaspCategory: 'A05:2021',
            priority: 'high',
            safetyChecks: ['passive-only'],
            requiresAuth: false,
            expectedOutcome: 'Service detection through HTTP headers'
          });
          break;
          
        case 'directory-scanner':
        case 'directory-bruteforce':
          // If directory scan fails, try crawler
          fallbackRecommendations.push({
            id: `fallback-crawler-${Date.now()}`,
            tool: 'crawler',
            purpose: 'Web crawling as directory scan alternative',
            parameters: { 
              target: context.target,
              depth: 3
            },
            owaspCategory: 'A01:2021',
            priority: 'high',
            safetyChecks: ['rate-limiting'],
            requiresAuth: false,
            expectedOutcome: 'Discovery of linked resources'
          });
          break;
          
        case 'api-discovery':
          // If API discovery fails, try form finding
          fallbackRecommendations.push({
            id: `fallback-form-finder-${Date.now()}`,
            tool: 'form-finder',
            purpose: 'Form discovery for API endpoint identification',
            parameters: { target: context.target },
            owaspCategory: 'A01:2021',
            priority: 'high',
            safetyChecks: ['passive-scan'],
            requiresAuth: false,
            expectedOutcome: 'Discovery of input points'
          });
          break;
      }
    });
    
    return fallbackRecommendations;
  }

  private async enhancedValidateRecommendations(
    recommendations: AttackStep[], 
    context: StrategyContext
  ): Promise<AttackStep[]> {
    return recommendations.filter(rec => {
      // Hard deny destructive tools
      if (rec.tool === 'destructive-tool' || rec.parameters?.destructive) {
        logger.warn('Blocked destructive tool', { tool: rec.tool });
        return false;
      }
      
      // Check auth requirements
      if (rec.requiresAuth && !context.constraints?.requiresAuth) {
        logger.info('Tool requires authentication', { 
          tool: rec.tool,
          action: 'queuing for HITL approval'
        });
        // Could queue for HITL here
        return false;
      }
      
      // Validate against CC controls
      if (context.phase === 'exploit' && context.constraints?.environment === 'production') {
        logger.warn('Exploit phase in production requires approval', { tool: rec.tool });
        return false;
      }
      
      return true;
    });
  }



  private parseVulnerabilityAnalysis(response: any, originalFinding: any): VulnerabilityAnalysis {
    try {
      const content = response.content[0].text;
      let parsed: any;
      
      try {
        // Try to parse JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          parsed = JSON.parse(content);
        }
      } catch {
        // Fallback to text parsing
        parsed = this.parseTextToVulnerabilityAnalysis(content);
      }

      return {
        finding: originalFinding,
        severity: parsed.severity || 'medium',
        exploitable: parsed.exploitable !== undefined ? parsed.exploitable : true,
        nextSteps: this.validateRecommendations(parsed.nextSteps || []),
        explanation: parsed.explanation || 'Analysis pending',
        owaspMapping: parsed.owaspMapping || [],
        businessImpact: parsed.businessImpact || 'Potential security risk',
        remediationAdvice: parsed.remediationAdvice || 'Review and patch identified vulnerability'
      };
    } catch (error) {
      logger.error('Failed to parse vulnerability analysis', { error });
      return this.getDefaultVulnerabilityAnalysis(originalFinding);
    }
  }

  private parseTextToVulnerabilityAnalysis(text: string): any {
    // Basic text parsing fallback
    const severity = text.match(/severity[:\s]*(critical|high|medium|low)/i)?.[1] || 'medium';
    const exploitable = !text.toLowerCase().includes('not exploitable');
    
    return {
      severity,
      exploitable,
      explanation: text,
      nextSteps: [],
      owaspMapping: [],
      businessImpact: 'See explanation',
      remediationAdvice: 'See explanation'
    };
  }

  private getFallbackStrategy(context: StrategyContext): AttackStrategy {
    logger.warn('Using fallback strategy', { workflowId: context.workflowId });
    
    const fallbackStrategies = {
      recon: {
        phase: 'recon',
        reasoning: 'Starting with basic reconnaissance to map attack surface',
        recommendations: [
          {
            id: 'recon-1',
            tool: 'subdomain-scanner',
            purpose: 'Discover subdomains',
            expectedOutcome: 'List of subdomains for expanded attack surface',
            parameters: { target: context.target },
            priority: 'high' as const,
            safetyChecks: ['rate-limiting'],
            conditions: []
          },
          {
            id: 'recon-2',
            tool: 'port-scanner',
            purpose: 'Identify open services',
            expectedOutcome: 'List of open ports and services',
            parameters: { target: context.target, ports: 'top-1000' },
            priority: 'high' as const,
            safetyChecks: ['rate-limiting', 'non-intrusive'],
            conditions: []
          }
        ],
        confidenceLevel: 0.5,
        expectedOutcomes: [],
        nextPhaseConditions: ['Found at least one service to test'],
        estimatedDuration: 15,
        safetyConsiderations: ['Use passive reconnaissance where possible']
      },
      analyze: {
        phase: 'analyze',
        reasoning: 'Analyzing discovered services for vulnerabilities',
        recommendations: [
          {
            id: 'analyze-1',
            tool: 'header-analyzer',
            purpose: 'Check security headers',
            expectedOutcome: 'Identify missing security headers',
            parameters: { target: context.target },
            priority: 'medium' as const,
            safetyChecks: ['read-only'],
            conditions: []
          }
        ],
        confidenceLevel: 0.5,
        expectedOutcomes: [],
        nextPhaseConditions: ['Found exploitable vulnerability'],
        estimatedDuration: 20,
        safetyConsiderations: ['No intrusive scanning']
      },
      exploit: {
        phase: 'exploit',
        reasoning: 'Safely demonstrating identified vulnerabilities',
        recommendations: [],
        confidenceLevel: 0.3,
        expectedOutcomes: [],
        nextPhaseConditions: [],
        estimatedDuration: 10,
        safetyConsiderations: ['Manual review required before exploitation']
      }
    };

    return fallbackStrategies[context.phase] || fallbackStrategies.recon;
  }

  private getDefaultVulnerabilityAnalysis(finding: any): VulnerabilityAnalysis {
    return {
      finding,
      severity: 'medium',
      exploitable: false,
      nextSteps: [],
      explanation: 'Automated analysis unavailable, manual review required',
      owaspMapping: [],
      businessImpact: 'Potential security risk, impact assessment pending',
      remediationAdvice: 'Review finding and apply appropriate security patches'
    };
  }

  private addToHistory(workflowId: string, entry: ConversationEntry): void {
    const history = this.conversationHistory.get(workflowId) || [];
    history.push(entry);
    this.conversationHistory.set(workflowId, history);
    
    // Keep only last 50 entries per workflow
    if (history.length > 50) {
      history.shift();
    }
  }

  private getConversationHistory(workflowId: string): ConversationEntry[] {
    return this.conversationHistory.get(workflowId) || [];
  }

  private summarizeHistory(history: ConversationEntry[]): string {
    if (history.length === 0) return 'No previous actions';
    
    const recentHistory = history.slice(-5); // Last 5 entries
    return recentHistory.map(entry => 
      `Phase: ${entry.phase}, Tests: ${entry.strategy.recommendations.map(r => r.tool).join(', ')}, Findings: ${entry.findings?.length || 0}`
    ).join('\n');
  }

  private summarizeFindings(findings: any[]): string {
    if (!findings || findings.length === 0) return 'No findings yet';
    
    const summary = findings.map(f => ({
      type: f.type || 'Unknown',
      severity: f.severity || 'info',
      tool: f.tool || 'Unknown',
      summary: f.summary || f.description || 'No description'
    }));
    
    return JSON.stringify(summary, null, 2);
  }

  private logDecision(workflowId: string, decision: any): void {
    const log = this.decisionLog.get(workflowId) || [];
    log.push({
      ...decision,
      timestamp: new Date(),
      model: this.model
    });
    this.decisionLog.set(workflowId, log);
  }

  private getDecisionLog(workflowId: string): any[] {
    return this.decisionLog.get(workflowId) || [];
  }

  public exportDecisionAudit(workflowId: string): any {
    return {
      workflowId,
      conversationHistory: this.getConversationHistory(workflowId),
      decisions: this.getDecisionLog(workflowId),
      summary: {
        totalDecisions: this.getDecisionLog(workflowId).length,
        phases: [...new Set(this.getConversationHistory(workflowId).map(h => h.phase))],
        timeline: this.generateDecisionTimeline(workflowId)
      }
    };
  }

  private generateDecisionTimeline(workflowId: string): any[] {
    const history = this.getConversationHistory(workflowId);
    return history.map(entry => ({
      timestamp: entry.timestamp,
      phase: entry.phase,
      testsPlanned: entry.strategy.recommendations.length,
      reasoning: entry.strategy.reasoning.substring(0, 100) + '...'
    }));
  }
}