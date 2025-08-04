import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Container, AppBar, Toolbar, Typography, Box } from '@mui/material';
import HomePage from './pages/HomePage';
import Dashboard from './pages/Dashboard';
import ResultsPage from './pages/ResultsPage';

function App() {
  console.log('App component is rendering...');
  
  return (
    <Router>
      <Box sx={{ flexGrow: 1 }}>
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              SOC2 Testing Platform
            </Typography>
          </Toolbar>
        </AppBar>
        
        <Container maxWidth="lg" sx={{ mt: 4 }}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/results/:workflowId" element={<ResultsPage />} />
          </Routes>
        </Container>
      </Box>
    </Router>
  );
}

export default App; 