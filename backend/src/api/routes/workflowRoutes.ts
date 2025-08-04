import { Router } from 'express';
import { WorkflowController } from '../controllers/workflowController.js';
import { 
  createAuthMiddleware, 
  optionalAuth, 
  requirePermission,
  apiKeyAuth 
} from '../middleware/authMiddleware.js';
import { 
  createRateLimiter, 
  createWorkflowRateLimiter,
  createUserRateLimiter 
} from '../middleware/rateLimitMiddleware.js';

export function createWorkflowRoutes(controller: WorkflowController): Router {
  const router = Router();

  // Get auth configuration from environment
  const jwtSecret = process.env.JWT_SECRET || 'development-secret';
  const apiKeys = new Set((process.env.API_KEYS || '').split(',').filter(Boolean));
  
  // Create middleware instances
  const auth = createAuthMiddleware({ jwtSecret });
  const optAuth = optionalAuth({ jwtSecret });
  const apiKeyMiddleware = apiKeys.size > 0 ? apiKeyAuth(apiKeys) : null;
  
  // Rate limiters
  const generalLimiter = createRateLimiter();
  const workflowLimiter = createWorkflowRateLimiter();
  const userLimiter = createUserRateLimiter();

  /**
   * Health check endpoint
   * GET /api/health
   */
  router.get('/health', 
    controller.healthCheck.bind(controller)
  );

  /**
   * Main workflow endpoint
   * POST /api/run-soc2-workflow
   * 
   * Accepts either JWT authentication or API key
   */
  router.post('/run-soc2-workflow',
    generalLimiter,
    workflowLimiter,
    // Allow either JWT or API key authentication
    (req, res, next) => {
      const hasApiKey = req.headers['x-api-key'];
      const hasJwt = req.headers.authorization;
      
      if (hasApiKey && apiKeyMiddleware) {
        apiKeyMiddleware(req, res, next);
      } else if (hasJwt) {
        auth(req, res, next);
      } else {
        // For development/testing, allow unauthenticated access if no auth is configured
        if (process.env.NODE_ENV === 'development' && !apiKeys.size && jwtSecret === 'development-secret') {
          // Set a mock user for development
          req.user = {
            id: 'dev-user',
            email: 'dev@localhost',
            role: 'developer',
            permissions: ['workflow:run', 'workflow:read', 'workflow:cancel', 'queue:read']
          };
          next();
        } else {
          res.status(401).json({
            error: 'Authentication required',
            message: 'Please provide either a JWT token or API key'
          });
        }
      }
    },
    requirePermission('workflow:run'),
    controller.runWorkflow.bind(controller)
  );

  /**
   * Get workflow status
   * GET /api/workflows/:workflowId/status
   */
  router.get('/workflows/:workflowId/status',
    generalLimiter,
    optAuth, // Optional authentication for better rate limits
    controller.getWorkflowStatus.bind(controller)
  );

  /**
   * Cancel workflow
   * POST /api/workflows/:workflowId/cancel
   */
  router.post('/workflows/:workflowId/cancel',
    generalLimiter,
    auth,
    requirePermission('workflow:cancel'),
    controller.cancelWorkflow.bind(controller)
  );

  /**
   * Approve/Reject HITL workflow
   * POST /api/workflows/:workflowId/approve
   */
  router.post('/workflows/:workflowId/approve',
    generalLimiter,
    optAuth, // Allow both authenticated and unauthenticated for demo
    controller.approveWorkflow.bind(controller)
  );

  /**
   * List active workflows
   * GET /api/workflows
   */
  router.get('/workflows',
    generalLimiter,
    auth,
    requirePermission('workflow:read'),
    controller.listWorkflows.bind(controller)
  );

  /**
   * Get queue metrics
   * GET /api/queue/metrics
   */
  router.get('/queue/metrics',
    generalLimiter,
    auth,
    requirePermission('queue:read'),
    controller.getQueueMetrics.bind(controller)
  );

  // Error handling middleware
  router.use((err: any, req: any, res: any, next: any) => {
    console.error('Route error:', err);
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation Error',
        details: err.errors
      });
    }

    if (err.name === 'UnauthorizedError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: err.message
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
    });
  });

  return router;
}

/**
 * Create admin routes for management
 */
export function createAdminRoutes(controller: WorkflowController): Router {
  const router = Router();
  
  const jwtSecret = process.env.JWT_SECRET || 'development-secret';
  const auth = createAuthMiddleware({ jwtSecret });
  const strictLimiter = createRateLimiter({ max: 50 });

  // All admin routes require authentication and admin role
  router.use(auth);
  router.use(requirePermission('admin'));
  router.use(strictLimiter);

  /**
   * Force cleanup old workflows
   * POST /api/admin/cleanup
   */
  router.post('/cleanup', (req, res) => {
    controller.cleanupOldWorkflows();
    res.json({ message: 'Cleanup initiated' });
  });

  /**
   * Shutdown the service gracefully
   * POST /api/admin/shutdown
   */
  router.post('/shutdown', async (req, res) => {
    res.json({ message: 'Shutdown initiated' });
    
    // Give time for response to be sent
    setTimeout(async () => {
      await controller.cleanup();
      process.exit(0);
    }, 1000);
  });

  return router;
}

/**
 * Create public routes (no authentication required)
 */
export function createPublicRoutes(): Router {
  const router = Router();
  const limiter = createRateLimiter({ max: 50 });

  router.use(limiter);

  /**
   * API documentation
   * GET /api/docs
   */
  router.get('/docs', (req, res) => {
    res.json({
      version: '1.0.0',
      endpoints: {
        'POST /api/run-soc2-workflow': {
          description: 'Start a new SOC2 security testing workflow',
          authentication: 'JWT token or API key',
          body: {
            target: 'string (URL or IP)',
            scope: 'string (optional)',
            description: 'string (optional)',
            auth: {
              username: 'string (optional)',
              password: 'string (optional)',
              token: 'string (optional)'
            },
            options: {
              progressive: 'boolean (optional)',
              maxConcurrent: 'number (optional)',
              timeout: 'number (optional)'
            }
          }
        },
        'GET /api/workflows/:workflowId/status': {
          description: 'Get the status of a workflow',
          authentication: 'Optional'
        },
        'POST /api/workflows/:workflowId/cancel': {
          description: 'Cancel a running workflow',
          authentication: 'Required'
        },
        'GET /api/workflows': {
          description: 'List all active workflows',
          authentication: 'Required'
        },
        'GET /api/queue/metrics': {
          description: 'Get queue metrics and health status',
          authentication: 'Required'
        }
      }
    });
  });

  /**
   * API status
   * GET /api/status
   */
  router.get('/status', (req, res) => {
    res.json({
      status: 'operational',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0'
    });
  });

  return router;
} 