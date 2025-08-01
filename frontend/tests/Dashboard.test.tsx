import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from '../src/components/Dashboard';

// Mock the WebSocket utility
jest.mock('../src/utils/websocket', () => ({
  connect: jest.fn()
}));

import { connect } from '../src/utils/websocket';

describe('Dashboard Component', () => {
  let mockWebSocket: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock WebSocket
    mockWebSocket = {
      close: jest.fn(),
      send: jest.fn(),
      readyState: WebSocket.OPEN
    };

    // Mock connect function
    (connect as jest.Mock).mockImplementation((url, onMessage, onError) => {
      // Store the onMessage callback for testing
      (mockWebSocket as any).onMessage = onMessage;
      (mockWebSocket as any).onError = onError;
      return mockWebSocket;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders initial state correctly', () => {
    render(<Dashboard workflowId="test-workflow-123" />);

    expect(screen.getByText(/Test Progress/i)).toBeInTheDocument();
    expect(screen.getByText(/Initializing.../i)).toBeInTheDocument();
    expect(screen.getByText(/Attacks Tested/i)).toBeInTheDocument();
    expect(screen.getByText(/Compliance Score/i)).toBeInTheDocument();
    expect(screen.getByText(/Restraint Status/i)).toBeInTheDocument();
  });

  test('connects to WebSocket with correct URL', () => {
    const workflowId = 'test-workflow-123';
    render(<Dashboard workflowId={workflowId} />);

    expect(connect).toHaveBeenCalledWith(
      `ws://localhost:3000/ws?workflowId=${workflowId}`,
      expect.any(Function),
      expect.any(Function)
    );
  });

  test('updates state when receiving WebSocket messages', async () => {
    render(<Dashboard workflowId="test-workflow-123" />);

    // Simulate WebSocket message
    const mockData = {
      progress: 'Testing SQL injection vulnerabilities',
      score: 85,
      restraint: 'Awaiting HITL approval',
      cc: ['CC6.1', 'CC6.6', 'CC6.7'],
      phase: 'testing',
      attacks: 15,
      status: 'running'
    };

    // Trigger the onMessage callback
    mockWebSocket.onMessage(JSON.stringify(mockData));

    await waitFor(() => {
      expect(screen.getByText(/Testing SQL injection vulnerabilities/i)).toBeInTheDocument();
      expect(screen.getByText('85%')).toBeInTheDocument();
      expect(screen.getByText(/Awaiting HITL approval/i)).toBeInTheDocument();
      expect(screen.getByText('15')).toBeInTheDocument();
      expect(screen.getByText('CC6.1')).toBeInTheDocument();
      expect(screen.getByText('CC6.6')).toBeInTheDocument();
      expect(screen.getByText('CC6.7')).toBeInTheDocument();
    });
  });

  test('displays restraint status with appropriate color', async () => {
    render(<Dashboard workflowId="test-workflow-123" />);

    // Test HITL restraint
    mockWebSocket.onMessage(JSON.stringify({
      restraint: 'Awaiting HITL review',
      status: 'running'
    }));

    await waitFor(() => {
      const restraintChip = screen.getByText(/Awaiting HITL review/i);
      expect(restraintChip).toBeInTheDocument();
    });
  });

  test('shows completion status when test is done', async () => {
    render(<Dashboard workflowId="test-workflow-123" />);

    // Simulate completion message
    mockWebSocket.onMessage(JSON.stringify({
      status: 'complete',
      progress: 'Test completed successfully',
      score: 92
    }));

    await waitFor(() => {
      expect(screen.getByText(/Test Complete/i)).toBeInTheDocument();
    });
  });

  test('displays error when WebSocket connection fails', async () => {
    render(<Dashboard workflowId="test-workflow-123" />);

    // Trigger error callback
    mockWebSocket.onError(new Event('error'));

    await waitFor(() => {
      expect(screen.getByText(/WebSocket connection lost/i)).toBeInTheDocument();
    });
  });

  test('closes WebSocket on component unmount', () => {
    const { unmount } = render(<Dashboard workflowId="test-workflow-123" />);

    unmount();

    expect(mockWebSocket.close).toHaveBeenCalled();
  });

  test('does not connect to WebSocket without workflowId', () => {
    render(<Dashboard />);

    expect(connect).not.toHaveBeenCalled();
  });

  test('displays findings when received', async () => {
    render(<Dashboard workflowId="test-workflow-123" />);

    const mockFindings = [
      {
        id: '1',
        severity: 'high',
        title: 'SQL Injection Vulnerability',
        control: 'CC6.1'
      },
      {
        id: '2',
        severity: 'medium',
        title: 'Missing Security Headers',
        control: 'CC6.6'
      }
    ];

    mockWebSocket.onMessage(JSON.stringify({
      findings: mockFindings,
      status: 'running'
    }));

    await waitFor(() => {
      expect(screen.getByText(/SQL Injection Vulnerability/i)).toBeInTheDocument();
      expect(screen.getByText(/Missing Security Headers/i)).toBeInTheDocument();
    });
  });
}); 