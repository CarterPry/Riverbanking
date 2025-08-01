import React from 'react';
import { useLocation } from 'react-router-dom';
import {
  Container,
  Typography,
  Box
} from '@mui/material';
import Dashboard from '../components/Dashboard';

function DashboardPage() {
  const location = useLocation();
  const workflowId = location.state?.workflowId;

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Security Testing Dashboard
      </Typography>
      
      {workflowId ? (
        <Dashboard workflowId={workflowId} />
      ) : (
        <Box sx={{ mt: 4 }}>
          <Typography variant="body1" color="text.secondary">
            No active workflow. Start a new security test from the home page.
          </Typography>
        </Box>
      )}
    </Container>
  );
}

export default DashboardPage; 