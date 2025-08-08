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
