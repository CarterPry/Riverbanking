import React, { useState } from 'react';
import {
  TextField,
  Button,
  Box,
  Paper,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import apiService from '../services/apiService';

interface FormData {
  target: string;
  scope: string;
  description: string;
  username: string;
  password: string;
  testType: string;
}

function Form() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    target: '',
    scope: '',
    description: '',
    username: '',
    password: '',
    testType: 'comprehensive'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSelectChange = (e: any) => {
    setFormData({ ...formData, testType: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await apiService.runWorkflow({
        ...formData,
        template: `security-${formData.testType}`,
        auth: formData.username && formData.password ? {
          username: formData.username,
          password: formData.password
        } : undefined
      });
      
      // Navigate to dashboard with workflow ID
      navigate('/dashboard', { state: { workflowId: response.workflowId } });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start security test');
      setLoading(false);
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 4, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h5" component="h2" gutterBottom>
        Configure Security Test
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              required
              name="target"
              label="Target URL"
              placeholder="https://example.com"
              value={formData.target}
              onChange={handleChange}
              helperText="The URL of the application to test"
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              required
              name="scope"
              label="Test Scope"
              placeholder="e.g., /api/*, /admin/*"
              value={formData.scope}
              onChange={handleChange}
              helperText="URL patterns to include in testing"
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Test Type</InputLabel>
              <Select
                value={formData.testType}
                label="Test Type"
                onChange={handleSelectChange}
              >
                <MenuItem value="quick">Quick Scan</MenuItem>
                <MenuItem value="comprehensive">Comprehensive Test</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              rows={3}
              name="description"
              label="Test Description"
              placeholder="Describe the purpose and context of this security test"
              value={formData.description}
              onChange={handleChange}
            />
          </Grid>

          <Grid item xs={12}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Authentication Simulation (Optional)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Provide credentials to test authenticated endpoints and enable restraint mechanisms
            </Typography>
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              name="username"
              label="Username"
              value={formData.username}
              onChange={handleChange}
              helperText="For auth simulation and restraint"
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              type="password"
              name="password"
              label="Password"
              value={formData.password}
              onChange={handleChange}
              helperText="Will enable authenticated testing"
            />
          </Grid>

          <Grid item xs={12}>
            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              disabled={loading}
              sx={{ mt: 2 }}
            >
              {loading ? (
                <>
                  <CircularProgress size={24} sx={{ mr: 1 }} />
                  Starting Test...
                </>
              ) : (
                'Start Security Test'
              )}
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  );
}

export default Form; 