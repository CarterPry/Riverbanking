#!/bin/bash

# MASTER LOGGING SCRIPT - One command to see EVERYTHING

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

clear

echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           COMPLETE LOGGING SOLUTION                       ║${NC}"
echo -e "${CYAN}║                                                           ║${NC}"
echo -e "${CYAN}║  This will show you EVERYTHING:                           ║${NC}"
echo -e "${CYAN}║  • Every AI request and response                          ║${NC}"
echo -e "${CYAN}║  • Every embedding generation                             ║${NC}"
echo -e "${CYAN}║  • Every Docker container started                         ║${NC}"
echo -e "${CYAN}║  • Every security tool executed                           ║${NC}"
echo -e "${CYAN}║  • Every API call made                                    ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check current setup
echo -e "${YELLOW}Checking current setup...${NC}"
./check-logging-setup.sh
echo ""

echo -e "${YELLOW}What would you like to do?${NC}"
echo "1) Start backend with FULL logging (recommended)"
echo "2) Monitor existing logs"
echo "3) View raw logs without formatting"
echo "4) Exit"
echo ""
read -p "Select option (1-4): " choice

case $choice in
    1)
        echo -e "${GREEN}Starting backend with FULL logging...${NC}"
        
        # Create logs directory
        mkdir -p logs
        
        # Kill existing backend
        BACKEND_PID=$(lsof -i :3000 -t 2>/dev/null)
        if [ -n "$BACKEND_PID" ]; then
            echo "Stopping existing backend..."
            kill $BACKEND_PID
            sleep 2
        fi
        
        # Start backend with logging
        echo ""
        echo -e "${GREEN}Starting backend with log capture...${NC}"
        echo "Logs will be saved to: logs/backend-live.log"
        echo ""
        echo -e "${YELLOW}After backend starts, open a NEW terminal and run:${NC}"
        echo -e "${GREEN}./MONITOR-EVERYTHING-NOW.sh${NC}"
        echo ""
        echo "Press Ctrl+C to stop the backend"
        echo ""
        
        cd backend
        exec npm run dev 2>&1 | tee ../logs/backend-live.log
        ;;
        
    2)
        echo -e "${GREEN}Starting log monitor...${NC}"
        ./MONITOR-EVERYTHING-NOW.sh
        ;;
        
    3)
        echo -e "${GREEN}Showing raw logs...${NC}"
        if [ -f "logs/backend-live.log" ]; then
            tail -f logs/backend-live.log
        else
            echo -e "${RED}No logs/backend-live.log found!${NC}"
            echo "Start backend with option 1 first"
        fi
        ;;
        
    4)
        echo "Exiting..."
        exit 0
        ;;
        
    *)
        echo "Invalid choice"
        ;;
esac