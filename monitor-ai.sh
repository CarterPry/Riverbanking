#!/bin/bash

# AI Communication Monitor - See what the AI is thinking!
# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Function to format JSON nicely
format_json() {
    echo "$1" | jq -C '.' 2>/dev/null || echo "$1"
}

# Main monitoring loop
echo -e "${GREEN}=== AI Communication Monitor ===${NC}"
echo "Monitoring AI decisions, inputs, and outputs in real-time..."
echo ""

# Tail multiple log sources
tail -f backend/logs/app.log 2>/dev/null | while read -r line; do
    # Check for AI-related logs
    if echo "$line" | grep -q "IntentClassifier"; then
        echo -e "\n${CYAN}🧠 INTENT CLASSIFICATION:${NC}"
        
        # Extract and format the log
        if echo "$line" | grep -q "similarity scores"; then
            echo -e "${YELLOW}Comparing user input with attack patterns:${NC}"
            scores=$(echo "$line" | sed 's/.*similarity scores"://' | sed 's/,"module".*/}/')
            format_json "$scores"
        fi
        
        if echo "$line" | grep -q "top matches"; then
            echo -e "${YELLOW}Top matching attacks:${NC}"
            matches=$(echo "$line" | sed 's/.*top matches"://' | sed 's/,"module".*/}/')
            format_json "$matches"
        fi
        
        if echo "$line" | grep -q "Final classification"; then
            echo -e "${GREEN}✓ Classification Result:${NC}"
            result=$(echo "$line" | sed 's/.*result"://' | sed 's/}$/}/')
            format_json "$result"
        fi
    fi
    
    # Context Enrichment logs
    if echo "$line" | grep -q "ContextEnrichment"; then
        echo -e "\n${MAGENTA}🔍 CONTEXT ENRICHMENT:${NC}"
        
        if echo "$line" | grep -q "Enriching context"; then
            echo -e "${YELLOW}Input to enrichment:${NC}"
            input=$(echo "$line" | sed 's/.*attacks":\[/[/' | sed 's/\],"historicalData.*/]/')
            format_json "$input"
        fi
        
        if echo "$line" | grep -q "Categorized attacks"; then
            echo -e "${YELLOW}Attack categorization:${NC}"
            cats=$(echo "$line" | sed 's/.*attacks"://' | sed 's/}$/}/')
            format_json "$cats"
        fi
    fi
    
    # Trust Classifier logs
    if echo "$line" | grep -q "TrustClassifier"; then
        echo -e "\n${BLUE}🛡️ TRUST CLASSIFICATION:${NC}"
        
        if echo "$line" | grep -q "risk score"; then
            echo -e "${YELLOW}Risk assessment:${NC}"
            echo "$line" | grep -o '"riskScore":[0-9.]*' | sed 's/"riskScore":/Risk Score: /'
        fi
    fi
    
    # WebSocket messages
    if echo "$line" | grep -q "Broadcasting to workflow"; then
        echo -e "\n${GREEN}📡 WEBSOCKET MESSAGE:${NC}"
        msg=$(echo "$line" | sed 's/.*message"://' | sed 's/,"timestamp.*/}/')
        format_json "$msg"
    fi
    
    # Embedding API calls
    if echo "$line" | grep -q "Getting embedding for text"; then
        echo -e "\n${CYAN}🔢 EMBEDDING REQUEST:${NC}"
        text=$(echo "$line" | sed 's/.*text":"//' | sed 's/","module.*//')
        echo "Text: \"$text\""
    fi
    
    # AI Decision points
    if echo "$line" | grep -q "workflow:command:execute"; then
        echo -e "\n${RED}⚡ AI DECISION - EXECUTING ATTACK:${NC}"
        cmd=$(echo "$line" | sed 's/.*command":"//' | sed 's/","container.*//')
        tool=$(echo "$line" | sed 's/.*tool":"//' | sed 's/","command.*//')
        echo "Tool: $tool"
        echo "Command: $cmd"
    fi
done &

# Also monitor the actual HTTP requests to the embedding API
echo -e "\n${YELLOW}Monitoring OpenAI API calls...${NC}"
echo "(Run in a separate terminal: sudo tcpdump -i any -A 'host api.openai.com')"
echo ""

# Monitor WebSocket connections
echo -e "${YELLOW}Active WebSocket connections:${NC}"
lsof -i :3000 2>/dev/null | grep ESTABLISHED | wc -l | xargs echo "Connected clients:"

echo ""
echo -e "${GREEN}Press Ctrl+C to exit${NC}"
wait