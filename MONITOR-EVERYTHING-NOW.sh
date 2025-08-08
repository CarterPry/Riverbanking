#!/bin/bash

# THE ULTIMATE MONITOR - Shows EVERYTHING from all possible log sources

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

clear

echo -e "${WHITE}=== ULTIMATE SYSTEM MONITOR - SHOWS EVERYTHING ===${NC}"
echo ""

# Find the most recent log file
LATEST_LOG=""

# Check for backend-live.log (if backend was started with tee)
if [ -f "logs/backend-live.log" ]; then
    LATEST_LOG="logs/backend-live.log"
    echo -e "${GREEN}✓ Found live backend log: $LATEST_LOG${NC}"
fi

# Check for any recent log files
RECENT_LOG=$(find . -name "*.log" -type f -mmin -60 2>/dev/null | grep -v node_modules | head -1)
if [ -n "$RECENT_LOG" ] && [ -z "$LATEST_LOG" ]; then
    LATEST_LOG="$RECENT_LOG"
    echo -e "${YELLOW}✓ Found recent log: $LATEST_LOG${NC}"
fi

# If no logs found, provide instructions
if [ -z "$LATEST_LOG" ]; then
    echo -e "${RED}⚠️  NO ACTIVE LOG FILES FOUND${NC}"
    echo ""
    echo "The backend is logging to console, not files!"
    echo ""
    echo -e "${YELLOW}TO SEE ALL LOGS, YOU MUST:${NC}"
    echo ""
    echo "1. Stop the current backend (Ctrl+C in its terminal)"
    echo ""
    echo "2. Restart it with log capture:"
    echo -e "   ${GREEN}cd backend && npm run dev 2>&1 | tee ../logs/backend-live.log${NC}"
    echo ""
    echo "3. Then run this monitor again"
    echo ""
    echo "OR if backend is running in another terminal:"
    echo "- Look at that terminal to see the logs directly"
    echo ""
    exit 1
fi

# Monitor the log file
echo ""
echo -e "${GREEN}Monitoring: $LATEST_LOG${NC}"
echo -e "${YELLOW}Showing EVERYTHING: AI calls, Docker, Tools, API requests${NC}"
echo ""
echo "Key patterns to watch for:"
echo "  • IntentClassifier = AI classification"
echo "  • embedding = AI embeddings" 
echo "  • attack_execution = Security tool execution"
echo "  • DockerService = Container operations"
echo "  • ToolHandler = Tool execution"
echo "  • workflowId = Workflow tracking"
echo ""
echo "Press Ctrl+C to exit"
echo "─────────────────────────────────────────────────────────────────"
echo ""

# Function to format and highlight log entries
format_log() {
    while IFS= read -r line; do
        # Try to extract JSON fields
        timestamp=$(echo "$line" | grep -o '"timestamp":"[^"]*"' | cut -d'"' -f4)
        level=$(echo "$line" | grep -o '"level":"[^"]*"' | cut -d'"' -f4)
        module=$(echo "$line" | grep -o '"module":"[^"]*"' | cut -d'"' -f4)
        message=$(echo "$line" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
        event=$(echo "$line" | grep -o '"event":"[^"]*"' | cut -d'"' -f4)
        
        # Format timestamp
        if [ -n "$timestamp" ]; then
            printf "${CYAN}[%s]${NC} " "$(echo $timestamp | cut -d' ' -f2 | cut -d'.' -f1)"
        fi
        
        # Highlight based on content
        if [[ "$module" == "IntentClassifier" ]]; then
            echo -e "${YELLOW}[AI-CLASSIFY]${NC} $message"
            if echo "$line" | grep -q "topMatches"; then
                echo "$line" | grep -o '"topMatches":\[[^]]*\]' | sed 's/,/\n  /g'
            fi
        elif [[ "$event" == "attack_execution" ]]; then
            tool=$(echo "$line" | grep -o '"tool":"[^"]*"' | cut -d'"' -f4)
            status=$(echo "$line" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
            echo -e "${RED}[ATTACK-$status]${NC} Tool: $tool"
        elif [[ "$module" == "DockerService" ]]; then
            echo -e "${MAGENTA}[DOCKER]${NC} $message"
            if echo "$line" | grep -q "container:"; then
                container=$(echo "$line" | grep -o 'container: [^ ]*' | cut -d' ' -f2)
                echo -e "  ${MAGENTA}→ Container: $container${NC}"
            fi
        elif [[ "$module" == "ToolHandler" ]]; then
            echo -e "${GREEN}[TOOL]${NC} $message"
        elif echo "$line" | grep -q "embedding"; then
            echo -e "${BLUE}[EMBEDDING]${NC} $message"
        elif echo "$line" | grep -q "api/\|POST\|GET"; then
            echo -e "${CYAN}[API]${NC} $line"
        else
            # Show full line for anything else
            echo "$line"
        fi
        
        # Add spacing for readability
        if [[ "$event" == "attack_execution" ]] || [[ "$module" == "IntentClassifier" ]]; then
            echo ""
        fi
    done
}

# Start monitoring
tail -f "$LATEST_LOG" 2>/dev/null | format_log