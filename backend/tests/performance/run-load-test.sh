#!/bin/bash

# Load test runner script

echo "🚀 Starting SOC2 Workflow Load Test"
echo "=================================="

# Check if server is running
if ! curl -s http://localhost:3000/api/health > /dev/null; then
  echo "❌ Error: Backend server is not running on port 3000"
  echo "Please start the backend server first: npm run dev"
  exit 1
fi

# Check if Artillery is installed
if ! command -v artillery &> /dev/null; then
  echo "❌ Error: Artillery is not installed"
  echo "Please install Artillery: npm install -g artillery"
  exit 1
fi

# Create report directory
mkdir -p reports

# Run the load test
echo "📊 Running load test with 10 concurrent workflows..."
echo ""

artillery run tests/performance/load.yml \
  --output reports/load-test-$(date +%Y%m%d-%H%M%S).json

# Generate HTML report
if [ -f reports/load-test-*.json ]; then
  latest_report=$(ls -t reports/load-test-*.json | head -1)
  artillery report $latest_report --output reports/load-test-report.html
  echo ""
  echo "✅ Load test complete!"
  echo "📄 HTML report generated: reports/load-test-report.html"
else
  echo "❌ Failed to generate report"
fi

echo ""
echo "Test Summary:"
echo "- Warm up: 5 req/s for 60s"
echo "- Ramp up: 10 req/s for 120s" 
echo "- Peak load: 20 req/s for 60s"
echo "- Total duration: 4 minutes"
echo "- Scenarios: Basic (60%), Auth Required (30%), HITL (10%)" 