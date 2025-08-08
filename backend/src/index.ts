import express from 'express';
import cors from 'cors';
import http from 'http';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './utils/logger.js';
import { setupDatabase } from './utils/database.js';

// New AI-integrated components
import { AIOrchestrator } from './orchestration/aiOrchestrator.js';
import { EnhancedWebSocketManager } from './websocket/enhancedWebSocketManager.js';
import { AIAgentEnhanced } from './layers/aiAgentEnhanced.js';
import { AIDecisionLogger } from './audit/aiDecisionLogger.js';
import { HITLApprovalSystem } from './approval/hitlApprovalSystem.js';

// Legacy components (to be phased out)
// import workflowRoutes from './api/routes/workflowRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, '../../.env') });

const logger = createLogger('Server');
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    mode: 'ai-integrated',
    features: {
      strategicAI: true,
      progressiveDiscovery: true,
      realtimeUpdates: true,
      aiDecisionAudit: true
    }
  });
});

// Initialize AI-integrated system
async function initializeAISystem() {
  logger.info('Initializing AI-integrated security testing platform');
  
  try {
    // Setup database
    await setupDatabase();
    
    // Initialize WebSocket manager
    const wsManager = new EnhancedWebSocketManager(server, { path: '/ws' });
    
    // Initialize AI orchestrator
    const orchestrator = new AIOrchestrator(wsManager);
    
    // Initialize decision logger
    const decisionLogger = new AIDecisionLogger({
      persistPath: './logs/ai-decisions',
      realTimeMode: true,
      complianceMode: true
    });
    
    // Initialize approval system
    const approvalSystem = new HITLApprovalSystem();
    
    // Initialize enhanced AI agent
    const aiAgent = new AIAgentEnhanced(decisionLogger);
    
    // API Routes for AI-integrated workflow
    app.post('/api/v2/workflow/execute', async (req, res) => {
      try {
        const { target, userIntent, constraints } = req.body;
        
        if (!target || !userIntent) {
          return res.status(400).json({
            error: 'Missing required fields: target and userIntent'
          });
        }
        
        logger.info('Executing AI-driven workflow', { target, userIntent });
        
        // Execute workflow
        const result = await orchestrator.executeWorkflow({
          target,
          userIntent,
          constraints
        });
        
        res.json({
          success: true,
          result
        });
        
      } catch (error) {
        logger.error('Workflow execution failed', { error });
        res.status(500).json({
          error: 'Workflow execution failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
    
    // Get workflow status
    app.get('/api/v2/workflow/:workflowId/status', (req, res) => {
      const status = orchestrator.getWorkflowStatus(req.params.workflowId);
      
      if (!status) {
        return res.status(404).json({ error: 'Workflow not found' });
      }
      
      res.json(status);
    });
    
    // Abort workflow
    app.post('/api/v2/workflow/:workflowId/abort', async (req, res) => {
      try {
        await orchestrator.abortWorkflow(req.params.workflowId);
        res.json({ success: true });
      } catch (error) {
        res.status(404).json({ 
          error: error instanceof Error ? error.message : 'Workflow not found' 
        });
      }
    });
    
    // Process approval
    app.post('/api/v2/approval/:approvalId/process', async (req, res) => {
      try {
        const { approved, approver, reason } = req.body;
        
        await approvalSystem.processApproval(req.params.approvalId, {
          approved,
          approver,
          reason
        });
        
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Invalid approval'
        });
      }
    });
    
    // Get AI decision audit
    app.get('/api/v2/workflow/:workflowId/audit', async (req, res) => {
      try {
        const audit = await decisionLogger.generateAuditReport(req.params.workflowId);
        res.json(audit);
      } catch (error) {
        res.status(404).json({ error: 'Audit not found' });
      }
    });
    
    // Get pending approvals
    app.get('/api/v2/approvals/pending', (req, res) => {
      const pending = approvalSystem.getPendingApprovals();
      res.json(pending);
    });
    
    // WebSocket endpoint for real-time updates is handled by wsManager at /ws
    
    // Legacy routes (kept for backward compatibility)
    // app.use('/api/workflows', workflowRoutes);
    
    logger.info('AI-integrated system initialized successfully');
    
    return {
      orchestrator,
      wsManager,
      decisionLogger,
      approvalSystem,
      aiAgent
    };
    
  } catch (error) {
    logger.error('Failed to initialize AI system', { 
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : String(error)
    });
    throw error;
  }
}

// Start server
async function startServer() {
  try {
    // Initialize AI system
    const aiSystem = await initializeAISystem();
    
    const PORT = process.env.PORT || 3001;
    
    server.listen(PORT, () => {
      logger.info(`AI-integrated security testing platform running on port ${PORT}`);
      logger.info('Key features enabled:', {
        strategicAI: 'Anthropic Claude for decision making',
        embeddings: 'OpenAI for semantic search',
        progressiveDiscovery: 'Dynamic phase-based testing',
        realTimeUpdates: 'WebSocket dashboard integration',
        aiAudit: 'Complete decision tracking and compliance',
        approvals: 'HITL system for critical operations'
      });
    });
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      
      // Close WebSocket connections
      if (aiSystem.wsManager) {
        aiSystem.wsManager.shutdown();
      }
      
      // Close server
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
    
  } catch (error) {
    logger.error('Failed to start server', { 
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : String(error)
    });
    process.exit(1);
  }
}

// Start the server
startServer();

export default app;