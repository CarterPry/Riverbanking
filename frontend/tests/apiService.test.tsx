import apiService from '../src/services/apiService';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock window methods
global.window.confirm = jest.fn();
global.window.prompt = jest.fn();
global.window.alert = jest.fn();

describe('API Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    
    // Setup axios mock
    mockedAxios.create.mockReturnValue({
      post: jest.fn(),
      get: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() }
      }
    } as any);
  });

  describe('runWorkflow', () => {
    it('should make API call and return response', async () => {
      const mockResponse = {
        data: {
          workflowId: '123',
          status: 'accepted',
          message: 'Workflow started'
        }
      };

      const api = (apiService as any).api;
      api.post.mockResolvedValue(mockResponse);

      const request = {
        target: 'https://example.com',
        scope: 'security',
        description: 'Test scan',
        template: 'quick'
      };

      const result = await apiService.runWorkflow(request);

      expect(api.post).toHaveBeenCalledWith('/run-soc2-workflow', request);
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle authentication requirement', async () => {
      const mockResponse = {
        data: {
          workflowId: '123',
          status: 'accepted',
          message: 'Workflow started',
          requiresAuth: true
        }
      };

      const api = (apiService as any).api;
      api.post.mockResolvedValue(mockResponse);

      // Mock user interaction
      (window.confirm as jest.Mock).mockReturnValue(true);
      (window.prompt as jest.Mock)
        .mockReturnValueOnce('testuser')
        .mockReturnValueOnce('testpass');

      // Mock second call with auth
      const authResponse = {
        data: {
          workflowId: '456',
          status: 'accepted',
          message: 'Workflow started with auth'
        }
      };
      api.post.mockResolvedValueOnce(mockResponse).mockResolvedValueOnce(authResponse);

      const request = {
        target: 'https://example.com',
        scope: 'security',
        description: 'Test auth scan',
        template: 'comprehensive'
      };

      const result = await apiService.runWorkflow(request);

      // Should have called twice - once without auth, once with
      expect(api.post).toHaveBeenCalledTimes(2);
      expect(api.post).toHaveBeenLastCalledWith('/run-soc2-workflow', {
        ...request,
        auth: { username: 'testuser', password: 'testpass' }
      });
      expect(result).toEqual(authResponse.data);
    });

    it('should handle HITL requirement', async () => {
      const mockResponse = {
        data: {
          workflowId: '123',
          status: 'accepted',
          message: 'Workflow started',
          requiresHITL: true,
          hitlReasons: ['Critical attacks detected']
        }
      };

      const api = (apiService as any).api;
      api.post.mockResolvedValue(mockResponse);

      // Mock user approval
      (window.confirm as jest.Mock).mockReturnValue(true);

      // Mock approval response
      const approvalResponse = {
        data: {
          workflowId: '123',
          status: 'approved',
          message: 'Workflow approved'
        }
      };
      api.post
        .mockResolvedValueOnce(mockResponse)
        .mockResolvedValueOnce(approvalResponse);

      const request = {
        target: 'https://example.com',
        scope: 'security',
        description: 'Test HITL scan',
        template: 'comprehensive'
      };

      const result = await apiService.runWorkflow(request);

      expect(window.confirm).toHaveBeenCalledWith(
        expect.stringContaining('Human approval required')
      );
      expect(api.post).toHaveBeenCalledWith(
        '/workflows/123/approve'
      );
      expect(result).toEqual(approvalResponse.data);
    });

    it('should handle user rejection of HITL', async () => {
      const mockResponse = {
        data: {
          workflowId: '123',
          status: 'accepted',
          message: 'Workflow started',
          requiresHITL: true,
          hitlReasons: ['Critical attacks detected']
        }
      };

      const api = (apiService as any).api;
      api.post.mockResolvedValue(mockResponse);

      // Mock user rejection
      (window.confirm as jest.Mock).mockReturnValue(false);

      const request = {
        target: 'https://example.com',
        scope: 'security',
        description: 'Test HITL scan',
        template: 'comprehensive'
      };

      await expect(apiService.runWorkflow(request)).rejects.toThrow(
        'Workflow rejected by user'
      );
    });

    it('should handle 403 errors', async () => {
      const api = (apiService as any).api;
      api.post.mockRejectedValue({
        isAxiosError: true,
        response: { status: 403 }
      });

      const request = {
        target: 'https://example.com',
        scope: 'security',
        description: 'Test scan',
        template: 'quick'
      };

      await expect(apiService.runWorkflow(request)).rejects.toThrow(
        'Insufficient permissions for this operation'
      );
    });
  });

  describe('authentication', () => {
    it('should add auth token to requests', async () => {
      localStorage.setItem('authToken', 'test-token');
      
      // Re-create service to pick up token
      const newService = require('../src/services/apiService').default;
      
      // Check that interceptor adds token
      const config = { headers: {} as any };
      const interceptor = (newService as any).api.interceptors.request.use.mock.calls[0][0];
      const result = interceptor(config);
      
      expect(result.headers.Authorization).toBe('Bearer test-token');
    });

    it('should handle authentication', async () => {
      const api = (apiService as any).api;
      api.post.mockResolvedValue({
        data: { token: 'new-token', user: 'testuser' }
      });

      const result = await apiService.authenticate('testuser', 'testpass');

      expect(api.post).toHaveBeenCalledWith('/auth/login', {
        username: 'testuser',
        password: 'testpass'
      });
      expect(localStorage.getItem('authToken')).toBe('new-token');
      expect(result).toEqual({ token: 'new-token', user: 'testuser' });
    });

    it('should handle logout', () => {
      localStorage.setItem('authToken', 'test-token');
      
      apiService.logout();
      
      expect(localStorage.getItem('authToken')).toBeNull();
    });
  });

  describe('other endpoints', () => {
    it('should get workflow status', async () => {
      const api = (apiService as any).api;
      api.get.mockResolvedValue({
        data: { status: 'running', progress: 50 }
      });

      const result = await apiService.getWorkflowStatus('123');

      expect(api.get).toHaveBeenCalledWith('/workflows/123/status');
      expect(result).toEqual({ status: 'running', progress: 50 });
    });

    it('should get test results', async () => {
      const mockResults = {
        id: 'result-123',
        workflowId: '123',
        status: 'complete',
        score: 85,
        findings: [],
        controls: ['CC6.1'],
        summary: {},
        createdAt: '2024-01-01'
      };

      const api = (apiService as any).api;
      api.get.mockResolvedValue({ data: mockResults });

      const result = await apiService.getTestResults('123');

      expect(api.get).toHaveBeenCalledWith('/workflows/123/results');
      expect(result).toEqual(mockResults);
    });
  });
}); 