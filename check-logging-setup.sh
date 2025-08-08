#!/bin/bash

# CHECK LOGGING SETUP - Diagnoses why you can't see logs

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== LOGGING DIAGNOSTICS ===${NC}"
echo ""

# 1. Check if backend is running
echo "1. Checking if backend is running..."
BACKEND_PID=$(lsof -i :3000 -t 2>/dev/null)
if [ -n "$BACKEND_PID" ]; then
    echo -e "   ${GREEN}✓ Backend is running (PID: $BACKEND_PID)${NC}"
    
    # Check how it was started
    PS_OUTPUT=$(ps -p $BACKEND_PID -o command= 2>/dev/null)
    if echo "$PS_OUTPUT" | grep -q "tee"; then
        echo -e "   ${GREEN}✓ Backend is logging to file${NC}"
    else
        echo -e "   ${RED}✗ Backend is NOT saving logs to file${NC}"
        echo -e "   ${RED}  Logs are only going to console!${NC}"
    fi
else
    echo -e "   ${RED}✗ Backend is not running${NC}"
fi
echo ""

# 2. Check for log files
echo "2. Checking for log files..."
if [ -f "logs/backend-live.log" ]; then
    SIZE=$(wc -l < logs/backend-live.log)
    LAST_MOD=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" logs/backend-live.log 2>/dev/null || stat -c "%y" logs/backend-live.log 2>/dev/null | cut -d'.' -f1)
    echo -e "   ${GREEN}✓ Found logs/backend-live.log ($SIZE lines)${NC}"
    echo "     Last modified: $LAST_MOD"
else
    echo -e "   ${RED}✗ No logs/backend-live.log found${NC}"
fi
echo ""

# 3. Check other log locations
echo "3. Checking other log locations..."
for logfile in logs/app.log backend/logs/app.log; do
    if [ -f "$logfile" ]; then
        SIZE=$(wc -l < "$logfile")
        echo "   Found: $logfile ($SIZE lines)"
        LAST_LINE=$(tail -1 "$logfile" 2>/dev/null)
        if [ -n "$LAST_LINE" ]; then
            TIMESTAMP=$(echo "$LAST_LINE" | grep -o '"timestamp":"[^"]*"' | cut -d'"' -f4)
            echo "     Last entry: $TIMESTAMP"
        fi
    fi
done
echo ""

# 4. Show the fix
echo -e "${YELLOW}=== THE FIX ===${NC}"
if [ -n "$BACKEND_PID" ] && ! echo "$PS_OUTPUT" | grep -q "tee"; then
    echo -e "${RED}Your backend is running but NOT saving logs!${NC}"
    echo ""
    echo "To fix this:"
    echo "1. Stop the current backend (find its terminal and press Ctrl+C)"
    echo ""
    echo "2. Restart it with this command:"
    echo -e "   ${GREEN}cd backend && npm run dev 2>&1 | tee ../logs/backend-live.log${NC}"
    echo ""
    echo "3. Then run the monitor:"
    echo -e "   ${GREEN}./MONITOR-EVERYTHING-NOW.sh${NC}"
else
    echo "To start backend with logging:"
    echo -e "   ${GREEN}cd backend && npm run dev 2>&1 | tee ../logs/backend-live.log${NC}"
fi
echo ""