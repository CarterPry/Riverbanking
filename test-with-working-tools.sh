#!/bin/bash

echo "======================================"
echo "Testing AI with Working Tools"
echo "======================================"

# First, let's add a simple working tool to test the AI
cd backend

# Create a mock subdomain scanner that actually returns results
cat > src/tools/mockSubdomainScanner.ts << 'EOF'
export function mockSubdomainScan(domain: string): any {
  // Simulate finding subdomains
  if (domain.includes('sweetspot')) {
    return {
      findings: [
        {
          type: 'subdomain',
          severity: 'info',
          confidence: 0.95,
          title: 'Subdomain found: console.sweetspotgov.com',
          description: 'Active subdomain discovered with web service',
          evidence: { host: 'console.sweetspotgov.com', ip: '1.2.3.4' }
        },
        {
          type: 'subdomain', 
          severity: 'info',
          confidence: 0.95,
          title: 'Subdomain found: api.sweetspotgov.com',
          description: 'API endpoint subdomain discovered',
          evidence: { host: 'api.sweetspotgov.com', ip: '1.2.3.5' }
        },
        {
          type: 'subdomain',
          severity: 'info', 
          confidence: 0.85,
          title: 'Subdomain found: admin.sweetspotgov.com',
          description: 'Administrative panel subdomain',
          evidence: { host: 'admin.sweetspotgov.com', ip: '1.2.3.6' }
        }
      ],
      output: `console.sweetspotgov.com
api.sweetspotgov.com  
admin.sweetspotgov.com`
    };
  }
  return { findings: [], output: 'No subdomains found' };
}
EOF

cd ..

# Run a test with mock data to show AI adaptation
echo "Starting test to show AI adapting to findings..."
echo ""

# Create request
cat > ai-adaptation-test.json << 'EOF'
{
  "target": "sweetspotgov.com",
  "userIntent": "Find all subdomains and then adapt your strategy based on what you discover. If you find API endpoints, focus on API testing. If you find admin panels, test for authentication issues.",
  "constraints": {
    "environment": "development"
  }
}
EOF

# Start backend
pkill -f "tsx watch" || true
cd backend && npm run dev > ../ai-adaptation.log 2>&1 &
BACKEND_PID=$!
cd ..
sleep 5

# Execute test
echo "Sending adaptive enumeration request..."
RESPONSE=$(curl -s -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -d @ai-adaptation-test.json)

WORKFLOW_ID=$(echo "$RESPONSE" | jq -r '.result.workflowId' 2>/dev/null)
echo "Workflow: $WORKFLOW_ID"

# Monitor for 30 seconds
echo ""
echo "Monitoring AI adaptation..."
tail -f ai-adaptation.log | grep -E "(reasoning|Adapting|Based on|discovered|strategy)" &
TAIL_PID=$!

sleep 30
kill $TAIL_PID 2>/dev/null

# Show what AI decided
echo ""
echo "AI Decisions Made:"
grep -A5 -B5 "reasoning" ai-adaptation.log | tail -20

kill $BACKEND_PID 2>/dev/null
rm -f ai-adaptation-test.json

echo ""
echo "This demonstrates how the AI would adapt if tools were working properly!"