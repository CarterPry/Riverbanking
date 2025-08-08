#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Define all attacks inline (matching attack-mapping.ts)
const attacks = [
  { id: 'broken-access-control', name: 'Broken Access Control', description: 'Tests for access control violations, privilege escalation, and unauthorized data access' },
  { id: 'crypto-failures', name: 'Cryptographic Failures', description: 'Tests for weak encryption, exposed sensitive data, and improper crypto implementation' },
  { id: 'sql-injection', name: 'SQL Injection', description: 'Tests for SQL injection vulnerabilities in application inputs and parameters' },
  { id: 'blind-sql-injection', name: 'Blind SQL Injection', description: 'Injects SQL to infer data via true/false responses; common post-login in queries' },
  { id: 'xpath-injection', name: 'XPath Injection', description: 'Tests for XPath injection in XML-based applications' },
  { id: 'insecure-design', name: 'Insecure Design', description: 'Tests for flaws in design patterns, threat modeling gaps, and business logic errors' },
  { id: 'security-misconfig', name: 'Security Misconfiguration', description: 'Tests for misconfigurations in servers, frameworks, databases, and applications' },
  { id: 'vulnerable-components', name: 'Vulnerable and Outdated Components', description: 'Scans for known vulnerabilities in third-party libraries and frameworks' },
  { id: 'auth-failures', name: 'Authentication Failures', description: 'Tests for weak authentication mechanisms, credential stuffing, and session management issues' },
  { id: 'integrity-failures', name: 'Software and Data Integrity Failures', description: 'Tests for insecure deserialization, CI/CD pipeline vulnerabilities, and update mechanism flaws' },
  { id: 'logging-failures', name: 'Security Logging and Monitoring Failures', description: 'Tests for insufficient logging, monitoring, and incident response capabilities' },
  { id: 'ssrf', name: 'Server-Side Request Forgery (SSRF)', description: 'Tests for SSRF vulnerabilities allowing internal network access' },
  { id: 'xss', name: 'Cross-Site Scripting (XSS)', description: 'Tests for reflected, stored, and DOM-based XSS vulnerabilities' },
  { id: 'csrf', name: 'Cross-Site Request Forgery (CSRF)', description: 'Tests for CSRF vulnerabilities in state-changing operations' },
  { id: 'clickjacking', name: 'Clickjacking', description: 'Tests for UI redress attacks and frame-based vulnerabilities' },
  { id: 'parameter-tampering', name: 'Parameter Tampering', description: 'Tests for manipulation of parameters in requests, cookies, and hidden fields' },
  { id: 'cors-misconfig', name: 'CORS Misconfiguration', description: 'Tests for overly permissive CORS policies allowing unauthorized cross-origin access' },
  { id: 'port-scanning', name: 'Port Scanning', description: 'Identifies open ports and running services on the target system' },
  { id: 'ip-spoofing', name: 'IP Spoofing', description: 'Tests for vulnerabilities to IP spoofing attacks' }
];

// Load existing embeddings
const embeddingsPath = path.join(__dirname, '..', 'embeddings.json');
let embeddingsData = {
  metadata: {
    generated_at: new Date().toISOString(),
    model: "text-embedding-ada-002",
    total_patterns: 0,
    api_url: "https://api.openai.com/v1/embeddings"
  },
  attack_patterns: {}
};

// Try to load existing embeddings
if (fs.existsSync(embeddingsPath)) {
  const existing = JSON.parse(fs.readFileSync(embeddingsPath, 'utf-8'));
  if (existing.attack_patterns) {
    embeddingsData.attack_patterns = existing.attack_patterns;
  }
}

console.log(`Found ${attacks.length} attacks to process`);
console.log(`Existing embeddings: ${Object.keys(embeddingsData.attack_patterns).length}`);

async function generateEmbedding(text) {
  try {
    const response = await axios.post(
      process.env.EMBEDDING_API_URL,
      {
        input: text,
        model: 'text-embedding-ada-002'
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error.response?.data || error.message);
    throw error;
  }
}

async function main() {
  console.log('Generating embeddings for all attacks...\n');
  
  let generated = 0;
  let skipped = 0;
  
  for (const attack of attacks) {
    if (embeddingsData.attack_patterns[attack.id]) {
      console.log(`✓ Skipping ${attack.id} (already exists)`);
      skipped++;
      continue;
    }
    
    console.log(`Generating embedding for: ${attack.id}...`);
    const text = `${attack.name}: ${attack.description}`;
    
    try {
      const embedding = await generateEmbedding(text);
      embeddingsData.attack_patterns[attack.id] = {
        text: text,
        embedding: embedding
      };
      generated++;
      console.log(`✓ Generated embedding for ${attack.id}`);
      
      // Add a small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`✗ Failed to generate embedding for ${attack.id}:`, error.message);
      process.exit(1);
    }
  }
  
  // Update metadata
  embeddingsData.metadata.total_patterns = Object.keys(embeddingsData.attack_patterns).length;
  embeddingsData.metadata.generated_at = new Date().toISOString();
  
  // Save embeddings
  fs.writeFileSync(embeddingsPath, JSON.stringify(embeddingsData, null, 2));
  
  console.log(`\n✅ Complete!`);
  console.log(`Generated: ${generated} embeddings`);
  console.log(`Skipped: ${skipped} embeddings`);
  console.log(`Total: ${embeddingsData.metadata.total_patterns} embeddings`);
  console.log(`Saved to: ${embeddingsPath}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});