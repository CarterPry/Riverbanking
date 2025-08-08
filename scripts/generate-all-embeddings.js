#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

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

// Import attacks from the backend
const attacksModule = require('../backend/dist/compliance/mappings/attack-mapping.js');
const attacks = attacksModule.attacks;

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
      await new Promise(resolve => setTimeout(resolve, 100));
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