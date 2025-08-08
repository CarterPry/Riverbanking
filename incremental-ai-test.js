#!/usr/bin/env node

/**
 * Incremental AI Security Test Runner
 * Captures AI's initial planning, thought process, and first steps
 */

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CONFIG = {
  backendUrl: process.env.BACKEND_URL || 'http://localhost:8001',
  wsUrl: process.env.WS_URL || 'ws://localhost:8001',
  outputDir: './ai-incremental-tests',
  captureAIThoughts: true,
  verboseLogging: true
};

// Test scenarios with incremental complexity
const TEST_SCENARIOS = [
  {
    id: 'initial-planning',
    name: 'Initial Security Assessment Planning',
    description: 'Capture AI\'s initial planning and thought process',
    request: {
      target: 'https://sweetspotgov.com',
      scope: '/*',
      description: 'I want you to test against all subdomains and dir\'s. Test all access, stuff like sql injection, sending JWT tokens, catching any leaky api\'s stuff like this.',
      testType: 'comprehensive',
      options: {
        captureAIReasoning: true,
        includeStrategicPlanning: true,
        verboseOutput: true,
        maxInitialTests: 3, // Limit to see focused planning
        showThoughtProcess: true
      }
    },
    expectations: {
      capturePhases: ['planning', 'classification', 'strategy', 'first_step'],
      requiredOutputs: ['reasoning', 'test_plan', 'prioritization', 'risk_assessment']
    }
  },
  {
    id: 'subdomain-enum',
    name: 'Subdomain Enumeration Focus',
    description: 'Focus on subdomain discovery as first step',
    request: {
      target: 'https://sweetspotgov.com',
      scope: '/*',
      description: 'Start with comprehensive subdomain enumeration',
      testType: 'targeted',
      options: {
        startWithRecon: true,
        focusArea: 'subdomains'
      }
    }
  },
  {
    id: 'api-discovery',
    name: 'API Discovery and Analysis',
    description: 'Focus on finding and testing APIs',
    request: {
      target: 'https://sweetspotgov.com',
      scope: '/api/*, /v1/*, /graphql/*',
      description: 'Find and test all API endpoints, especially looking for leaky or unprotected APIs',
      testType: 'targeted',
      options: {
        focusArea: 'api_security',
        includeJWTAnalysis: true
      }
    }
  }
];

// Capture AI communication
class AIMonitor {
  constructor(workflowId) {
    this.workflowId = workflowId;
    this.logs = [];
    this.aiThoughts = [];
    this.testPlan = null;
    this.outputFile = path.join(CONFIG.outputDir, `ai-analysis-${workflowId}.json`);
  }

  log(type, data) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      data
    };
    this.logs.push(entry);
    
    if (CONFIG.verboseLogging) {
      console.log(`[${type}]`, JSON.stringify(data, null, 2));
    }
  }

  captureAIThought(phase, thought) {
    this.aiThoughts.push({
      timestamp: new Date().toISOString(),
      phase,
      thought
    });
    
    console.log(`\n🤖 AI Thinking (${phase}):`);
    console.log('─'.repeat(60));
    console.log(thought);
    console.log('─'.repeat(60));
  }

  captureTestPlan(plan) {
    this.testPlan = plan;
    console.log('\n📋 AI Test Plan:');
    console.log('═'.repeat(60));
    console.log(JSON.stringify(plan, null, 2));
    console.log('═'.repeat(60));
  }

  async save() {
    const output = {
      workflowId: this.workflowId,
      timestamp: new Date().toISOString(),
      logs: this.logs,
      aiThoughts: this.aiThoughts,
      testPlan: this.testPlan,
      summary: {
        totalLogs: this.logs.length,
        totalThoughts: this.aiThoughts.length,
        phases: [...new Set(this.aiThoughts.map(t => t.phase))],
        hasTestPlan: !!this.testPlan
      }
    };

    fs.writeFileSync(this.outputFile, JSON.stringify(output, null, 2));
    console.log(`\n✅ Analysis saved to: ${this.outputFile}`);
    return output;
  }
}

// WebSocket connection for real-time monitoring
async function connectWebSocket(workflowId, monitor) {
  const ws = new WebSocket(`${CONFIG.wsUrl}/ws`);

  return new Promise((resolve, reject) => {
    ws.on('open', () => {
      console.log('🔌 WebSocket connected');
      ws.send(JSON.stringify({ type: 'subscribe', workflowId }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        
        // Capture different types of AI communication
        switch (msg.type) {
          case 'ai:thinking':
            monitor.captureAIThought(msg.phase || 'general', msg.content);
            break;
          
          case 'ai:strategy':
            monitor.log('strategy', msg);
            if (msg.reasoning) {
              monitor.captureAIThought('strategy', msg.reasoning);
            }
            if (msg.testPlan) {
              monitor.captureTestPlan(msg.testPlan);
            }
            break;
          
          case 'ai:classification':
            monitor.log('classification', msg);
            monitor.captureAIThought('classification', `Intent: ${msg.intent}, Confidence: ${msg.confidence}`);
            break;
          
          case 'test:plan':
            monitor.captureTestPlan(msg.plan);
            break;
          
          case 'test:start':
            console.log(`\n🚀 Starting test: ${msg.test}`);
            monitor.log('test_start', msg);
            break;
          
          case 'workflow:complete':
            console.log('\n✅ Workflow completed');
            ws.close();
            resolve();
            break;
          
          default:
            monitor.log(msg.type || 'unknown', msg);
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
      reject(err);
    });

    ws.on('close', () => {
      console.log('🔌 WebSocket disconnected');
      resolve();
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      ws.close();
      resolve();
    }, 300000);
  });
}

// Run a single test scenario
async function runScenario(scenario) {
  console.log('\n' + '='.repeat(70));
  console.log(`🧪 Running Scenario: ${scenario.name}`);
  console.log('='.repeat(70));
  console.log(`Description: ${scenario.description}`);
  console.log(`Target: ${scenario.request.target}`);
  console.log(`User Intent: ${scenario.request.description}`);
  console.log('─'.repeat(70));

  const workflowId = uuidv4();
  const monitor = new AIMonitor(workflowId);

  // Start WebSocket monitoring
  const wsPromise = connectWebSocket(workflowId, monitor);

  try {
    // Send the test request
    console.log('\n📤 Sending request to backend...');
    const response = await fetch(`${CONFIG.backendUrl}/api/workflows/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workflow-Id': workflowId
      },
      body: JSON.stringify({
        ...scenario.request,
        workflowId,
        metadata: {
          scenarioId: scenario.id,
          captureAIReasoning: true
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('\n📥 Initial Response:', JSON.stringify(result, null, 2));
    
    monitor.log('initial_response', result);

    // Wait for WebSocket updates
    console.log('\n⏳ Monitoring AI thought process...');
    await wsPromise;

    // Save the analysis
    const analysis = await monitor.save();

    // Print summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 Scenario Summary');
    console.log('='.repeat(70));
    console.log(`Workflow ID: ${workflowId}`);
    console.log(`AI Thoughts Captured: ${analysis.aiThoughts.length}`);
    console.log(`Phases Observed: ${analysis.summary.phases.join(', ')}`);
    console.log(`Test Plan Generated: ${analysis.summary.hasTestPlan ? 'Yes' : 'No'}`);
    
    if (analysis.testPlan) {
      console.log('\n🎯 First Step Details:');
      const firstStep = analysis.testPlan.steps?.[0] || analysis.testPlan.recommendations?.[0];
      if (firstStep) {
        console.log(`  Tool: ${firstStep.tool || firstStep.name}`);
        console.log(`  Purpose: ${firstStep.purpose || firstStep.description}`);
        console.log(`  Priority: ${firstStep.priority || 'Not specified'}`);
      }
    }

    return analysis;

  } catch (error) {
    console.error('❌ Scenario failed:', error);
    monitor.log('error', { message: error.message, stack: error.stack });
    await monitor.save();
    throw error;
  }
}

// Main execution
async function main() {
  console.log('🚀 AI Incremental Test Runner');
  console.log('=' .repeat(70));
  
  // Create output directory
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  // Parse command line arguments
  const args = process.argv.slice(2);
  const scenarioId = args.find(a => a.startsWith('--scenario='))?.split('=')[1];
  const runAll = args.includes('--all');

  let scenarios = TEST_SCENARIOS;
  
  if (scenarioId) {
    scenarios = scenarios.filter(s => s.id === scenarioId);
    if (scenarios.length === 0) {
      console.error(`❌ Scenario '${scenarioId}' not found`);
      console.log('Available scenarios:', TEST_SCENARIOS.map(s => s.id).join(', '));
      process.exit(1);
    }
  } else if (!runAll) {
    // Default to first scenario
    scenarios = [scenarios[0]];
  }

  const results = [];
  
  for (const scenario of scenarios) {
    try {
      const result = await runScenario(scenario);
      results.push({
        scenario: scenario.id,
        success: true,
        result
      });
      
      // Wait between scenarios
      if (scenarios.length > 1) {
        console.log('\n⏳ Waiting 5 seconds before next scenario...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      results.push({
        scenario: scenario.id,
        success: false,
        error: error.message
      });
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(70));
  console.log('📈 Final Results');
  console.log('='.repeat(70));
  
  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    console.log(`${status} ${r.scenario}: ${r.success ? 'Completed' : r.error}`);
  });

  // Save combined results
  const summaryFile = path.join(CONFIG.outputDir, `test-summary-${Date.now()}.json`);
  fs.writeFileSync(summaryFile, JSON.stringify(results, null, 2));
  console.log(`\n📁 Summary saved to: ${summaryFile}`);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export { runScenario, AIMonitor, TEST_SCENARIOS };