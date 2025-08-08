#!/bin/bash

# BACKEND LOG CAPTURE - Ensures all logs are saved to a file

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== BACKEND LOG CAPTURE SYSTEM ===${NC}"
echo ""
echo "The backend is currently logging to console (stdout) instead of files."
echo "This script will help you capture ALL logs properly."
echo ""

# Create logs directory if it doesn't exist
mkdir -p logs

echo "Choose an option:"
echo "1) Start backend with log capture (recommended)"
echo "2) View existing console output if backend is running"
echo "3) Setup permanent logging configuration"
echo ""
read -p "Select option (1-3): " choice

case $choice in
    1)
        echo -e "${GREEN}Starting backend with full log capture...${NC}"
        echo "Logs will be saved to: logs/backend-live.log"
        echo "You'll also see them in the console"
        echo ""
        
        # Kill existing backend if running
        BACKEND_PID=$(lsof -i :3000 -t 2>/dev/null)
        if [ -n "$BACKEND_PID" ]; then
            echo "Stopping existing backend (PID: $BACKEND_PID)..."
            kill $BACKEND_PID
            sleep 2
        fi
        
        # Start backend with log capture
        cd backend
        echo "Starting backend..."
        npm run dev 2>&1 | tee ../logs/backend-live.log
        ;;
        
    2)
        echo -e "${YELLOW}Viewing backend console output...${NC}"
        echo "Note: This only works if backend was started in a terminal"
        echo ""
        
        # Try to find backend process
        BACKEND_PID=$(lsof -i :3000 -t 2>/dev/null)
        if [ -n "$BACKEND_PID" ]; then
            echo "Backend is running (PID: $BACKEND_PID)"
            echo "If it was started with output redirection, check:"
            echo "  - logs/backend-live.log"
            echo "  - The terminal where you started 'npm run dev'"
        else
            echo -e "${RED}Backend is not running!${NC}"
            echo "Start it with option 1 to capture logs"
        fi
        ;;
        
    3)
        echo -e "${GREEN}Setting up permanent logging...${NC}"
        
        # Create a wrapper script
        cat > start-backend-with-logs.sh << 'EOF'
#!/bin/bash
# Backend starter with automatic log capture

LOG_DIR="logs"
LOG_FILE="$LOG_DIR/backend-$(date +%Y%m%d-%H%M%S).log"

mkdir -p $LOG_DIR

echo "Starting backend with logging to: $LOG_FILE"
echo "Logs will also appear in console"
echo ""

cd backend
exec npm run dev 2>&1 | tee ../$LOG_FILE
EOF
        
        chmod +x start-backend-with-logs.sh
        
        echo "Created: start-backend-with-logs.sh"
        echo ""
        echo "To use it:"
        echo "  ./start-backend-with-logs.sh"
        echo ""
        echo "This will save logs with timestamps to logs/ directory"
        ;;
        
    *)
        echo "Invalid choice"
        ;;
esac