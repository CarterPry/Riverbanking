import React from 'react';
import { 
  Typography, 
  Box, 
  Container,
  Paper
} from '@mui/material';
import { SecurityOutlined } from '@mui/icons-material';
import Form from '../components/Form';

function HomePage() {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ textAlign: 'center', mb: 6 }}>
        <SecurityOutlined sx={{ fontSize: 80, color: 'primary.main', mb: 2 }} />
        <Typography variant="h3" component="h1" gutterBottom>
          SOC2 Security Testing Platform
        </Typography>
        <Typography variant="h6" color="text.secondary" paragraph>
          AI-enhanced automated security testing for SOC2 compliance
        </Typography>
      </Box>

      <Form />

      <Box sx={{ mt: 6 }}>
        <Paper sx={{ p: 3, bgcolor: 'grey.50' }}>
          <Typography variant="h6" gutterBottom>
            How it works
          </Typography>
          <Typography variant="body2" paragraph>
            1. <strong>Configure Test:</strong> Enter your target URL and test parameters
          </Typography>
          <Typography variant="body2" paragraph>
            2. <strong>Authentication (Optional):</strong> Provide credentials to test authenticated endpoints
          </Typography>
          <Typography variant="body2" paragraph>
            3. <strong>AI Classification:</strong> Our AI classifies and enriches security tests
          </Typography>
          <Typography variant="body2" paragraph>
            4. <strong>Automated Testing:</strong> Tests run with built-in restraint mechanisms
          </Typography>
          <Typography variant="body2">
            5. <strong>SOC2 Mapping:</strong> Results are automatically mapped to SOC2 controls
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
}

export default HomePage; 