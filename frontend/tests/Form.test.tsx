import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Form from '../src/components/Form';
import apiService from '../src/services/apiService';

// Mock the API service
jest.mock('../src/services/apiService', () => ({
  __esModule: true,
  default: {
    runWorkflow: jest.fn()
  }
}));

// Mock useNavigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

describe('Form Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderForm = () => {
    return render(
      <BrowserRouter>
        <Form />
      </BrowserRouter>
    );
  };

  test('renders all form fields', () => {
    renderForm();

    expect(screen.getByLabelText(/Target URL/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Test Scope/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Test Description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start Security Test/i })).toBeInTheDocument();
  });

  test('submits form with authentication fields', async () => {
    const mockResponse = { workflowId: 'test-workflow-123' };
    (apiService.runWorkflow as jest.Mock).mockResolvedValue(mockResponse);

    renderForm();

    const user = userEvent.setup();

    // Fill in form fields
    await user.type(screen.getByLabelText(/Target URL/i), 'https://example.com');
    await user.type(screen.getByLabelText(/Test Scope/i), '/api/*');
    await user.type(screen.getByLabelText(/Test Description/i), 'Test description');
    await user.type(screen.getByLabelText(/Username/i), 'testuser');
    await user.type(screen.getByLabelText(/Password/i), 'testpass123');

    // Submit form
    await user.click(screen.getByRole('button', { name: /Start Security Test/i }));

    await waitFor(() => {
      expect(apiService.runWorkflow).toHaveBeenCalledWith({
        target: 'https://example.com',
        scope: '/api/*',
        description: 'Test description',
        template: 'security-comprehensive',
        auth: {
          username: 'testuser',
          password: 'testpass123'
        }
      });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', {
      state: { workflowId: 'test-workflow-123' }
    });
  });

  test('submits form without authentication when fields are empty', async () => {
    const mockResponse = { workflowId: 'test-workflow-456' };
    (apiService.runWorkflow as jest.Mock).mockResolvedValue(mockResponse);

    renderForm();

    const user = userEvent.setup();

    // Fill in only required fields
    await user.type(screen.getByLabelText(/Target URL/i), 'https://example.com');
    await user.type(screen.getByLabelText(/Test Scope/i), '/public/*');

    // Submit form
    await user.click(screen.getByRole('button', { name: /Start Security Test/i }));

    await waitFor(() => {
      expect(apiService.runWorkflow).toHaveBeenCalledWith({
        target: 'https://example.com',
        scope: '/public/*',
        description: '',
        template: 'security-comprehensive',
        auth: undefined
      });
    });
  });

  test('displays error message on API failure', async () => {
    const errorMessage = 'Failed to start workflow';
    (apiService.runWorkflow as jest.Mock).mockRejectedValue({
      response: { data: { error: errorMessage } }
    });

    renderForm();

    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Target URL/i), 'https://example.com');
    await user.type(screen.getByLabelText(/Test Scope/i), '/api/*');
    await user.click(screen.getByRole('button', { name: /Start Security Test/i }));

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  test('disables submit button while loading', async () => {
    (apiService.runWorkflow as jest.Mock).mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 1000))
    );

    renderForm();

    const user = userEvent.setup();
    
    await user.type(screen.getByLabelText(/Target URL/i), 'https://example.com');
    await user.type(screen.getByLabelText(/Test Scope/i), '/api/*');

    const submitButton = screen.getByRole('button', { name: /Start Security Test/i });
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();
    expect(screen.getByText(/Starting Test.../i)).toBeInTheDocument();
  });
}); 