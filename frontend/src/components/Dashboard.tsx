import React, { useEffect, useState, useRef } from 'react';
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

interface LogEntry {
  id: string;
  level: 'info' | 'warning' | 'error' | 'success' | 'debug';
  category: 'workflow' | 'attack' | 'command' | 'system';
  message: string;
  data?: any;
  timestamp: string;
}

interface AttackProgress {
  attackId: string;
  name: string;
  progress: number;
  message: string;
  startTime: number;
}

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
  logs: LogEntry[];
  activeAttacks: Record<string, AttackProgress>;
}

function Dashboard({ workflowId }: { workflowId?: string }) {
  console.log('Dashboard component rendering', { workflowId, time: new Date().toISOString() });
  
  const wsRef = useRef<any>(null); // Store WebSocket reference
  const isCompletedRef = useRef(false); // Track if workflow is already completed
  const [state, setState] = useState<DashboardState>({
    progress: 'Initializing...',
    score: 0,
    restraint: '',
    cc: [],
    phase: 'starting',
    attacks: 0,
    findings: [],
    status: 'idle',
    logs: [],
    activeAttacks: {}
  });
  const [wsError, setWsError] = useState<string | null>(null);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showHITLDialog, setShowHITLDialog] = useState(false);

  useEffect(() => {
    console.log('Dashboard useEffect triggered', { workflowId, time: new Date().toISOString() });
    if (!workflowId) return;

    // Add a small delay to prevent rapid reconnections during re-renders
    const connectionTimeout = setTimeout(() => {
      // Close existing connection if any
      if (wsRef.current) {
        console.log('Closing existing WebSocket connection');
        wsRef.current.close();
      }

      wsRef.current = connect(
      `ws://localhost:3000/ws?workflowId=${workflowId}`,
      (msg: WebSocketMessage) => {
        // Handle different message types
        console.log('Received WebSocket message:', msg);
        
        try {
          switch (msg.type) {
          case 'workflow-status':
            console.log('Processing workflow-status message', { status: msg.status, hasResult: !!msg.result });
            // Handle completed workflow status
            if (msg.status === 'completed') {
              console.log('Workflow is completed, marking as such');
              isCompletedRef.current = true;
              
              // Check if results are included in the message
              if (msg.result) {
                console.log('Setting state with results from WebSocket message');
                setState(prev => ({
                  ...prev,
                  status: 'complete',
                  progress: 'Workflow completed',
                  score: msg.result.overallScore || 0,
                  findings: msg.result.testResults || [],
                }));
              } else {
                // Fallback to REST API if results not included
                setState(prev => ({
                  ...prev,
                  status: 'complete',
                  progress: 'Workflow completed. Loading results...'
                }));
                
                apiService.getWorkflowStatus(workflowId)
                  .then(result => {
                    if (result.results) {
                      setState(prev => ({
                        ...prev,
                        score: result.results.overallScore || 0,
                        findings: result.results.testResults || [],
                        status: 'complete'
                      }));
                    }
                  })
                  .catch(err => {
                    console.error('Failed to fetch results:', err);
                  });
              }
            } else if (msg.status === 'not-found') {
              // Handle workflow not found
              console.log('Workflow not found, displaying message');
              setState(prev => ({
                ...prev,
                status: 'error',
                progress: 'Workflow not found. It may have expired or the server was restarted.',
                score: 0,
                findings: []
              }));
            } else {
              // Handle other workflow statuses
              setState(prev => ({
                ...prev,
                status: msg.status === 'running' ? 'running' : prev.status,
                progress: msg.message || prev.progress
              }));
            }
            break;
            
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
              status: msg.data?.status || prev.status
            }));
            break;
          
          case 'result':
            setState(prev => ({
              ...prev,
              ...msg.data,
              status: 'complete'
            }));
            break;
            
          case 'workflow-update':
            console.log('Processing workflow-update message', { event: msg.update?.event, hasResults: !!msg.update?.results });
            // Handle workflow completed update
            if (msg.update?.event === 'completed' && msg.update?.results) {
              console.log('Workflow completed with results from update');
              isCompletedRef.current = true;
              setState(prev => ({
                ...prev,
                status: 'complete',
                progress: 'Workflow completed',
                score: msg.update.results.overallScore || 0,
                findings: msg.update.results.testResults || [],
              }));
            }
            break;
          
          case 'error':
            setState(prev => ({
              ...prev,
              status: 'error',
              progress: msg.data?.message || 'An error occurred'
            }));
            break;
            
          case 'log':
            setState(prev => ({
              ...prev,
              logs: [...prev.logs, {
                id: `${msg.timestamp}-${Math.random()}`,
                level: msg.level || 'info',
                category: msg.category || 'system',
                message: msg.data?.message || '',
                data: msg.data,
                timestamp: msg.timestamp
              }]
            }));
            break;
            
          case 'attack:start':
            const attackId = msg.data?.attackId || msg.data?.tool;
            setState(prev => ({
              ...prev,
              activeAttacks: {
                ...prev.activeAttacks,
                [attackId]: {
                  attackId,
                  name: msg.data?.tool || 'Security Scan',
                  progress: 0,
                  message: 'Starting...',
                  startTime: Date.now()
                }
              }
            }));
            break;
            
          case 'attack:progress':
          case 'tool:progress':
            const progressId = msg.data?.attackId || msg.data?.containerId;
            if (progressId) {
              setState(prev => ({
                ...prev,
                activeAttacks: {
                  ...prev.activeAttacks,
                  [progressId]: {
                    ...prev.activeAttacks[progressId],
                    progress: msg.data?.progress || 0,
                    message: msg.data?.message || `Scanning... ${msg.data?.progress || 0}%`
                  }
                }
              }));
            }
            break;
            
          case 'attack:complete':
            const completeId = msg.data?.attackId || msg.data?.tool;
            setState(prev => {
              const { [completeId]: removed, ...remaining } = prev.activeAttacks;
              return {
                ...prev,
                activeAttacks: remaining
              };
            });
            break;
            
          case 'connected':
          case 'subscribed':
            // These are connection status messages, just log them
            console.log('Connection status:', msg.type, msg.message);
            break;
            
          default:
            console.log('Unhandled WebSocket message type:', msg.type, msg);
          }
        } catch (error) {
          console.error('Error handling WebSocket message:', error, msg);
        }
      },
      (error) => {
        setWsError('WebSocket connection lost. Reconnecting...');
        setTimeout(() => setWsError(null), 3000);
      }
    );
    }, 200); // 200ms delay to debounce rapid re-renders

    return () => {
      console.log('Dashboard useEffect cleanup - clearing timeout and closing WebSocket', { workflowId, time: new Date().toISOString() });
      clearTimeout(connectionTimeout);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
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

        {/* Active Attacks */}
        {Object.keys(state.activeAttacks).length > 0 && (
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Active Security Scans
              </Typography>
              <Box sx={{ mt: 2 }}>
                {Object.values(state.activeAttacks).map((attack) => {
                  const elapsedSeconds = Math.floor((Date.now() - attack.startTime) / 1000);
                  const minutes = Math.floor(elapsedSeconds / 60);
                  const seconds = elapsedSeconds % 60;
                  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                  
                  return (
                    <Box key={attack.attackId} sx={{ mb: 3 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2" fontWeight="medium">
                          {attack.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {timeDisplay} - {attack.progress}%
                        </Typography>
                      </Box>
                      <LinearProgress 
                        variant="determinate" 
                        value={attack.progress} 
                        sx={{ height: 6, borderRadius: 3 }}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                        {attack.message}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Paper>
          </Grid>
        )}

        {/* Activity Logs */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, maxHeight: 400, overflow: 'auto' }}>
            <Typography variant="h6" gutterBottom>
              Activity Logs
            </Typography>
            {state.logs.length > 0 ? (
              <List dense sx={{ bgcolor: 'grey.50', borderRadius: 1, p: 1 }}>
                {state.logs.map(log => (
                  <ListItem 
                    key={log.id} 
                    sx={{ 
                      py: 0.5, 
                      borderLeft: `3px solid ${
                        log.level === 'error' ? '#f44336' :
                        log.level === 'warning' ? '#ff9800' :
                        log.level === 'success' ? '#4caf50' :
                        log.level === 'debug' ? '#9e9e9e' :
                        '#2196f3'
                      }`,
                      mb: 0.5,
                      bgcolor: 'background.paper',
                      borderRadius: '0 4px 4px 0'
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography 
                            variant="caption" 
                            sx={{ 
                              color: 'text.secondary',
                              fontFamily: 'monospace',
                              minWidth: 80
                            }}
                          >
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </Typography>
                          <Chip 
                            label={log.category} 
                            size="small" 
                            sx={{ height: 20, fontSize: '0.7rem' }}
                            color={
                              log.category === 'command' ? 'secondary' :
                              log.category === 'attack' ? 'primary' :
                              'default'
                            }
                          />
                          <Typography variant="body2">
                            {log.message}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        log.data?.command ? (
                          <Box sx={{ mt: 0.5 }}>
                            <Typography 
                              variant="caption" 
                              component="pre" 
                              sx={{ 
                                fontFamily: 'monospace',
                                bgcolor: 'grey.100',
                                p: 1,
                                borderRadius: 1,
                                overflow: 'auto'
                              }}
                            >
                              {log.data.command}
                            </Typography>
                            {log.data.rawOutput && (
                              <details style={{ marginTop: '8px' }}>
                                <summary style={{ cursor: 'pointer', fontSize: '0.8rem' }}>
                                  Show Output
                                </summary>
                                <Typography 
                                  variant="caption" 
                                  component="pre" 
                                  sx={{ 
                                    fontFamily: 'monospace',
                                    bgcolor: 'grey.100',
                                    p: 1,
                                    borderRadius: 1,
                                    overflow: 'auto',
                                    maxHeight: 200
                                  }}
                                >
                                  {log.data.rawOutput}
                                </Typography>
                              </details>
                            )}
                          </Box>
                        ) : log.data?.findings && log.data.findings.length > 0 ? (
                          <Box sx={{ mt: 0.5 }}>
                            {log.data.findings.map((finding: any, idx: number) => (
                              <Alert 
                                key={idx} 
                                severity={
                                  finding.severity === 'critical' ? 'error' :
                                  finding.severity === 'high' ? 'error' :
                                  finding.severity === 'medium' ? 'warning' :
                                  'info'
                                }
                                sx={{ mb: 0.5 }}
                              >
                                <Typography variant="caption">
                                  {finding.description || finding.type}
                                </Typography>
                              </Alert>
                            ))}
                          </Box>
                        ) : null
                      }
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Waiting for activity...
              </Typography>
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