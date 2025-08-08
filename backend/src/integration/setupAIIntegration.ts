/**
 * Setup script for integrating the new AI-driven architecture
 * This replaces the old template-based system with true AI reasoning
 */

import { config } from 'dotenv';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('AIIntegrationSetup');

export async function setupAIIntegration() {
  logger.info('Setting up AI integration for strategic security testing');
  
  // Load environment variables
  config();
  
  // Validate required environment variables
  const requiredEnvVars = [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'DATABASE_URL',
    'REDIS_URL'
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    logger.error('Missing required environment variables', { missing: missingVars });
    throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
  }
  
  // Environment variable template
  const envTemplate = `
# AI Service Configuration
ANTHROPIC_API_KEY=your-anthropic-api-key
ANTHROPIC_MODEL=claude-3-opus-20240229
OPENAI_API_KEY=your-openai-api-key

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/restraint
REDIS_URL=redis://localhost:6379

# Notification Configuration
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/YOUR/WEBHOOK/URL

# Security Configuration
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-encryption-key

# Docker Configuration
DOCKER_HOST=unix:///var/run/docker.sock
DOCKER_NETWORK=restraint-network

# API Configuration
API_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000

# Monitoring Configuration
ENABLE_AI_MONITORING=true
AI_DECISION_LOG_PATH=./logs/ai-decisions
ENABLE_REAL_TIME_UPDATES=true
`;

  logger.info('Environment configuration template:', { template: envTemplate });
  
  // Create configuration summary
  const configSummary = {
    aiProvider: 'Anthropic Claude',
    embeddingProvider: 'OpenAI',
    database: 'PostgreSQL with pgvector',
    cache: 'Redis',
    containerRuntime: 'Docker',
    features: {
      strategicAI: true,
      progressiveDiscovery: true,
      dynamicTestTrees: true,
      enhancedRestraints: true,
      aiDecisionAudit: true,
      hitlApprovals: true,
      realtimeUpdates: true,
      owaspAlignment: true,
      soc2Compliance: true
    }
  };
  
  logger.info('AI Integration Configuration', configSummary);
  
  // Migration steps
  const migrationSteps = [
    {
      step: 1,
      name: 'Update Environment Variables',
      description: 'Add Anthropic API key and update configuration',
      command: 'cp .env.example .env && vim .env'
    },
    {
      step: 2,
      name: 'Install Dependencies',
      description: 'Install new AI and monitoring dependencies',
      command: 'npm install @anthropic-ai/sdk dockerode ws axios'
    },
    {
      step: 3,
      name: 'Update Docker Images',
      description: 'Pull required security testing Docker images',
      command: `docker pull projectdiscovery/subfinder:latest && \
docker pull instrumentisto/nmap:latest && \
docker pull ghcr.io/owasp/zap:stable && \
docker pull ghcr.io/sqlmapproject/sqlmap:latest`
    },
    {
      step: 4,
      name: 'Update Backend Index',
      description: 'Replace old index.ts with new AI-integrated version',
      command: 'mv backend/src/index.ts backend/src/index.old.ts'
    },
    {
      step: 5,
      name: 'Update Frontend Dashboard',
      description: 'Integrate WebSocket real-time updates',
      command: 'Update Dashboard.tsx to use EnhancedWebSocketManager'
    },
    {
      step: 6,
      name: 'Run Database Migrations',
      description: 'Add AI decision audit tables',
      command: 'npm run db:migrate'
    },
    {
      step: 7,
      name: 'Test AI Integration',
      description: 'Run sweetspot scenario test',
      command: 'npm run test:sweetspot'
    }
  ];
  
  logger.info('Migration steps to implement AI integration:');
  for (const step of migrationSteps) {
    logger.info(`Step ${step.step}: ${step.name}`, {
      description: step.description,
      command: step.command
    });
  }
  
  // Key differences from old system
  const improvements = {
    oldSystem: {
      approach: 'Template-based matching',
      decisions: 'Static, pre-defined',
      tests: 'Fixed tool selection',
      adaptation: 'None',
      reasoning: 'Embedding similarity only'
    },
    newSystem: {
      approach: 'AI-driven strategic planning',
      decisions: 'Dynamic, context-aware',
      tests: 'Progressive discovery based on findings',
      adaptation: 'Real-time strategy adjustment',
      reasoning: 'Claude-powered analysis with explanations'
    }
  };
  
  logger.info('System improvements:', improvements);
  
  return {
    status: 'ready',
    configSummary,
    migrationSteps,
    improvements
  };
}

// Example usage for the new system
export async function demonstrateAICapabilities() {
  logger.info('Demonstrating AI capabilities');
  
  const exampleScenarios = [
    {
      name: 'Subdomain Discovery → API Testing',
      flow: `
1. AI receives: "Test sweetspotgov.com for API vulnerabilities"
2. AI decides: Start with subdomain enumeration
3. Finds: api.sweetspotgov.com, console.sweetspotgov.com
4. AI adapts: "Found API subdomain, switching to API-specific tests"
5. Executes: API discovery, JWT analysis, endpoint fuzzing
6. AI reasons: "JWT tokens detected, testing for algorithm confusion"
      `
    },
    {
      name: 'Progressive SQL Injection Testing',
      flow: `
1. AI receives: "Check for SQL injection"
2. AI decides: First identify all forms and parameters
3. Finds: Login form, search box, API parameters
4. AI adapts: "Multiple injection points found, prioritizing based on risk"
5. Executes: Safe payload testing with restraints
6. AI reasons: "Login form shows error-based responses, focusing efforts there"
      `
    },
    {
      name: 'Intelligent Restraint Application',
      flow: `
1. AI receives: "Full security test on production"
2. AI recognizes: Production environment requires extra care
3. Applies: Rate limiting, read-only tests, approval requirements
4. Requests: HITL approval for authentication testing
5. AI explains: "Production system detected, applying safety measures"
      `
    }
  ];
  
  for (const scenario of exampleScenarios) {
    logger.info(`Scenario: ${scenario.name}`, { flow: scenario.flow });
  }
  
  return exampleScenarios;
}

// Run setup if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupAIIntegration()
    .then(result => {
      logger.info('AI integration setup complete', result);
      return demonstrateAICapabilities();
    })
    .then(scenarios => {
      logger.info('AI capability demonstration complete');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Setup failed', { error });
      process.exit(1);
    });
}