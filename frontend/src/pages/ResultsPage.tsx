import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert
} from '@mui/material';
import { ArrowBackOutlined } from '@mui/icons-material';
import ReportViewer from '../components/ReportViewer';
import apiService from '../services/apiService';

function ResultsPage() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workflowId) {
      setError('No workflow ID provided');
      setLoading(false);
      return;
    }

    fetchResults();
  }, [workflowId]);

  const fetchResults = async () => {
    try {
      const data = await apiService.getTestResults(workflowId!);
      setResults(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch results');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button
          startIcon={<ArrowBackOutlined />}
          onClick={() => navigate('/')}
        >
          Back to Home
        </Button>
      </Container>
    );
  }

  // Mock data for demonstration if no results
  const mockResults = results || {
    id: '1',
    workflowId: workflowId || 'demo-workflow',
    status: 'complete',
    score: 85,
    findings: [
      {
        id: '1',
        severity: 'high',
        title: 'SQL Injection Vulnerability',
        description: 'A SQL injection vulnerability was found in the login endpoint.',
        control: 'CC6.1',
        evidence: 'Parameter "username" is vulnerable to SQL injection attacks.',
        recommendation: 'Use parameterized queries or prepared statements.'
      },
      {
        id: '2',
        severity: 'medium',
        title: 'Missing Security Headers',
        description: 'Several security headers are missing from HTTP responses.',
        control: 'CC6.6',
        evidence: 'X-Frame-Options, X-Content-Type-Options headers not present.',
        recommendation: 'Implement security headers to prevent clickjacking and MIME sniffing.'
      }
    ],
    controls: [
      {
        control: 'CC6.1',
        description: 'Logical and Physical Access Controls',
        status: 'partial',
        coverage: 75,
        findings: ['1']
      },
      {
        control: 'CC6.6',
        description: 'System Operations',
        status: 'partial',
        coverage: 60,
        findings: ['2']
      },
      {
        control: 'CC6.7',
        description: 'System Monitoring',
        status: 'passed',
        coverage: 100,
        findings: []
      }
    ],
    summary: {
      totalTests: 25,
      passed: 20,
      failed: 3,
      warnings: 2
    },
    createdAt: new Date().toISOString()
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Button
          startIcon={<ArrowBackOutlined />}
          onClick={() => navigate('/dashboard')}
          sx={{ mb: 2 }}
        >
          Back to Dashboard
        </Button>
      </Box>

      <ReportViewer results={mockResults} />
    </Container>
  );
}

export default ResultsPage; 