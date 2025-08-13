/**
 * Complete test scenario for designarena.ai (Arena)
 * Demonstrates true AI-driven progressive security testing
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
// When running from backend directory, .env is in parent directory
const envPath = path.resolve(process.cwd(), '..', '.env');
console.log('Loading env from:', envPath);
dotenv.config({ path: envPath });

// Verify the API key is loaded
console.log('ANTHROPIC_API_KEY loaded:', !!process.env.ANTHROPIC_API_KEY);
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY not found after loading .env');
}

import { AIOrchestrator } from '../orchestration/aiOrchestrator.js';
import { EnhancedWebSocketManager } from '../websocket/enhancedWebSocketManager.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ArenaScenario');

export async function runArenaSecurityTest() {
  logger.info('Starting Arena security test scenario');
  
  // Initialize components
  // For test scenario, we don't need WebSocket updates
  const orchestrator = new AIOrchestrator();
  
  // Define the test request based on user intent
  const testRequest = {
    target: 'https://www.designarena.ai',
    userIntent: 'I want you to test against all subdomains and dirs. Test all access, stuff like sql injection, sending JWT tokens, catching any leaky apis stuff like this.',
    constraints: {
      environment: 'production' as 'production',
      timeLimit: 7200000, // 2 hours
      scope: [
        'designarena.ai',
        '*.designarena.ai',
        'console.designarena.ai',
        'api.designarena.ai'
      ]
    }
  };

  try {
    logger.info('Executing AI-driven security workflow', {
      target: testRequest.target,
      intent: testRequest.userIntent
    });

    // Execute the workflow
    const result = await orchestrator.executeWorkflow(testRequest);
    
    // Log execution summary
    logger.info('Security test completed', {
      workflowId: result.workflowId,
      status: result.status,
      duration: `${Math.round(result.duration / 1000)}s`,
      phasesCompleted: result.phases.length,
      totalFindings: result.totalFindings.length,
      criticalFindings: result.criticalFindings.length,
      owaspCoverage: Object.keys(result.owaspCoverage).length
    });

    // Display executive summary
    console.log('\n=== EXECUTIVE SUMMARY ===\n');
    console.log(result.executiveSummary);
    
    // Display critical findings
    if (result.criticalFindings.length > 0) {
      console.log('\n=== CRITICAL FINDINGS ===\n');
      for (const finding of result.criticalFindings) {
        console.log(`- ${finding.title}`);
        console.log(`  Severity: ${finding.severity}`);
        console.log(`  Description: ${finding.description}`);
        console.log(`  Tool: ${finding.tool || 'Unknown'}`);
        if (finding.remediation) {
          console.log(`  Remediation: ${finding.remediation}`);
        }
        console.log('');
      }
    }
    
    // Display OWASP coverage
    console.log('\n=== OWASP COVERAGE ===\n');
    for (const [category, count] of Object.entries(result.owaspCoverage)) {
      console.log(`${category}: ${count} tests`);
    }
    
    // Display recommendations
    console.log('\n=== RECOMMENDATIONS ===\n');
    for (const recommendation of result.recommendations) {
      console.log(`- ${recommendation}`);
    }
    
    // Display audit summary
    if (result.auditReport) {
      console.log('\n=== AI DECISION AUDIT ===\n');
      console.log(`Total AI Decisions: ${result.auditReport.totalDecisions}`);
      console.log(`Average Confidence: ${(result.auditReport.averageConfidence * 100).toFixed(1)}%`);
      console.log(`Low Confidence Decisions: ${result.auditReport.lowConfidenceDecisions.length}`);
      console.log(`Critical Decisions: ${result.auditReport.criticalDecisions.length}`);
    }
    
    return result;
    
  } catch (error) {
    logger.error('Security test failed', { 
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error 
    });
    console.error('Full error:', error);
    throw error;
  }
}

// Example of what the AI should do:
/*
1. RECONNAISSANCE PHASE:
   - Enumerate subdomains (should find console.designarena.ai, api.designarena.ai, etc.)
   - Scan ports on discovered subdomains
   - Identify technologies (web servers, frameworks, etc.)
   - Crawl directories and endpoints
   - Discover API endpoints

2. ANALYSIS PHASE (based on recon findings):
   - If APIs found → analyze authentication methods, look for JWT usage
   - If forms found → identify injection points
   - If login found → check for weak authentication
   - Check security headers on all endpoints
   - Analyze SSL/TLS configuration

3. EXPLOITATION PHASE (based on vulnerabilities found):
   - If SQL injection suspected → safely test with harmless payloads
   - If JWT found → analyze for weak signing, algorithm confusion
   - If API endpoints found → test for authorization bypasses
   - If sensitive endpoints found → check access controls

The AI makes all these decisions dynamically based on what it discovers,
not from a pre-defined template!
*/

// Run the test if this file is executed directly
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Node CJS guard for direct execution without ESM module flag
if ((global as any).process?.argv?.[1] && __filename === process.argv[1]) {
  runArenaSecurityTest()
    .then(() => {
      logger.info('Test scenario completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Test scenario failed', { 
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error 
      });
      console.error('Main catch - Full error:', error);
      process.exit(1);
    });
}
