#!/bin/bash

# Comprehensive Security Test Runner for Sweetspot
# This script runs a full security assessment including subdomains, APIs, and JWT testing

echo "=== Comprehensive Sweetspot Security Assessment ==="
echo "Target: console.sweetspotgov.com"
echo "Scope: All subdomains, directories, APIs, and authentication mechanisms"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Enable verbose AI logging
echo -e "${YELLOW}Setting up enhanced logging...${NC}"
export LOG_LEVEL=debug
export AI_DEBUG=true
export LOG_AI_REQUESTS=true
export LOG_AI_RESPONSES=true

# Function to make API request with comprehensive test
run_comprehensive_test() {
    echo -e "${YELLOW}Submitting comprehensive security test...${NC}"
    
    # The test request that will trigger all security checks
    TEST_REQUEST='{
      "target": "https://console.sweetspotgov.com",
      "scope": "comprehensive",
      "description": "Perform comprehensive security testing on https://console.sweetspotgov.com including: 1. All subdomains enumeration and testing (api.*, admin.*, test.*, dev.*, etc.) 2. Directory traversal and hidden path discovery (/.git/, /admin/, /api/, /backup/, etc.) 3. SQL injection on all parameters, headers, and cookies (classic, blind, time-based, union) 4. JWT token security testing (algorithm confusion, weak secrets, signature stripping) 5. API security testing (broken authentication, excessive data exposure, CORS issues) 6. Authentication bypass attempts 7. Session management vulnerabilities 8. Information disclosure in error messages 9. Insecure direct object references 10. Rate limiting bypass attempts. Test authenticated and unauthenticated endpoints. Follow all redirects. Test depth 5. Run ALL 19 security tests, not just the top 4.",
      "template": "security-comprehensive",
      "options": {
        "progressive": false,
        "maxConcurrent": 10,
        "timeout": 300000
      }
    }'
    
    # Make the API request
    RESPONSE=$(curl -s -X POST http://localhost:3000/api/run-soc2-workflow \
        -H "Content-Type: application/json" \
        -d "$TEST_REQUEST")
    
    WORKFLOW_ID=$(echo $RESPONSE | jq -r '.workflowId // .id // empty')
    
    if [ -z "$WORKFLOW_ID" ]; then
        echo -e "${RED}Failed to start workflow${NC}"
        echo "Response: $RESPONSE"
        return 1
    fi
    
    echo -e "${GREEN}Workflow started: $WORKFLOW_ID${NC}"
    return 0
}

# Function to monitor test progress
monitor_progress() {
    local WORKFLOW_ID=$1
    echo -e "${YELLOW}Monitoring test progress...${NC}"
    
    # Open monitoring in new terminal if available
    if command -v gnome-terminal &> /dev/null; then
        gnome-terminal -- bash -c "./monitor-ai-communication.sh; exec bash"
    elif command -v xterm &> /dev/null; then
        xterm -e "./monitor-ai-communication.sh" &
    else
        echo "Run './monitor-ai-communication.sh' in another terminal to see detailed progress"
    fi
    
    # Monitor workflow status
    while true; do
        STATUS=$(curl -s http://localhost:3000/api/workflows/$WORKFLOW_ID | jq -r '.status // empty')
        
        case $STATUS in
            "running"|"in_progress")
                echo -ne "\rStatus: ${YELLOW}Running...${NC} Check monitor for details"
                ;;
            "completed")
                echo -e "\rStatus: ${GREEN}Completed${NC}                    "
                break
                ;;
            "failed")
                echo -e "\rStatus: ${RED}Failed${NC}                       "
                break
                ;;
            *)
                echo -ne "\rStatus: Checking..."
                ;;
        esac
        
        sleep 5
    done
}

# Function to fetch and display results
display_results() {
    local WORKFLOW_ID=$1
    echo ""
    echo -e "${YELLOW}Fetching test results...${NC}"
    
    # Get the full results
    RESULTS=$(curl -s http://localhost:3000/api/workflows/$WORKFLOW_ID/results)
    
    # Save full results
    echo "$RESULTS" > "sweetspot-test-results-$(date +%Y%m%d-%H%M%S).json"
    
    # Display summary
    echo ""
    echo -e "${GREEN}=== Test Summary ===${NC}"
    
    # Count findings by severity
    CRITICAL=$(echo "$RESULTS" | jq '[.findings[]? | select(.severity == "critical")] | length // 0')
    HIGH=$(echo "$RESULTS" | jq '[.findings[]? | select(.severity == "high")] | length // 0')
    MEDIUM=$(echo "$RESULTS" | jq '[.findings[]? | select(.severity == "medium")] | length // 0')
    LOW=$(echo "$RESULTS" | jq '[.findings[]? | select(.severity == "low")] | length // 0')
    INFO=$(echo "$RESULTS" | jq '[.findings[]? | select(.severity == "info")] | length // 0')
    
    echo "Critical: $CRITICAL"
    echo "High: $HIGH"
    echo "Medium: $MEDIUM"
    echo "Low: $LOW"
    echo "Info: $INFO"
    echo ""
    
    # Display critical and high findings
    if [ "$CRITICAL" -gt 0 ] || [ "$HIGH" -gt 0 ]; then
        echo -e "${RED}=== Critical/High Findings ===${NC}"
        echo "$RESULTS" | jq -r '.findings[]? | select(.severity == "critical" or .severity == "high") | "[\(.severity)] \(.title // .type) - \(.description // .message)"'
    fi
    
    echo ""
    echo "Full results saved to: sweetspot-test-results-$(date +%Y%m%d-%H%M%S).json"
}

# Main execution
main() {
    # Check if backend is running
    if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
        echo -e "${RED}Backend is not running. Please start it first:${NC}"
        echo "cd backend && npm run dev"
        exit 1
    fi
    
    # Run the comprehensive test
    if run_comprehensive_test; then
        # Extract workflow ID from the response
        WORKFLOW_ID=$(echo $RESPONSE | jq -r '.workflowId // .id // empty')
        
        # Monitor progress
        monitor_progress "$WORKFLOW_ID"
        
        # Display results
        display_results "$WORKFLOW_ID"
    else
        echo -e "${RED}Failed to start security test${NC}"
        exit 1
    fi
}

# Run main function
main

echo ""
echo -e "${GREEN}Test complete!${NC}"
echo "To view detailed AI communication logs, run: ./monitor-ai-communication.sh"
echo "To view the web dashboard, open: ai-monitor-dashboard.html"