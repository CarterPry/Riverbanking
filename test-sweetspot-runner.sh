#!/bin/bash

# Sweetspot.so Authorized Security Testing Script
# This target has explicit permission and established RoE

echo "🎯 Sweetspot.so Security Testing Runner"
echo "======================================"
echo "✅ Authorized target with established RoE"
echo ""

# Set the API URL
API_URL="${API_URL:-http://localhost:3000/api}"

# Function to run a test
run_test() {
    local target="$1"
    local scope="$2"
    local description="$3"
    local test_type="${4:-quick}"
    
    echo "🔍 Testing: $target"
    echo "📋 Scope: $scope"
    echo "📝 Description: $description"
    echo "⚡ Type: $test_type"
    
    curl -X POST "$API_URL/run-soc2-workflow" \
        -H "Content-Type: application/json" \
        -d '{
            "target": "'"$target"'",
            "scope": "'"$scope"'",
            "description": "'"$description"'",
            "template": "security-'"$test_type"'"
        }' | jq .
    
    echo ""
}

# Main menu
if [ "$1" == "quick" ]; then
    echo "Running quick scan..."
    run_test "https://sweetspot.so" "security" "Quick security scan of sweetspot.so - authorized" "quick"
elif [ "$1" == "full" ]; then
    echo "Running comprehensive test..."
    run_test "https://sweetspot.so" "comprehensive" "Full security assessment of sweetspot.so - authorized" "comprehensive"
elif [ "$1" == "api" ]; then
    echo "Running API test..."
    run_test "https://api.sweetspot.so" "security" "API security testing - authorized" "comprehensive"
elif [ "$1" == "app" ]; then
    echo "Running app subdomain test..."
    run_test "https://app.sweetspot.so" "security" "App subdomain security test - authorized" "comprehensive"
else
    echo "Usage: $0 [quick|full|api|app]"
    echo ""
    echo "Examples:"
    echo "  $0 quick  - Run a quick security scan"
    echo "  $0 full   - Run a comprehensive security test"
    echo "  $0 api    - Test API endpoints"
    echo "  $0 app    - Test app subdomain"
    echo ""
    echo "Or use the Node/Python runners for more options:"
    echo "  node test-user-input-runner.js --scenario 'Basic Public Website Security Scan'"
    echo "  python3 test-user-input-runner.py --scenario 'Basic Public Website Security Scan'"
fi