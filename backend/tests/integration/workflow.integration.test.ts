import request from 'supertest';
import express from 'express';
import { WorkflowController } from '../../src/api/controllers/workflowController.js';
import { createWorkflowRoutes, createPublicRoutes } from '../../src/api/routes/workflowRoutes.js';

describe('Workflow API Integration Tests', () => {
  let app: express.Application;
  let controller: WorkflowController;

  beforeAll(async () => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.MOCK_DOCKER = 'true';
    process.env.JWT_SECRET = 'test-secret';

    // Create Express app
    app = express();
    app.use(express.json());

    // Initialize controller and routes
    controller = new WorkflowController();
    await controller.initialize();

    app.use('/api', createPublicRoutes());
    app.use('/api', createWorkflowRoutes(controller));
  });

  afterAll(async () => {
    await controller.cleanup();
  });

  describe('POST /api/run-soc2-workflow', () => {
    it('should accept a valid workflow request', async () => {
      const response = await request(app)
        .post('/api/run-soc2-workflow')
        .send({
          target: 'https://example.com',
          scope: 'security',
          description: 'Test security scan'
        });

      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('workflowId');
      expect(response.body).toHaveProperty('status', 'accepted');
      expect(response.body).toHaveProperty('message', 'Workflow started successfully');
      expect(response.body).toHaveProperty('estimatedDuration');
      expect(response.body).toHaveProperty('monitoringUrl');
    });

    it('should reject invalid target URLs', async () => {
      const response = await request(app)
        .post('/api/run-soc2-workflow')
        .send({
          target: 'not-a-valid-url',
          scope: 'security'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid request');
      expect(response.body).toHaveProperty('details');
    });

    it('should accept IP addresses as targets', async () => {
      const response = await request(app)
        .post('/api/run-soc2-workflow')
        .send({
          target: '192.168.1.1',
          scope: 'comprehensive'
        });

      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('workflowId');
    });
  });

  describe('GET /api/workflows/:workflowId/status', () => {
    let workflowId: string;

    beforeEach(async () => {
      // Start a workflow first
      const response = await request(app)
        .post('/api/run-soc2-workflow')
        .send({
          target: 'https://test.example.com'
        });
      
      workflowId = response.body.workflowId;
    });

    it('should return workflow status', async () => {
      const response = await request(app)
        .get(`/api/workflows/${workflowId}/status`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('workflowId', workflowId);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('startTime');
      expect(response.body).toHaveProperty('duration');
      expect(response.body).toHaveProperty('progress');
    });

    it('should return 404 for non-existent workflow', async () => {
      const response = await request(app)
        .get('/api/workflows/non-existent-id/status');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Workflow not found');
    });
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('services');
      expect(response.body.services).toHaveProperty('mcpServer', 'active');
    });
  });

  describe('GET /api/docs', () => {
    it('should return API documentation', async () => {
      const response = await request(app)
        .get('/api/docs');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('endpoints');
      expect(response.body.endpoints).toHaveProperty('POST /api/run-soc2-workflow');
    });
  });

  describe('GET /api/status', () => {
    it('should return API status', async () => {
      const response = await request(app)
        .get('/api/status');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'operational');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
    });
  });
}); 