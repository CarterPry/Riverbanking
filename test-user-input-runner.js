#!/usr/bin/env node

/**
 * Test User Input Runner
 * This script demonstrates how to programmatically submit test cases to the security testing platform
 */

import axios from 'axios';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testInputs = JSON.parse(readFileSync(join(__dirname, 'test-user-inputs.json'), 'utf-8'));

// Configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000/api';
const DELAY_BETWEEN_TESTS = 2000; // 2 seconds between tests

// Helper function to create the API payload
function createWorkflowPayload(testInput) {
  const payload = {
    target: testInput.target,
    scope: testInput.scope,
    description: testInput.description,
    template: `security-${testInput.testType}`
  };

  // Add authentication if provided
  if (testInput.username && testInput.password) {
    payload.auth = {
      username: testInput.username,
      password: testInput.password
    };
  }

  return payload;
}

// Function to run a single test
async function runTest(scenario) {
  console.log(`\n🔍 Running: ${scenario.scenario}`);
  console.log(`📝 Description: ${scenario.description}`);
  
  try {
    const payload = createWorkflowPayload(scenario.input);
    console.log('📤 Payload:', JSON.stringify(payload, null, 2));
    
    const response = await axios.post(`${API_BASE_URL}/run-soc2-workflow`, payload);
    
    console.log('✅ Success! Workflow ID:', response.data.workflowId);
    console.log('📊 Status:', response.data.status);
    
    return {
      success: true,
      workflowId: response.data.workflowId,
      scenario: scenario.scenario
    };
  } catch (error) {
    console.error('❌ Error:', error.response?.data?.error || error.message);
    
    return {
      success: false,
      error: error.response?.data?.error || error.message,
      scenario: scenario.scenario
    };
  }
}

// Function to check workflow status
async function checkWorkflowStatus(workflowId) {
  try {
    const response = await axios.get(`${API_BASE_URL}/workflows/${workflowId}/status`);
    return response.data;
  } catch (error) {
    console.error('Error checking status:', error.message);
    return null;
  }
}

// Main execution function
async function runAllTests() {
  console.log('🚀 Starting Security Platform Test Suite');
  console.log('=====================================\n');
  
  const results = {
    successful: [],
    failed: [],
    total: 0
  };

  // Run regular test scenarios
  console.log('📋 Running Test Scenarios...');
  for (const scenario of testInputs.test_scenarios) {
    const result = await runTest(scenario);
    results.total++;
    
    if (result.success) {
      results.successful.push(result);
    } else {
      results.failed.push(result);
    }
    
    // Wait between tests to avoid overwhelming the system
    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_TESTS));
  }

  // Run edge cases
  console.log('\n\n📋 Running Edge Cases...');
  for (const edgeCase of testInputs.edge_cases) {
    const result = await runTest(edgeCase);
    results.total++;
    
    if (result.success) {
      results.successful.push(result);
    } else {
      results.failed.push(result);
    }
    
    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_TESTS));
  }

  // Print summary
  console.log('\n\n📊 Test Summary');
  console.log('===============');
  console.log(`Total Tests: ${results.total}`);
  console.log(`✅ Successful: ${results.successful.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    console.log('\n❌ Failed Scenarios:');
    results.failed.forEach(failure => {
      console.log(`  - ${failure.scenario}: ${failure.error}`);
    });
  }
  
  if (results.successful.length > 0) {
    console.log('\n✅ Successful Workflows:');
    for (const success of results.successful) {
      console.log(`  - ${success.scenario}: ${success.workflowId}`);
      
      // Check status of successful workflows
      const status = await checkWorkflowStatus(success.workflowId);
      if (status) {
        console.log(`    Status: ${status.status}`);
      }
    }
  }
}

// Run a specific scenario by name
async function runSpecificScenario(scenarioName) {
  const allScenarios = [...testInputs.test_scenarios, ...testInputs.edge_cases];
  const scenario = allScenarios.find(s => s.scenario === scenarioName);
  
  if (!scenario) {
    console.error(`❌ Scenario "${scenarioName}" not found`);
    console.log('\nAvailable scenarios:');
    allScenarios.forEach(s => console.log(`  - ${s.scenario}`));
    return;
  }
  
  await runTest(scenario);
}

// Command line interface
const args = process.argv.slice(2);

if (args.length === 0) {
  // Run all tests
  runAllTests().catch(console.error);
} else if (args[0] === '--scenario' && args[1]) {
  // Run specific scenario
  runSpecificScenario(args[1]).catch(console.error);
} else if (args[0] === '--list') {
  // List all scenarios
  console.log('Available test scenarios:');
  console.log('\nRegular Scenarios:');
  testInputs.test_scenarios.forEach(s => {
    console.log(`  - ${s.scenario}: ${s.description}`);
  });
  console.log('\nEdge Cases:');
  testInputs.edge_cases.forEach(s => {
    console.log(`  - ${s.scenario}: ${s.description}`);
  });
} else {
  console.log('Usage:');
  console.log('  node test-user-input-runner.js              # Run all tests');
  console.log('  node test-user-input-runner.js --list       # List all scenarios');
  console.log('  node test-user-input-runner.js --scenario "Scenario Name"  # Run specific scenario');
}

export {
  createWorkflowPayload,
  runTest,
  checkWorkflowStatus
};