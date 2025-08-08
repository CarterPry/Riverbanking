#!/usr/bin/env node

const fs = require('fs');
const { spawn } = require('child_process');
const axios = require('axios');
const colors = require('colors');

// Configuration
const API_BASE = 'http://localhost:3000';
const LOG_FILE = './backend/logs/app.log';

console.log('🧠 AI Communication Monitor - Real-Time'.green.bold);
console.log('=' .repeat(50));
console.log('');

// Monitor log file
const tailProcess = spawn('tail', ['-f', LOG_FILE]);

let currentWorkflowId = null;
let aiCommunicationData = {};

tailProcess.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  
  lines.forEach(line => {
    if (!line.trim()) return;
    
    try {
      const log = JSON.parse(line);
      
      // Track workflow start
      if (log.message?.includes('Creating new workflow')) {
        currentWorkflowId = log.workflowId;
        console.log(`\n📋 NEW WORKFLOW STARTED: ${currentWorkflowId}`.cyan.bold);
        aiCommunicationData[currentWorkflowId] = {
          startTime: new Date(),
          phases: {}
        };
      }
      
      // Intent Classification
      if (log.module === 'IntentClassifier') {
        console.log('\n🧠 INTENT CLASSIFICATION:'.yellow.bold);
        
        if (log.message?.includes('Classifying user input')) {
          console.log(`Input: "${log.userInput || 'N/A'}"`.gray);
          if (aiCommunicationData[currentWorkflowId]) {
            aiCommunicationData[currentWorkflowId].userInput = log.userInput;
          }
        }
        
        if (log.message?.includes('similarity scores')) {
          console.log('Similarity Analysis:'.yellow);
          const scores = log.scores || {};
          Object.entries(scores).forEach(([attack, score]) => {
            const bar = '█'.repeat(Math.round(score * 20));
            console.log(`  ${attack.padEnd(25)} ${bar} ${(score * 100).toFixed(1)}%`);
          });
        }
        
        if (log.message?.includes('Top matches')) {
          console.log('Top Matches:'.green);
          const matches = log.topMatches || [];
          matches.forEach((match, i) => {
            console.log(`  ${i + 1}. ${match.type} (${(match.score * 100).toFixed(1)}%)`);
          });
        }
        
        if (log.message?.includes('Final classification')) {
          console.log('Classification Result:'.green.bold);
          console.log(`  Confidence: ${log.confidence || 'N/A'}`.green);
          console.log(`  Attacks: ${log.attackCount || 0}`.green);
        }
      }
      
      // Context Enrichment
      if (log.module === 'ContextEnrichment') {
        console.log('\n🔍 CONTEXT ENRICHMENT:'.magenta.bold);
        
        if (log.message?.includes('Enriching context')) {
          console.log(`Processing ${log.attackCount || 0} attacks`.gray);
        }
        
        if (log.message?.includes('Categorized attacks')) {
          console.log('Attack Categories:'.magenta);
          const categories = log.categories || {};
          Object.entries(categories).forEach(([category, count]) => {
            console.log(`  ${category}: ${count} attacks`);
          });
        }
        
        if (log.message?.includes('Generated RAG context')) {
          console.log(`RAG Context: ${log.contextLength || 0} items`.gray);
        }
      }
      
      // Trust Classifier
      if (log.module === 'TrustClassifier') {
        console.log('\n🛡️ TRUST CLASSIFICATION:'.blue.bold);
        
        if (log.riskScore !== undefined) {
          const riskBar = '█'.repeat(Math.round(log.riskScore / 5));
          console.log(`Risk Score: ${riskBar} ${log.riskScore}/100`.blue);
        }
        
        if (log.trustLevel) {
          console.log(`Trust Level: ${log.trustLevel}`.blue);
        }
      }
      
      // HITL Review
      if (log.module === 'HITLReview') {
        console.log('\n👤 HITL REVIEW:'.cyan.bold);
        
        if (log.requiresReview !== undefined) {
          console.log(`Requires Review: ${log.requiresReview ? 'YES' : 'NO'}`.cyan);
          if (log.reasons) {
            console.log('Reasons:'.cyan);
            log.reasons.forEach(reason => console.log(`  - ${reason}`));
          }
        }
      }
      
      // Attack Execution
      if (log.message?.includes('Executing attack')) {
        console.log('\n⚡ EXECUTING ATTACK:'.red.bold);
        console.log(`Tool: ${log.tool || 'N/A'}`.red);
        console.log(`Target: ${log.target || 'N/A'}`.red);
        console.log(`Attack Type: ${log.attackType || 'N/A'}`.red);
      }
      
      // Embedding calls
      if (log.message?.includes('Getting embedding for text')) {
        console.log('\n🔢 EMBEDDING REQUEST:'.green);
        console.log(`Text: "${log.text?.substring(0, 100)}..."`.gray);
      }
      
      // WebSocket broadcasts
      if (log.message?.includes('Broadcasting to workflow')) {
        const msg = log.message;
        if (msg.type === 'classification:progress' || msg.type === 'enrichment:progress') {
          console.log(`\n📡 Progress Update: ${msg.data?.progress || 0}% - ${msg.data?.message || ''}`.green);
        }
      }
      
    } catch (e) {
      // Not JSON, might be plain text log
      if (line.includes('classification') || line.includes('enrichment') || line.includes('embedding')) {
        console.log(`📝 ${line}`.gray);
      }
    }
  });
});

// Function to fetch and display workflow AI data
async function fetchWorkflowAIData(workflowId) {
  try {
    const response = await axios.get(`${API_BASE}/debug/ai-communication/${workflowId}`);
    console.log('\n📊 WORKFLOW AI SUMMARY:'.yellow.bold);
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log(`Failed to fetch AI data: ${error.message}`.red);
  }
}

// Listen for user input to fetch specific workflow data
process.stdin.on('data', async (data) => {
  const input = data.toString().trim();
  
  if (input.startsWith('workflow ')) {
    const workflowId = input.split(' ')[1];
    await fetchWorkflowAIData(workflowId);
  } else if (input === 'help') {
    console.log('\nCommands:'.yellow);
    console.log('  workflow <id> - Fetch AI communication data for a workflow');
    console.log('  help - Show this help message');
    console.log('  exit - Exit the monitor');
  } else if (input === 'exit') {
    process.exit(0);
  }
});

console.log('Type "help" for commands'.gray);
console.log('Monitoring AI communication...'.green);

// Handle exit
process.on('SIGINT', () => {
  console.log('\n\nExiting AI monitor...'.yellow);
  tailProcess.kill();
  process.exit(0);
});