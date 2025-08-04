# Test User Input Templates

This directory contains test user input templates and scripts for validating the security testing platform functionality.

## Files Overview

- **test-user-inputs.json** - Comprehensive collection of test scenarios, edge cases, and performance test data
- **test-user-input-runner.js** - Node.js script for running tests programmatically
- **test-user-input-runner.py** - Python script with advanced features for test execution

## Test Input Structure

Each test input follows this structure:

```json
{
  "target": "https://example.com",          // URL to test (required)
  "scope": "/api/*, /admin/*",              // URL patterns to include (required)
  "description": "Security assessment",      // Test description (optional)
  "testType": "quick|comprehensive",        // Type of test (required)
  "username": "user@example.com",           // For authenticated testing (optional)
  "password": "SecurePass123"               // For authenticated testing (optional)
}
```

## Test Categories

### 1. Regular Test Scenarios
- Basic Public Website Security Scan
- Comprehensive API Security Test
- Admin Portal Security Assessment
- Mobile API Security Test
- E-commerce Platform Test
- Internal Application Test
- SaaS Multi-tenant Application
- Healthcare Portal Compliance Test
- Development Environment Quick Scan
- Microservices Architecture Test

### 2. Edge Cases
- Invalid URL Format
- IP Address Target
- Empty Authentication
- Special Characters in Scope

### 3. Performance Test Batch
- Multiple targets for load testing

## Using the Test Scripts

### Node.js Runner

```bash
# Install dependencies
npm install axios

# Run all tests
node test-user-input-runner.js

# List available scenarios
node test-user-input-runner.js --list

# Run specific scenario
node test-user-input-runner.js --scenario "Basic Public Website Security Scan"
```

### Python Runner

```bash
# Install dependencies
pip install requests

# Run all tests
python test-user-input-runner.py

# List scenarios
python test-user-input-runner.py --list

# Run specific scenario
python test-user-input-runner.py --scenario "Comprehensive API Security Test"

# Run only quick scans
python test-user-input-runner.py --quick

# Run edge cases only
python test-user-input-runner.py --edge-cases-only

# Generate detailed report
python test-user-input-runner.py --report --save-results
```

## Manual Testing

You can also use these inputs manually by:

1. Starting the application
2. Navigating to the form page
3. Copying values from test-user-inputs.json
4. Submitting the form

## Expected Behaviors

Each test scenario includes an `expected_behavior` field that describes what should happen when the test is run. This helps validate that the platform is functioning correctly.

## Customizing Tests

To add new test scenarios:

1. Edit `test-user-inputs.json`
2. Add your scenario to the appropriate section
3. Follow the existing structure
4. Include meaningful descriptions and expected behaviors

## API Endpoints

The scripts interact with these endpoints:
- `POST /api/workflows` - Submit new security test
- `GET /api/workflows/{id}/status` - Check test status
- `GET /api/health` - Check API health

## Environment Variables

- `API_URL` - Base URL for the API (default: http://localhost:3000/api)

## Test Results

Both scripts provide:
- Real-time progress updates
- Success/failure tracking
- Workflow IDs for successful tests
- Detailed error messages for failures
- Summary statistics

The Python script additionally offers:
- JSON result export
- Detailed text reports
- Timestamp tracking
- Batch filtering options