#!/bin/bash

# Enhanced real-time monitoring for security scans
# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to get container progress
get_container_progress() {
    local container=$1
    local logs=$(docker logs "$container" 2>&1 | tail -5)
    local progress=""
    
    # Check for common progress indicators
    if echo "$logs" | grep -q "Testing"; then
        progress=$(echo "$logs" | grep -o '[0-9]\+%' | tail -1)
    elif echo "$logs" | grep -q "Progress"; then
        progress=$(echo "$logs" | grep -o '[0-9]\+/[0-9]\+' | tail -1)
    fi
    
    echo "${progress:-Running...}"
}

# Main monitoring loop
while true; do
    clear
    echo -e "${GREEN}=== SOC2 Security Testing Monitor - LIVE ===${NC}"
    echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    
    # Backend Status
    echo -e "${YELLOW}Backend Status:${NC}"
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        echo -e "  API: ${GREEN}✓ Online${NC}"
        
        # Get active workflows
        WORKFLOWS=$(curl -s http://localhost:3000/api/workflows 2>/dev/null | jq -r '.[] | select(.status == "running") | .workflowId' 2>/dev/null || echo "")
        if [ -n "$WORKFLOWS" ]; then
            echo -e "  Active Workflows: ${GREEN}$(echo "$WORKFLOWS" | wc -l | tr -d ' ')${NC}"
        else
            echo -e "  Active Workflows: ${YELLOW}0${NC}"
        fi
    else
        echo -e "  API: ${RED}✗ Offline${NC}"
    fi
    
    # WebSocket Connections
    WS_CONN=$(lsof -i :3000 2>/dev/null | grep ESTABLISHED | wc -l | tr -d ' ')
    echo -e "  WebSocket Clients: $WS_CONN"
    echo ""
    
    # Docker Containers
    echo -e "${YELLOW}Active Security Scans:${NC}"
    CONTAINERS=$(docker ps --filter "name=soc2-test" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" 2>/dev/null | tail -n +2)
    
    if [ -z "$CONTAINERS" ]; then
        echo -e "  ${YELLOW}No active scans${NC}"
    else
        echo "$CONTAINERS" | while read -r line; do
            NAME=$(echo "$line" | awk '{print $1}')
            IMAGE=$(echo "$line" | awk '{print $2}')
            STATUS=$(echo "$line" | awk '{$1=$2=""; print $0}' | sed 's/^ *//')
            PROGRESS=$(get_container_progress "$NAME")
            
            # Determine tool type from image
            TOOL=""
            case "$IMAGE" in
                *sqlmap*) TOOL="SQL Injection" ;;
                *zap*) TOOL="Web Security" ;;
                *testssl*) TOOL="SSL/TLS Analysis" ;;
                *nmap*) TOOL="Port Scanning" ;;
                *nikto*) TOOL="Web Server Scan" ;;
                *) TOOL="Security Test" ;;
            esac
            
            echo -e "  ${BLUE}$TOOL${NC}"
            echo "    Container: $NAME"
            echo "    Status: $STATUS"
            echo "    Progress: $PROGRESS"
            echo ""
        done
    fi
    
    # Recent Findings
    echo -e "${YELLOW}Recent Findings (Last 5 min):${NC}"
    RECENT_LOGS=$(docker ps -a --filter "since=5m" --filter "name=soc2-test" --format "{{.Names}}" | \
        xargs -I {} sh -c 'docker logs {} 2>&1 | grep -i "finding\|vulnerability\|critical\|high" | tail -3' 2>/dev/null)
    
    if [ -z "$RECENT_LOGS" ]; then
        echo -e "  No recent findings"
    else
        echo "$RECENT_LOGS" | head -10
    fi
    
    echo ""
    echo -e "${YELLOW}System Resources:${NC}"
    # CPU usage of Docker containers
    CPU_USAGE=$(docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}" | grep soc2 | awk '{sum+=$2} END {print sum}' 2>/dev/null || echo "0")
    echo -e "  Docker CPU Usage: ${CPU_USAGE:-0}%"
    
    # Memory usage
    MEM_USAGE=$(docker stats --no-stream --format "table {{.Container}}\t{{.MemUsage}}" | grep soc2 | wc -l 2>/dev/null || echo "0")
    echo -e "  Active Containers: $MEM_USAGE"
    
    echo ""
    echo -e "${GREEN}Press Ctrl+C to exit${NC}"
    echo -e "Auto-refresh in 3 seconds..."
    
    sleep 3
done