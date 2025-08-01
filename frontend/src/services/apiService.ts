import axios, { AxiosInstance } from 'axios';

interface WorkflowRequest {
  target: string;
  scope: string;
  description: string;
  template: string;
  auth?: {
    username: string;
    password: string;
  };
}

interface WorkflowResponse {
  workflowId: string;
  message: string;
  status: string;
  requiresAuth?: boolean;
  requiresHITL?: boolean;
  hitlReasons?: string[];
}

interface TestResult {
  id: string;
  workflowId: string;
  status: string;
  score: number;
  findings: any[];
  controls: any[];
  summary: any;
  createdAt: string;
}

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000/api',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for auth tokens
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Handle unauthorized
          localStorage.removeItem('authToken');
          window.location.href = '/';
        }
        return Promise.reject(error);
      }
    );
  }

  // Run SOC2 workflow with restraint handling
  async runWorkflow(data: WorkflowRequest): Promise<WorkflowResponse> {
    try {
      const response = await this.api.post<WorkflowResponse>('/run-soc2-workflow', data);
      
      // Handle restraint mechanisms
      if (response.data.requiresAuth && !data.auth) {
        // Trigger HITL UI prompt for authentication
        const shouldProvideAuth = window.confirm(
          'This workflow requires authentication. Would you like to provide credentials?'
        );
        
        if (shouldProvideAuth) {
          // In real app, show auth form modal
          const username = prompt('Username:');
          const password = prompt('Password:');
          
          if (username && password) {
            // Retry with auth
            return this.runWorkflow({
              ...data,
              auth: { username, password }
            });
          }
        }
      }
      
      if (response.data.requiresHITL) {
        // Show HITL approval dialog
        const reasons = response.data.hitlReasons?.join('\n') || 'Manual approval required';
        const approved = window.confirm(
          `Human approval required:\n\n${reasons}\n\nDo you approve this workflow?`
        );
        
        if (!approved) {
          throw new Error('Workflow rejected by user');
        }
        
        // Send approval
        const approvalResponse = await this.api.post(`/workflows/${response.data.workflowId}/approve`);
        return approvalResponse.data;
      }
      
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        throw new Error('Insufficient permissions for this operation');
      }
      throw error;
    }
  }

  // Get workflow status
  async getWorkflowStatus(workflowId: string) {
    const response = await this.api.get(`/workflows/${workflowId}/status`);
    return response.data;
  }

  // Get test results
  async getTestResults(workflowId: string): Promise<TestResult> {
    const response = await this.api.get<TestResult>(`/workflows/${workflowId}/results`);
    return response.data;
  }

  // Get all workflows
  async getWorkflows() {
    const response = await this.api.get('/workflows');
    return response.data;
  }

  // Simulate authentication (for testing)
  async authenticate(username: string, password: string) {
    const response = await this.api.post('/auth/login', { username, password });
    if (response.data.token) {
      localStorage.setItem('authToken', response.data.token);
    }
    return response.data;
  }

  // Logout
  logout() {
    localStorage.removeItem('authToken');
  }

  // Health check
  async healthCheck() {
    const response = await this.api.get('/health');
    return response.data;
  }
}

export default new ApiService(); 