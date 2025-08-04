# Security Testing Platform Dashboard Guide

The platform includes a complete web-based dashboard for initiating scans and monitoring their progress in real-time.

## Starting the Dashboard

1. **Backend** (should already be running):
   ```bash
   cd backend && npm run dev
   ```

2. **Frontend**:
   ```bash
   cd frontend && npm run dev
   ```
   
   The dashboard will be available at: **http://localhost:5173**

## Dashboard Features

### 1. Homepage - Test Submission Form
- **Target URL**: Enter the URL to test (e.g., https://sweetspot.so)
- **Test Scope**: Select the type of test:
  - Security
  - Availability
  - Authentication
  - Authorization
  - Data Integrity
  - Comprehensive
- **Test Type**: Quick or Comprehensive scan
- **Description**: Add notes about the test
- **Optional Authentication**: Username/password for authenticated tests

### 2. Real-Time Monitoring Dashboard

Once you submit a test, you'll be redirected to the monitoring dashboard which shows:

#### Live Progress Tracking
- **Progress Bar**: Visual indicator of test completion
- **Current Phase**: Shows what the AI is currently doing
- **Status Messages**: Real-time updates like "Running XSS tests...", "Analyzing results..."

#### Statistics Cards
- **Attacks Tested**: Number of security tests executed
- **Compliance Score**: Real-time SOC2 compliance percentage
- **Restraint Status**: Shows if the test is paused for authentication or HITL approval

#### AI Actions Log
The dashboard displays real-time logs of:
- Which security tools are being executed
- Current attack being tested
- Findings as they're discovered
- AI decision-making process

#### Live Findings
- Vulnerabilities appear as they're discovered
- Color-coded by severity (Critical, High, Medium, Low, Info)
- Shows affected components and remediation advice

#### SOC2 Control Mapping
- Real-time mapping of findings to SOC2 Trust Service Criteria
- Shows which controls are covered by the tests
- Updates as new tests complete

### 3. Final Report View

After completion, the dashboard shows:
- **Overall Security Score**
- **Total Vulnerabilities by Severity**
- **Detailed Findings** with:
  - Description
  - CVSS scores
  - Evidence/payloads
  - Remediation steps
- **Full Test Logs**
- **Export Options** (JSON report)

## WebSocket Real-Time Updates

The dashboard uses WebSocket connections to provide real-time updates without refreshing:
- Attack execution status
- Score changes
- New findings
- Phase transitions
- HITL requests
- Authentication prompts

## Example Workflow

1. Navigate to http://localhost:5173
2. Fill out the form:
   - Target: `https://sweetspot.so`
   - Scope: `security`
   - Type: `comprehensive`
   - Description: `Testing sweetspot.so with permission`
3. Click "Start Security Test"
4. Watch the real-time dashboard as:
   - Tests are executed
   - Findings appear
   - Score updates
   - Progress bar advances
5. Review the final report when complete

## Interactive Features

- **Pause/Resume**: Can pause tests if needed
- **HITL Approval**: Approve/deny high-risk tests when prompted
- **Auth Dialog**: Enter credentials if test requires authentication
- **Finding Details**: Click any finding for more information
- **Export Results**: Download full report as JSON

The dashboard provides complete visibility into the AI-driven security testing process, showing exactly what's happening at each step!