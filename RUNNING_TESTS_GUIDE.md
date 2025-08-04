# Running Test User Inputs Guide

## Prerequisites

Before running the test scripts, ensure you have the application running:

### 1. Start the Backend Services

```bash
# Start all services using Docker Compose
docker-compose up -d

# Or start just the backend
cd backend
npm install
npm run dev
```

### 2. Verify the API is Running

```bash
# Check API health
curl http://localhost:3000/api/health

# Or check status
curl http://localhost:3000/api/status
```

## Running the Test Scripts

### Using Node.js Script

```bash
# Install axios if not already installed
npm install axios

# List available test scenarios
node test-user-input-runner.js --list

# Run all tests
node test-user-input-runner.js

# Run a specific test
node test-user-input-runner.js --scenario "Basic Public Website Security Scan"
```

### Using Python Script

```bash
# Install requests if not already installed
pip3 install requests

# List available test scenarios
python3 test-user-input-runner.py --list

# Run all tests
python3 test-user-input-runner.py

# Run with report generation
python3 test-user-input-runner.py --report --save-results

# Run only quick scans
python3 test-user-input-runner.py --quick

# Run a specific test
python3 test-user-input-runner.py --scenario "E-commerce Platform Test"
```

## Troubleshooting

### Connection Errors

If you see errors like:
```
HTTPConnectionPool(host='localhost', port=3000): Max retries exceeded
```

This means the API server is not running. Solutions:
1. Start the backend server: `cd backend && npm run dev`
2. Check if the server is running on a different port
3. Update the API_URL environment variable: `API_URL=http://localhost:YOUR_PORT/api`

### Proxy Errors

If you see proxy-related errors:
```bash
# Disable proxy for local testing
unset http_proxy
unset https_proxy
unset HTTP_PROXY
unset HTTPS_PROXY

# Then run the tests again
python3 test-user-input-runner.py
```

### Module Errors (Node.js)

If you see:
```
ReferenceError: require is not defined in ES module scope
```

This is already fixed in the updated script. Make sure you're using the latest version.

## Expected Output

When running successfully, you should see:

```
🚀 Starting Security Platform Test Suite
=====================================

📋 Running Test Scenarios...

🔍 Running: Basic Public Website Security Scan
📝 Description: Quick security scan of a public-facing website
📤 Payload: {
  "target": "https://example.com",
  "scope": "/*",
  "description": "Basic security assessment of main website",
  "template": "security-quick"
}
✅ Success! Workflow ID: abc-123-def-456
📊 Status: pending

[... more tests ...]

📊 Test Summary
===============
Total Tests: 14
✅ Successful: 12
❌ Failed: 2
```

## Using Test Results

The test scripts will:
1. Submit test workflows to your platform
2. Return workflow IDs for tracking
3. Generate reports (Python script)
4. Save results to JSON files (Python script with --save-results)

You can then:
1. Check workflow status in the Dashboard UI
2. View detailed security reports
3. Monitor test progress in real-time
4. Analyze failed tests for debugging

## Custom API Endpoint

If your API is running on a different URL:

```bash
# Set custom API URL
export API_URL=http://your-api-url:port/api

# Run tests
node test-user-input-runner.js
# or
python3 test-user-input-runner.py
```