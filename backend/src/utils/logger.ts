import winston from 'winston';
import path from 'path';

// Use a different variable name to avoid conflicts in CommonJS
const logDir = path.resolve();

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

// Format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.uncolorize(),
  winston.format.json()
);

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logDir, '../../logs/app.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    // File transport for errors only
    new winston.transports.File({
      filename: path.join(logDir, '../../logs/error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
  ],
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/exceptions.log'),
      format: fileFormat,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/rejections.log'),
      format: fileFormat,
    }),
  ],
});

// Create child loggers for different modules
export function createLogger(module: string) {
  return logger.child({ module });
}

// Export default logger
export default logger;

// Utility functions for structured logging
export function logWorkflowStart(workflowId: string, input: any) {
  logger.info('Workflow started', {
    workflowId,
    input,
    event: 'workflow_start',
  });
}

export function logWorkflowEnd(workflowId: string, duration: number, status: 'success' | 'failure', result?: any) {
  logger.info('Workflow completed', {
    workflowId,
    duration,
    status,
    result,
    event: 'workflow_end',
  });
}

export function logAttackExecution(workflowId: string, attackId: string, tool: string, status: 'start' | 'end', details?: any) {
  logger.info('Attack execution', {
    workflowId,
    attackId,
    tool,
    status,
    details,
    event: 'attack_execution',
  });
}

export function logSecurityFinding(workflowId: string, attackId: string, severity: string, finding: any) {
  logger.warn('Security finding detected', {
    workflowId,
    attackId,
    severity,
    finding,
    event: 'security_finding',
  });
}

export function logPerformanceMetric(metric: string, value: number, unit: string, metadata?: any) {
  logger.debug('Performance metric', {
    metric,
    value,
    unit,
    metadata,
    event: 'performance_metric',
  });
}

export function logEmbeddingQuery(table: string, queryVector: number[], resultCount: number, duration: number) {
  logger.info('Embedding similarity query', {
    table,
    vectorDimension: queryVector.length,
    resultCount,
    duration,
    event: 'embedding_query',
  });
}

export function logEmbeddingGeneration(text: string, model: string, cached: boolean, duration: number) {
  logger.info('Embedding generation', {
    textLength: text.length,
    model,
    cached,
    duration,
    event: 'embedding_generation',
  });
}

export function logRAGContext(prompt: string, contextCount: number, sources: any[], duration: number) {
  logger.info('RAG context retrieval', {
    promptLength: prompt.length,
    contextCount,
    sourcesFound: sources.length,
    avgSimilarity: sources.reduce((sum, s) => sum + (s.similarity || 0), 0) / sources.length || 0,
    duration,
    event: 'rag_context',
  });
}

export function logDatabaseOperation(operation: string, table: string, duration: number, rowCount?: number) {
  logger.debug('Database operation', {
    operation,
    table,
    duration,
    rowCount,
    event: 'database_operation',
  });
} 