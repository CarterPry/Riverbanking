import React, { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  LinearProgress,
  Chip,
  Grid,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
  TableContainer
} from '@mui/material';
import {
  SecurityOutlined,
  CheckCircleOutline,
  WarningAmberOutlined,
  InfoOutlined,
  PolicyOutlined,
  LockOutlined
} from '@mui/icons-material';
import { connect, WebSocketMessage } from '../utils/websocket';
import apiService from '../services/apiService';

interface DashboardState {
  progress: string;
  score: number;
  restraint: string;
  cc: string[];
  phase: string;
  attacks: number;
  findings: any[];
  status: 'running' | 'complete' | 'error' | 'idle' | 'awaiting-auth' | 'awaiting-hitl';
  requiresAuth?: boolean;
  requiresHITL?: boolean;
  hitlReasons?: string[];
}

function Dashboard({ workflowId }: { workflowId?: string }) {
  const [state, setState] = useState<DashboardState>({
    progress: 'Initializing...',
    score: 0,
    restraint: '',
    cc: [],
    phase: 'starting',
    attacks: 0,
    findings: [],
    status: 'idle'
  });
  const [wsError, setWsError] = useState<string | null>(null);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showHITLDialog, setShowHITLDialog] = useState(false);

  useEffect(() => {
    if (!workflowId) return;

    const ws = connect(
      `ws://localhost:3000/ws?workflowId=${workflowId}`,
      (msg: WebSocketMessage) => {
        // Handle different message types
        switch (msg.type) {
          case 'restraint':
            if (msg.restraint === 'requiresAuth') {
              setState(prev => ({ ...prev, status: 'awaiting-auth', requiresAuth: true }));
              setShowAuthDialog(true);
            } else if (msg.restraint === 'requiresHITL') {
              setState(prev => ({ 
                ...prev, 
                status: 'awaiting-hitl', 
                requiresHITL: true,
                hitlReasons: msg.hitlReasons 
              }));
              setShowHITLDialog(true);
            }
            break;
          
          case 'progress':
          case 'status':
            setState(prev => ({
              ...prev,
              ...msg.data,
              status: msg.data.status || prev.status
            }));
            break;
          
          case 'result':
            setState(prev => ({
              ...prev,
              ...msg.data,
              status: 'complete'
            }));
            break;
          
          case 'error':
            setState(prev => ({
              ...prev,
              status: 'error',
              progress: msg.data.message || 'An error occurred'
            }));
            break;
        }
      },
      (error) => {
        setWsError('WebSocket connection lost. Reconnecting...');
        setTimeout(() => setWsError(null), 3000);
      }
    );

    return () => ws.close();
  }, [workflowId]);

  const getRestraintColor = () => {
    if (state.status === 'awaiting-hitl') return 'warning';
    if (state.status === 'awaiting-auth') return 'error';
    if (state.restraint.includes('approved')) return 'success';
    return 'info';
  };

  const getProgressValue = () => {
    if (state.status === 'complete') return 100;
    if (state.status === 'awaiting-auth' || state.status === 'awaiting-hitl') return 50;
    if (state.phase === 'classification') return 20;
    if (state.phase === 'enrichment') return 40;
    if (state.phase === 'grounding') return 60;
    if (state.phase === 'testing') return 80;
    return 10;
  };

  const handleAuthSubmit = async (username: string, password: string) => {
    setShowAuthDialog(false);
    // Resume workflow with auth
    if (workflowId) {
      await apiService.runWorkflow({
        target: '', // These would be stored from initial request
        scope: '',
        description: '',
        template: '',
        auth: { username, password }
      });
    }
  };

  const handleHITLApproval = async (approved: boolean) => {
    setShowHITLDialog(false);
    if (approved && workflowId) {
      // Send approval to backend
      await fetch(`http://localhost:3000/api/workflows/${workflowId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true })
      });
    }
  };

  return (
    <Box>
      {wsError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {wsError}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Progress Section */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Test Progress
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {state.progress}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={getProgressValue()}
              sx={{ mt: 2, height: 8, borderRadius: 4 }}
              color={state.status === 'error' ? 'error' : 'primary'}
            />
          </Paper>
        </Grid>

        {/* Stats Cards */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <SecurityOutlined color="primary" sx={{ fontSize: 40, mb: 1 }} />
            <Typography variant="h4">{state.attacks}</Typography>
            <Typography variant="body2" color="text.secondary">
              Attacks Tested
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h4">{state.score}%</Typography>
            <Typography variant="body2" color="text.secondary">
              Compliance Score
            </Typography>
            <LinearProgress
              variant="determinate"
              value={state.score}
              color={state.score > 80 ? 'success' : state.score > 60 ? 'warning' : 'error'}
              sx={{ mt: 1 }}
            />
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <PolicyOutlined color="action" sx={{ fontSize: 40, mb: 1 }} />
            <Chip
              label={
                state.status === 'awaiting-auth' ? 'Auth Required' :
                state.status === 'awaiting-hitl' ? 'HITL Required' :
                state.restraint || 'No restraints'
              }
              color={getRestraintColor()}
              size="small"
              icon={state.status === 'awaiting-auth' ? <LockOutlined /> : undefined}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Restraint Status
            </Typography>
          </Paper>
        </Grid>

        {/* Control Mappings */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              SOC2 Control Coverage
            </Typography>
            {state.cc.length > 0 ? (
              <TableContainer sx={{ mt: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Control</TableCell>
                      <TableCell>Findings</TableCell>
                      <TableCell align="center">Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {state.cc.map((control: string) => {
                      const controlFindings = state.findings.filter(f => f.control === control);
                      const hasFindings = controlFindings.length > 0;
                      return (
                        <TableRow key={control}>
                          <TableCell>
                            <Chip
                              label={control}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            {hasFindings ? `${controlFindings.length} finding(s)` : 'No findings'}
                          </TableCell>
                          <TableCell align="center">
                            {hasFindings ? (
                              <WarningAmberOutlined color="warning" fontSize="small" />
                            ) : (
                              <CheckCircleOutline color="success" fontSize="small" />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                No controls mapped yet
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* Recent Findings */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Recent Findings
            </Typography>
            {state.findings.length > 0 ? (
              <List dense>
                {state.findings.slice(0, 3).map((finding, idx) => (
                  <React.Fragment key={idx}>
                    <ListItem>
                      <ListItemIcon>
                        {finding.severity === 'high' ? (
                          <WarningAmberOutlined color="error" />
                        ) : (
                          <InfoOutlined color="info" />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={finding.title}
                        secondary={finding.control}
                      />
                    </ListItem>
                    {idx < 2 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No findings yet
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* Status Indicator */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            {state.status === 'complete' ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircleOutline color="success" sx={{ mr: 1 }} />
                <Typography color="success.main">Test Complete</Typography>
              </Box>
            ) : state.status === 'error' ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <WarningAmberOutlined color="error" sx={{ mr: 1 }} />
                <Typography color="error">Test Failed</Typography>
              </Box>
            ) : state.status === 'awaiting-auth' ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LockOutlined color="warning" sx={{ mr: 1 }} />
                <Typography color="warning.main">Waiting for Authentication</Typography>
              </Box>
            ) : state.status === 'awaiting-hitl' ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <WarningAmberOutlined color="warning" sx={{ mr: 1 }} />
                <Typography color="warning.main">Waiting for HITL Approval</Typography>
              </Box>
            ) : (
              <Typography color="primary">Test Running - Phase: {state.phase}</Typography>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Auth Dialog */}
      <Dialog open={showAuthDialog} onClose={() => setShowAuthDialog(false)}>
        <DialogTitle>Authentication Required</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            This workflow requires authentication to proceed with certain attacks.
          </Typography>
          {/* In real app, add username/password fields here */}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAuthDialog(false)}>Cancel</Button>
          <Button onClick={() => handleAuthSubmit('demo', 'demo')} variant="contained">
            Provide Credentials
          </Button>
        </DialogActions>
      </Dialog>

      {/* HITL Dialog */}
      <Dialog open={showHITLDialog} onClose={() => setShowHITLDialog(false)}>
        <DialogTitle>Human Approval Required</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            The following conditions require human approval:
          </Typography>
          <List>
            {state.hitlReasons?.map((reason, idx) => (
              <ListItem key={idx}>
                <ListItemIcon>
                  <WarningAmberOutlined color="warning" />
                </ListItemIcon>
                <ListItemText primary={reason} />
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => handleHITLApproval(false)} color="error">
            Deny
          </Button>
          <Button onClick={() => handleHITLApproval(true)} variant="contained" color="primary">
            Approve
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Dashboard; 