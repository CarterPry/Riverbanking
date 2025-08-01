import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Divider,
  Grid
} from '@mui/material';
import {
  ExpandMoreOutlined,
  DownloadOutlined,
  AssessmentOutlined,
  CheckCircleOutline,
  WarningAmberOutlined,
  ErrorOutlineOutlined
} from '@mui/icons-material';

interface TestResult {
  id: string;
  workflowId: string;
  status: string;
  score: number;
  findings: Finding[];
  controls: ControlMapping[];
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  createdAt: string;
}

interface Finding {
  id: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  control: string;
  evidence: string;
  recommendation: string;
}

interface ControlMapping {
  control: string;
  description: string;
  status: 'passed' | 'failed' | 'partial';
  coverage: number;
  findings: string[];
}

function ReportViewer({ results }: { results: TestResult }) {
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high':
        return <ErrorOutlineOutlined color="error" />;
      case 'medium':
        return <WarningAmberOutlined color="warning" />;
      case 'low':
        return <WarningAmberOutlined color="info" />;
      default:
        return <CheckCircleOutline color="success" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed':
        return 'success';
      case 'failed':
        return 'error';
      case 'partial':
        return 'warning';
      default:
        return 'default';
    }
  };

  const handleDownloadReport = () => {
    // TODO: Implement PDF download
    console.log('Downloading report...');
  };

  return (
    <Box>
      {/* Summary Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h5" component="h2">
            Security Test Report
          </Typography>
          <Button
            variant="outlined"
            startIcon={<DownloadOutlined />}
            onClick={handleDownloadReport}
          >
            Download PDF
          </Button>
        </Box>

        <Grid container spacing={3}>
          <Grid item xs={12} md={3}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h3" color="primary">
                {results.score}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Compliance Score
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} md={3}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4">{results.summary.totalTests}</Typography>
              <Typography variant="body2" color="text.secondary">
                Total Tests
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} md={3}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="success.main">
                {results.summary.passed}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Passed
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} md={3}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="error.main">
                {results.summary.failed}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Failed
              </Typography>
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />

        <Typography variant="body2" color="text.secondary">
          Test completed on {new Date(results.createdAt).toLocaleString()}
        </Typography>
      </Paper>

      {/* Control Coverage Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          SOC2 Control Coverage
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Control</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Coverage</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {results.controls.map((control) => (
                <TableRow key={control.control}>
                  <TableCell>
                    <Chip label={control.control} size="small" />
                  </TableCell>
                  <TableCell>{control.description}</TableCell>
                  <TableCell>
                    <Chip
                      label={control.status}
                      color={getStatusColor(control.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">{control.coverage}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Findings Section */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Security Findings ({results.findings.length})
        </Typography>
        <Box sx={{ mt: 2 }}>
          {results.findings.map((finding, index) => (
            <Accordion key={finding.id} defaultExpanded={index === 0}>
              <AccordionSummary expandIcon={<ExpandMoreOutlined />}>
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 2 }}>
                  {getSeverityIcon(finding.severity)}
                  <Typography sx={{ flexGrow: 1 }}>{finding.title}</Typography>
                  <Chip
                    label={finding.severity.toUpperCase()}
                    color={finding.severity === 'high' ? 'error' : 'default'}
                    size="small"
                  />
                  <Chip label={finding.control} size="small" variant="outlined" />
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Description
                  </Typography>
                  <Typography variant="body2" paragraph>
                    {finding.description}
                  </Typography>

                  <Typography variant="subtitle2" gutterBottom>
                    Evidence
                  </Typography>
                  <Typography variant="body2" paragraph>
                    {finding.evidence}
                  </Typography>

                  <Typography variant="subtitle2" gutterBottom>
                    Recommendation
                  </Typography>
                  <Typography variant="body2">
                    {finding.recommendation}
                  </Typography>
                </Box>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      </Paper>
    </Box>
  );
}

export default ReportViewer; 