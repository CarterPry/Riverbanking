# Comprehensive Sweetspot Security Testing Guide

This guide explains how to run a comprehensive security assessment on https://console.sweetspotgov.com including all subdomains, directories, SQL injection, JWT tokens, and API security testing.

## Background

Based on your initial test results, the system only ran 4 out of 19 matched security tests:
- Blind SQL Injection - 0 findings
- SSL/TLS Analysis - 0 findings  
- API Security Scan - 0 findings
- XSS Detection - 0 findings

This guide will help you run a more comprehensive test that covers all the areas you specified.

## Test Scope

The comprehensive test will cover:

1. **Subdomain Enumeration**
   - console.sweetspotgov.com (primary)
   - api.sweetspotgov.com
   - admin.sweetspotgov.com
   - portal.sweetspotgov.com
   - And other common subdomains

2. **SQL Injection**
   - All forms, especially `/auth/login`
   - URL parameters, POST data, cookies, headers
   - Time-based, union-based, and error-based techniques

3. **JWT Token Security**
   - Algorithm confusion attacks
   - None algorithm bypass
   - Signature manipulation
   - Token leakage detection

4. **API Security**
   - Endpoint enumeration
   - Authorization testing (IDOR)
   - Rate limiting tests
   - CORS configuration

5. **Directory/File Discovery**
   - Sensitive files (.git/, .env, backups)
   - Hidden directories
   - Configuration files
   - Source code disclosure

## Running the Comprehensive Test

### Method 1: Using the Test Runner Script (Recommended)

```bash
# 1. Enable enhanced logging
./enable-ai-debug-logging.sh
source ./set-ai-debug-env.sh

# 2. Start the backend if not running
cd backend && npm run dev
cd ..

# 3. Run the comprehensive test
./run-comprehensive-sweetspot-test.sh

# 4. Monitor in another terminal
./monitor-ai-communication.sh
```

### Method 2: Using the Enhanced Test Input

```bash
# 1. Read the enhanced test input
cat enhanced-sweetspot-test-input.txt

# 2. Copy and paste the content into your testing interface
# This input is specifically crafted to trigger all 19 security tests
```

### Method 3: Manual API Request

```bash
curl -X POST http://localhost:3000/api/workflows \
  -H "Content-Type: application/json" \
  -d @comprehensive-sweetspot-test.json
```

## Monitoring Test Progress

### Real-time Monitoring Options

1. **Terminal Monitor**
   ```bash
   ./monitor-ai-communication.sh
   # Select option 2 for real-time stream
   ```

2. **Web Dashboard**
   ```bash
   # Open in browser
   open ai-monitor-dashboard.html
   ```

3. **Direct Log Monitoring**
   ```bash
   # Watch classification progress
   tail -f backend/logs/app.log | jq 'select(.module == "IntentClassifier")'
   
   # Watch attack execution
   tail -f backend/logs/app.log | jq 'select(.event == "attack_execution")'
   ```

## Understanding Results

### Why Initial Test Had 0 Findings

Your initial test may have had 0 findings because:
1. **Limited Scope** - Only 4 out of 19 tests were executed
2. **Generic Targeting** - Tests may not have targeted specific vulnerabilities
3. **Authentication Required** - Some tests may need authenticated access
4. **Subdomain Coverage** - Tests may have missed vulnerable subdomains

### Expected Output from Comprehensive Test

The comprehensive test should:
1. **Run All 19 Security Tests** - Not just the top 4
2. **Test Multiple Subdomains** - api.*, admin.*, etc.
3. **Deep Parameter Testing** - All forms, headers, cookies
4. **Authentication Testing** - Including JWT and OAuth

### Interpreting Severity Levels

- **Critical**: Immediate risk, requires urgent attention
- **High**: Significant risk, should be fixed soon
- **Medium**: Moderate risk, plan for remediation
- **Low**: Minor risk, fix when convenient
- **Info**: Informational findings

## Specific Attack Configurations

### SQL Injection Testing
The test will inject payloads like:
- `' OR '1'='1`
- `'; DROP TABLE users; --`
- `1' AND SLEEP(5)--`

Into:
- Login form at `/auth/login`
- All URL parameters
- Cookie values
- HTTP headers

### JWT Token Testing
Tests include:
- Algorithm confusion (RS256 → HS256)
- None algorithm (`{"alg":"none"}`)
- Weak secret brute forcing
- Expired token acceptance

### API Security Testing
Coverage includes:
- `/api/v1/*` endpoints
- `/graphql` if present
- Authorization bypass attempts
- Rate limiting tests

## Troubleshooting

### If Tests Don't Run
1. Check backend is running: `curl http://localhost:3000/health`
2. Verify embeddings are loaded: `tail -f backend/logs/app.log | grep embedding`
3. Check for errors: `tail -f backend/logs/error.log`

### If No Vulnerabilities Found
1. Verify test scope includes target domain
2. Check if authentication is required
3. Review AI classification logs
4. Ensure all 19 tests are executed

### To Force All Tests
Modify your input to explicitly request each test type:
- "Test SQL injection on all parameters"
- "Check JWT token security vulnerabilities"
- "Scan all API endpoints for authorization issues"
- "Enumerate and test all subdomains"

## Security Notes

Since this is a government system containing CUI:
1. Ensure you have proper authorization
2. Monitor system impact during testing
3. Document all findings appropriately
4. Follow responsible disclosure practices

## Next Steps

After running the comprehensive test:
1. Review the results JSON file
2. Prioritize findings by severity
3. Verify findings manually if needed
4. Generate a detailed report
5. Plan remediation strategies

## Support

If the comprehensive test still shows 0 findings:
1. Check the AI monitoring dashboard for classification issues
2. Review the enhanced test input for completeness
3. Verify network connectivity to target
4. Ensure all security tools are properly configured