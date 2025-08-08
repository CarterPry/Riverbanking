# AI Security Planning Test Guide

## Overview

This guide explains how to run incremental tests to observe the AI's initial planning, thought process, and first steps when given security testing instructions.

## Test Scenario

**Target URL:** `https://sweetspotgov.com`

**User Instructions:** "I want you to test against all subdomains and dir's. Test all access, stuff like sql injection, sending JWT tokens, catching any leaky api's stuff like this."

## Available Test Scripts

### 1. Quick Test (`test-ai-first-step.sh`)
- **Purpose:** Quickly send a test request and capture the initial AI response
- **Output:** JSON file with AI's initial planning
- **Runtime:** ~10 seconds

```bash
./test-ai-first-step.sh
```

### 2. Incremental Test (`incremental-ai-test.js`)
- **Purpose:** Detailed monitoring with WebSocket connection to capture real-time AI thoughts
- **Output:** Comprehensive JSON with all AI communications
- **Runtime:** ~30 seconds per scenario

```bash
# Run default scenario
node incremental-ai-test.js

# Run specific scenario
node incremental-ai-test.js --scenario=initial-planning

# Run all scenarios
node incremental-ai-test.js --all
```

### 3. Visual Monitor (`monitor-ai-planning.py`)
- **Purpose:** Rich console output showing AI's thought process in real-time
- **Output:** Visual display + JSON file
- **Runtime:** Variable (monitors until completion)

```bash
# Default target (sweetspotgov.com)
python3 monitor-ai-planning.py

# Custom target
python3 monitor-ai-planning.py --target "https://example.com" --description "Your test objectives"
```

### 4. Master Runner (`run-ai-planning-test.sh`)
- **Purpose:** Interactive menu to run any test type
- **Output:** Guided test execution

```bash
# Interactive menu
./run-ai-planning-test.sh

# Direct execution
./run-ai-planning-test.sh --quick    # Run quick test
./run-ai-planning-test.sh --detailed # Run Node.js test
./run-ai-planning-test.sh --visual   # Run Python monitor
./run-ai-planning-test.sh --all      # Run all tests
```

## What the AI Will Plan

When given the test instructions, the AI typically follows this planning process:

### Phase 1: Initial Classification
- Analyzes user intent
- Determines scope and objectives
- Identifies key security areas to test

### Phase 2: Strategy Development
The AI will typically plan:

1. **Reconnaissance Phase**
   - Subdomain enumeration
   - Directory discovery
   - Technology stack identification
   - API endpoint discovery

2. **Vulnerability Assessment**
   - SQL injection testing
   - Authentication bypass attempts
   - JWT token analysis
   - API security testing
   - Information disclosure checks

3. **Exploitation Planning**
   - Prioritization of findings
   - Safe exploitation strategies
   - Impact assessment

### Expected First Step

The AI usually starts with one of these actions:

1. **Subdomain Enumeration** - Using tools like subfinder or amass
2. **Port Scanning** - nmap to identify open services
3. **Directory Bruteforcing** - gobuster or dirb for path discovery
4. **Technology Detection** - whatweb or wappalyzer

## Output Analysis

### Viewing AI Thoughts
```bash
# From JSON output
cat ai-test-outputs/ai-first-step-*.json | jq '.aiThoughts'
```

### Viewing Test Plan
```bash
# See the complete test plan
cat ai-test-outputs/ai-analysis-*.json | jq '.testPlan'

# See just the first step
cat ai-test-outputs/ai-analysis-*.json | jq '.testPlan.steps[0]'
```

### Understanding AI Reasoning
```bash
# View AI's strategic reasoning
cat ai-test-outputs/ai-analysis-*.json | jq '.statusResponse.aiPlan.reasoning'
```

## Prerequisites

### Required Software
- Node.js and npm
- Python 3.x
- jq (for JSON formatting)
- Backend server running on port 8001

### Installing Dependencies

```bash
# Node.js dependencies
npm install node-fetch uuid ws

# Python dependencies
pip3 install rich websockets aiohttp

# Start the backend (if not running)
cd backend && npm start
```

## Interpreting Results

### AI Planning Components

1. **Intent Classification**
   - How the AI understood your request
   - Confidence level in interpretation

2. **Strategic Reasoning**
   - Why certain tests were prioritized
   - Risk assessment
   - Expected outcomes

3. **Test Sequence**
   - Ordered list of security tests
   - Dependencies between tests
   - Estimated duration

4. **Safety Considerations**
   - Measures to prevent damage
   - Compliance with testing scope
   - Rate limiting and throttling

### Example Output Structure

```json
{
  "workflowId": "uuid",
  "aiThoughts": [
    {
      "phase": "classification",
      "thought": "User wants comprehensive security testing including subdomain enumeration, SQL injection, JWT analysis..."
    },
    {
      "phase": "strategy",
      "thought": "Starting with reconnaissance to map attack surface, then moving to targeted vulnerability testing..."
    }
  ],
  "testPlan": {
    "steps": [
      {
        "tool": "subfinder",
        "purpose": "Enumerate all subdomains of sweetspotgov.com",
        "priority": "critical",
        "expectedOutcome": "List of active subdomains for further testing"
      }
    ]
  }
}
```

## Troubleshooting

### Backend Not Running
```bash
cd backend && npm start
```

### WebSocket Connection Failed
- Check if port 8001 is available
- Ensure backend WebSocket server is enabled

### No AI Thoughts Captured
- Verify ANTHROPIC_API_KEY is set
- Check backend logs for AI service errors

### Missing Dependencies
```bash
# Check and install all dependencies
npm install
pip3 install -r requirements.txt
```

## Advanced Usage

### Custom Test Scenarios

Edit `incremental-ai-test.js` to add new scenarios:

```javascript
{
  id: 'custom-test',
  name: 'Your Custom Test',
  request: {
    target: 'https://your-target.com',
    description: 'Your specific requirements',
    // ... other options
  }
}
```

### Monitoring Multiple Workflows

Run multiple monitors in parallel:

```bash
# Terminal 1
python3 monitor-ai-planning.py --target "https://site1.com"

# Terminal 2  
python3 monitor-ai-planning.py --target "https://site2.com"
```

## Security Notes

⚠️ **Important:** 
- Only test against authorized targets
- Ensure you have permission to test
- Follow responsible disclosure practices
- Rate limit your tests appropriately

## Support

For issues or questions:
1. Check the backend logs: `tail -f backend/logs/*.log`
2. View WebSocket traffic: `./monitor-ai-websocket.html`
3. Review AI decision logs: `cat backend/logs/ai-decisions.log`