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
  // Get workflowId from state or URL params
  const searchParams = new URLSearchParams(location.search);
  const workflowId = location.state?.workflowId || searchParams.get('workflowId');
  
  console.log('DashboardPage rendering', { 
    workflowId, 
    fromState: location.state?.workflowId,
    fromUrl: searchParams.get('workflowId'),
    time: new Date().toISOString() 
  });

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