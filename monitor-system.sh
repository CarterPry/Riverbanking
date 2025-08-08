#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

clear

while true; do
    # Clear screen and move cursor to top
    clear
    echo -e "${GREEN}=== SOC2 Testing Platform Monitor ===${NC}"
    echo "Time: $(date)"
    echo ""
    
    # Backend Health
    echo -e "${YELLOW}Backend Health:${NC}"
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        echo -e "  Status: ${GREEN}✓ Running${NC}"
    else
        echo -e "  Status: ${RED}✗ Down${NC}"
    fi
    
    # WebSocket Connections
    WS_CONN=$(lsof -i :3000 2>/dev/null | grep ESTABLISHED | wc -l | tr -d ' ')
    echo -e "  WebSocket Connections: $WS_CONN"
    echo ""
    
    # Redis Status
    echo -e "${YELLOW}Redis Queue:${NC}"
    if redis-cli ping > /dev/null 2>&1; then
        echo -e "  Status: ${GREEN}✓ Connected${NC}"
        QUEUE_SIZE=$(redis-cli llen "bull:workflow-queue:wait" 2>/dev/null || echo "0")
        echo -e "  Queued Jobs: $QUEUE_SIZE"
    else
        echo -e "  Status: ${RED}✗ Disconnected${NC}"
    fi
    echo ""
    
    # Docker Containers
    echo -e "${YELLOW}Docker Containers:${NC}"
    CONTAINER_COUNT=$(docker ps --filter "name=soc2-" --format "{{.Names}}" | wc -l | tr -d ' ')
    echo -e "  Active Security Tool Containers: $CONTAINER_COUNT"
    if [ "$CONTAINER_COUNT" -gt 0 ]; then
        docker ps --filter "name=soc2-" --format "  - {{.Names}} ({{.Status}})"
    fi
    echo ""
    
    # Recent Logs
    echo -e "${YELLOW}Recent Activity:${NC}"
    if [ -f backend/logs/app.log ]; then
        tail -5 backend/logs/app.log | grep -E "workflow|attack|tool" | tail -3 | while read line; do
            echo "  $(echo "$line" | jq -r '.message' 2>/dev/null || echo "$line")"
        done
    fi
    
    echo ""
    echo "Press Ctrl+C to exit. Refreshing in 5 seconds..."
    sleep 5
done