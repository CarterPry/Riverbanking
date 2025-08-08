#!/bin/bash

# ULTIMATE MONITORING SCRIPT - Shows EVERYTHING in real-time
# This monitors multiple log sources simultaneously

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
NC='\033[0m'

clear

echo -e "${WHITE}=== COMPREHENSIVE SYSTEM MONITOR ===${NC}"
echo "Monitoring ALL activity: AI, API calls, Docker containers, Tools, Workflows"
echo "Press Ctrl+C to exit"
echo ""

# Function to monitor backend logs
monitor_backend() {
    echo -e "${YELLOW}=== BACKEND ACTIVITY ===${NC}"
    tail -f backend/logs/app.log 2>/dev/null | while read line; do
        # Show raw line first
        echo -e "${GRAY}[BACKEND]${NC} $line"
        
        # Also extract and highlight key information
        if echo "$line" | grep -q '"event":"attack_execution"'; then
            tool=$(echo "$line" | grep -o '"tool":"[^"]*"' | cut -d'"' -f4)
            status=$(echo "$line" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
            echo -e "  ${RED}→ ATTACK:${NC} $tool - $status"
        fi
        
        if echo "$line" | grep -q '"module":"DockerService"'; then
            container=$(echo "$line" | grep -o 'container: [^ ]*' | cut -d' ' -f2)
            echo -e "  ${MAGENTA}→ DOCKER:${NC} $container"
        fi
        
        if echo "$line" | grep -q '"module":"IntentClassifier"'; then
            if echo "$line" | grep -q "Top security test matches"; then
                matches=$(echo "$line" | grep -o '"totalMatches":[0-9]*' | cut -d':' -f2)
                echo -e "  ${CYAN}→ AI CLASSIFICATION:${NC} Found $matches security tests"
            fi
        fi
    done
}

# Function to monitor API calls
monitor_api() {
    echo -e "${GREEN}=== API CALLS ===${NC}"
    # Monitor both backend and frontend for API activity
    tail -f backend/logs/app.log 2>/dev/null | grep -E "POST|GET|PUT|DELETE|api/|Request.*logging" | while read line; do
        echo -e "${GREEN}[API]${NC} $line"
    done
}

# Function to monitor Docker
monitor_docker() {
    echo -e "${MAGENTA}=== DOCKER CONTAINERS ===${NC}"
    while true; do
        docker ps --filter "name=soc2-test" --format "table {{.Names}}\t{{.Status}}\t{{.Command}}" 2>/dev/null | grep -v NAMES | while read line; do
            echo -e "${MAGENTA}[DOCKER]${NC} $line"
        done
        sleep 2
    done
}

# Function to show summary
show_summary() {
    while true; do
        clear
        echo -e "${WHITE}=== LIVE ACTIVITY SUMMARY ===${NC}"
        echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
        echo ""
        
        # Count recent activities
        RECENT_LOGS=$(tail -100 backend/logs/app.log 2>/dev/null)
        
        echo "Recent Activity (last 100 events):"
        echo -n "  AI Classifications: "
        echo "$RECENT_LOGS" | grep -c "IntentClassifier"
        
        echo -n "  Embeddings Generated: "
        echo "$RECENT_LOGS" | grep -c "embedding_generation"
        
        echo -n "  Attacks Executed: "
        echo "$RECENT_LOGS" | grep -c "attack_execution"
        
        echo -n "  Docker Containers: "
        docker ps --filter "name=soc2-test" -q 2>/dev/null | wc -l
        
        echo -n "  API Calls: "
        echo "$RECENT_LOGS" | grep -cE "POST|GET|api/"
        
        echo ""
        echo "Active Workflows:"
        echo "$RECENT_LOGS" | grep -o '"workflowId":"[^"]*"' | sort -u | tail -5
        
        sleep 5
    done
}

# Main monitoring
echo "Choose monitoring mode:"
echo "1) Show EVERYTHING (raw logs)"
echo "2) Show API calls only"
echo "3) Show Docker activity only"
echo "4) Show AI/Classification only"
echo "5) Split screen - all monitors"
echo "6) Summary dashboard"
echo ""
read -p "Select option (1-6): " choice

case $choice in
    1)
        # Show everything
        tail -f backend/logs/app.log
        ;;
    2)
        # API calls only
        monitor_api
        ;;
    3)
        # Docker only
        monitor_docker
        ;;
    4)
        # AI/Classification only
        tail -f backend/logs/app.log | grep -E "IntentClassifier|embedding|classification|AI"
        ;;
    5)
        # Split screen using tmux if available
        if command -v tmux &> /dev/null; then
            tmux new-session -d -s monitor
            tmux split-window -h
            tmux split-window -v
            tmux select-pane -t 0
            tmux split-window -v
            
            tmux send-keys -t 0 "tail -f backend/logs/app.log | grep -E 'IntentClassifier|embedding'" C-m
            tmux send-keys -t 1 "tail -f backend/logs/app.log | grep -E 'attack_execution|tool'" C-m
            tmux send-keys -t 2 "tail -f backend/logs/app.log | grep -E 'DockerService|container'" C-m
            tmux send-keys -t 3 "tail -f backend/logs/app.log | grep -E 'api/|POST|GET'" C-m
            
            tmux attach-session -t monitor
        else
            echo "tmux not found. Showing all logs instead:"
            tail -f backend/logs/app.log
        fi
        ;;
    6)
        # Summary dashboard
        show_summary
        ;;
    *)
        echo "Invalid choice. Showing everything:"
        tail -f backend/logs/app.log
        ;;
esac