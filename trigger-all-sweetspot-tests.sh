#!/bin/bash

# Direct API call to trigger ALL security tests for Sweetspot

echo "Triggering comprehensive Sweetspot security assessment..."
echo "Target: https://console.sweetspotgov.com"
echo ""

# Make the API request with explicit test requirements
curl -X POST http://localhost:3000/api/run-soc2-workflow \
  -H "Content-Type: application/json" \
  -d '{
    "target": "https://console.sweetspotgov.com",
    "scope": "comprehensive",
    "description": "I need you to perform EVERY SINGLE security test available on https://console.sweetspotgov.com. This is critical - run ALL 19 security tests, not just 4. Specifically test: (1) SQL injection on the login form at /auth/login using time-based, union-based, and error-based techniques on all parameters, cookies, and headers. (2) JWT token vulnerabilities including algorithm confusion, none algorithm, weak secrets, and signature stripping. (3) All subdomain enumeration and testing: api.sweetspotgov.com, admin.sweetspotgov.com, portal.sweetspotgov.com, secure.sweetspotgov.com, auth.sweetspotgov.com, internal.sweetspotgov.com. (4) Directory traversal to find .git/, .env, /admin/, /backup/, /api/. (5) API security on all endpoints including authorization bypass, excessive data exposure, and rate limiting. (6) LinkedIn OAuth integration vulnerabilities. (7) Authentication bypass attempts. (8) Information disclosure in error messages. (9) CORS misconfiguration. (10) Session management flaws. Run EVERY test at maximum depth and thoroughness. This is a penetration test with full authorization.",
    "template": "security-comprehensive",
    "options": {
      "progressive": false,
      "maxConcurrent": 10,
      "timeout": 300000
    }
  }' | jq '.'

echo ""
echo "To monitor progress, run: ./monitor-ai-communication.sh"
echo "To view results, check: backend/logs/app.log"