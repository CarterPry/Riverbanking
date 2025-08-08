#!/bin/bash

# Script to enable verbose AI communication logging
# This modifies the logger configuration to capture detailed AI interactions

echo "Enabling verbose AI communication logging..."

# Create a logger configuration patch
cat > backend/src/utils/ai-logger-extension.ts << 'EOF'
// AI Communication Logger Extension
import { createLogger } from './logger.js';

const aiLogger = createLogger('AI-Communication');

// Intercept and log all AI-related communications
export function logAIRequest(component: string, request: any) {
  aiLogger.info('AI Request', {
    component,
    timestamp: new Date().toISOString(),
    request: {
      type: request.type || 'unknown',
      input: request.input || request.prompt || request.text,
      parameters: request.parameters || {},
      context: request.context || {}
    },
    event: 'ai_request'
  });
}

export function logAIResponse(component: string, response: any, duration: number) {
  aiLogger.info('AI Response', {
    component,
    timestamp: new Date().toISOString(),
    response: {
      type: response.type || 'unknown',
      output: response.output || response.response || response.embedding,
      confidence: response.confidence,
      metadata: response.metadata || {}
    },
    duration,
    event: 'ai_response'
  });
}

export function logAIError(component: string, error: any, context: any) {
  aiLogger.error('AI Error', {
    component,
    timestamp: new Date().toISOString(),
    error: {
      message: error.message,
      code: error.code,
      stack: error.stack
    },
    context,
    event: 'ai_error'
  });
}

// Middleware to intercept axios requests to AI services
export function createAIRequestInterceptor(axios: any) {
  // Request interceptor
  axios.interceptors.request.use(
    (config: any) => {
      if (config.url?.includes('embeddings') || config.url?.includes('completions')) {
        logAIRequest('http-client', {
          type: 'api-call',
          url: config.url,
          method: config.method,
          input: config.data
        });
      }
      return config;
    },
    (error: any) => {
      logAIError('http-client', error, { phase: 'request' });
      return Promise.reject(error);
    }
  );

  // Response interceptor
  axios.interceptors.response.use(
    (response: any) => {
      if (response.config.url?.includes('embeddings') || response.config.url?.includes('completions')) {
        logAIResponse('http-client', {
          type: 'api-response',
          status: response.status,
          output: response.data
        }, response.config.metadata?.startTime ? Date.now() - response.config.metadata.startTime : 0);
      }
      return response;
    },
    (error: any) => {
      if (error.config?.url?.includes('embeddings') || error.config?.url?.includes('completions')) {
        logAIError('http-client', error, { 
          phase: 'response',
          url: error.config.url,
          status: error.response?.status 
        });
      }
      return Promise.reject(error);
    }
  );
}
EOF

# Create an environment variable update script
cat > set-ai-debug-env.sh << 'EOF'
#!/bin/bash
# Set environment variables for verbose AI logging

export LOG_LEVEL=debug
export AI_DEBUG=true
export LOG_AI_REQUESTS=true
export LOG_AI_RESPONSES=true
export LOG_EMBEDDING_DETAILS=true

echo "AI debug logging environment variables set:"
echo "  LOG_LEVEL=debug"
echo "  AI_DEBUG=true"
echo "  LOG_AI_REQUESTS=true"
echo "  LOG_AI_RESPONSES=true"
echo "  LOG_EMBEDDING_DETAILS=true"
echo ""
echo "Now start the backend with: npm run dev"
EOF

chmod +x set-ai-debug-env.sh

# Create a detailed logging configuration
cat > backend/logs/ai-debug-config.json << 'EOF'
{
  "aiLogging": {
    "enabled": true,
    "logRequests": true,
    "logResponses": true,
    "logEmbeddings": true,
    "logClassifications": true,
    "logWorkflowDecisions": true,
    "includeFullContext": true,
    "components": {
      "embeddingService": {
        "logApiCalls": true,
        "logCacheHits": true,
        "logGenerationTime": true,
        "logFullText": true
      },
      "intentClassifier": {
        "logInputProcessing": true,
        "logSimilarityScores": true,
        "logMatchingProcess": true,
        "logEntityExtraction": true
      },
      "aiAgent": {
        "logPromptBuilding": true,
        "logLLMCalls": true,
        "logResponseProcessing": true
      },
      "contextEnrichment": {
        "logGroundingProcess": true,
        "logContextBuilding": true
      }
    }
  }
}
EOF

echo "✅ AI debug logging configuration created!"
echo ""
echo "To enable verbose AI logging:"
echo "1. Source the environment variables: source ./set-ai-debug-env.sh"
echo "2. Start the backend: cd backend && npm run dev"
echo "3. Run the AI monitor: ./monitor-ai-communication.sh"
echo ""
echo "The following files have been created:"
echo "  - backend/src/utils/ai-logger-extension.ts (AI logging utilities)"
echo "  - set-ai-debug-env.sh (Environment variable setter)"
echo "  - backend/logs/ai-debug-config.json (Detailed logging config)"