#!/bin/bash

# Enhanced AI Communication Monitor for SOC2 Testing Platform
# This script tracks AI inputs, outputs, embeddings, and workflow decisions

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Log file paths
APP_LOG="${1:-backend/logs/app.log}"
ERROR_LOG="${2:-backend/logs/error.log}"

# Function to parse and display AI-related logs
display_ai_logs() {
    echo -e "${CYAN}=== AI Communication Monitor ===${NC}"
    echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    
    # Check if logs exist
    if [ ! -f "$APP_LOG" ]; then
        echo -e "${RED}Log file not found: $APP_LOG${NC}"
        echo "Please ensure the backend is running and logging is enabled."
        return
    fi
    
    # Display recent embedding operations
    echo -e "${YELLOW}Recent Embedding Operations:${NC}"
    tail -100 "$APP_LOG" | jq -r 'select(.event == "embedding_generation" or .event == "embedding_query") | "\(.timestamp) [\(.level)] \(.message) - Model: \(.model // "N/A"), Duration: \(.duration // "N/A")ms"' 2>/dev/null | tail -5
    echo ""
    
    # Display classification results
    echo -e "${YELLOW}Recent Intent Classifications:${NC}"
    tail -200 "$APP_LOG" | jq -r 'select(.module == "IntentClassifier" and .message | contains("Classification complete")) | "\(.timestamp) Intent: \(.intent // "N/A"), Confidence: \(.confidence // "N/A"), Matched: \(.matchedAttacks // 0), Top: \(.topMatch // "None")"' 2>/dev/null | tail -5
    echo ""
    
    # Display workflow operations
    echo -e "${YELLOW}Active Workflows:${NC}"
    tail -500 "$APP_LOG" | jq -r 'select(.event == "workflow_start" or .event == "workflow_end") | "\(.timestamp) [\(.event)] Workflow: \(.workflowId), Status: \(.status // "running"), Duration: \(.duration // "N/A")ms"' 2>/dev/null | tail -10
    echo ""
    
    # Display attack executions
    echo -e "${YELLOW}Security Test Executions:${NC}"
    tail -200 "$APP_LOG" | jq -r 'select(.event == "attack_execution") | "\(.timestamp) [\(.status)] Attack: \(.attackId), Tool: \(.tool)"' 2>/dev/null | tail -10
    echo ""
}

# Function to monitor real-time AI requests
monitor_realtime() {
    echo -e "${GREEN}=== Real-time AI Communication Stream ===${NC}"
    echo "Monitoring for: embeddings, classifications, workflow decisions..."
    echo ""
    
    tail -f "$APP_LOG" | while read line; do
        # Try to parse as JSON
        parsed=$(echo "$line" | jq -r 'select(.module == "IntentClassifier" or .event == "embedding_generation" or .event == "embedding_query" or .module == "aiAgent") | {timestamp, level, module, message, event}' 2>/dev/null)
        
        if [ ! -z "$parsed" ]; then
            # Extract fields
            timestamp=$(echo "$parsed" | jq -r '.timestamp // ""')
            level=$(echo "$parsed" | jq -r '.level // ""')
            module=$(echo "$parsed" | jq -r '.module // ""')
            message=$(echo "$parsed" | jq -r '.message // ""')
            event=$(echo "$parsed" | jq -r '.event // ""')
            
            # Color code by type
            case "$module" in
                "IntentClassifier")
                    echo -e "${CYAN}[CLASSIFIER]${NC} $timestamp: $message"
                    # Extract additional details if available
                    details=$(echo "$line" | jq -r 'select(.userInput) | "  Input: \(.userInput | .[0:100])..."' 2>/dev/null)
                    [ ! -z "$details" ] && echo "$details"
                    ;;
                "aiAgent")
                    echo -e "${MAGENTA}[AI AGENT]${NC} $timestamp: $message"
                    ;;
                *)
                    case "$event" in
                        "embedding_generation")
                            echo -e "${BLUE}[EMBEDDING]${NC} $timestamp: Generated embedding (model: $(echo "$line" | jq -r '.model // "unknown"'), cached: $(echo "$line" | jq -r '.cached // false'))"
                            text_preview=$(echo "$line" | jq -r '.text // "" | .[0:80]' 2>/dev/null)
                            [ ! -z "$text_preview" ] && echo "  Text: $text_preview..."
                            ;;
                        "embedding_query")
                            echo -e "${GREEN}[EMBEDDING QUERY]${NC} $timestamp: Queried $message"
                            ;;
                    esac
                    ;;
            esac
        fi
    done
}

# Function to analyze AI communication patterns
analyze_patterns() {
    echo -e "${YELLOW}=== AI Communication Analysis ===${NC}"
    echo ""
    
    if [ -f "$APP_LOG" ]; then
        # Count embedding operations
        echo "Embedding Operations (last hour):"
        echo -n "  Generated: "
        grep -c '"event":"embedding_generation"' "$APP_LOG" 2>/dev/null || echo "0"
        echo -n "  Cached hits: "
        grep '"event":"embedding_generation"' "$APP_LOG" 2>/dev/null | grep -c '"cached":true' || echo "0"
        echo ""
        
        # Classification statistics
        echo "Classification Statistics:"
        echo -n "  Total classifications: "
        grep -c '"module":"IntentClassifier".*Classification complete' "$APP_LOG" 2>/dev/null || echo "0"
        echo ""
        
        # Most common intents
        echo "Top Intents:"
        grep '"module":"IntentClassifier".*Classification complete' "$APP_LOG" 2>/dev/null | \
            jq -r '.intent' 2>/dev/null | sort | uniq -c | sort -rn | head -5
        echo ""
        
        # Error analysis
        echo "Recent AI Errors:"
        tail -1000 "$ERROR_LOG" 2>/dev/null | \
            jq -r 'select(.message | contains("embedding") or contains("AI") or contains("OpenAI")) | "\(.timestamp) \(.message)"' | \
            tail -5
    fi
}

# Main menu
show_menu() {
    echo ""
    echo "Select monitoring mode:"
    echo "1) Summary Dashboard - Overview of recent AI operations"
    echo "2) Real-time Stream - Live AI communication monitoring"
    echo "3) Pattern Analysis - Statistics and trends"
    echo "4) Full Debug Mode - All AI-related logs"
    echo "5) Exit"
    echo ""
}

# Main loop
while true; do
    clear
    show_menu
    read -p "Enter choice [1-5]: " choice
    
    case $choice in
        1)
            clear
            while true; do
                clear
                display_ai_logs
                echo ""
                echo "Press Ctrl+C to return to menu. Refreshing in 5 seconds..."
                sleep 5
            done
            ;;
        2)
            clear
            monitor_realtime
            ;;
        3)
            clear
            analyze_patterns
            echo ""
            read -p "Press Enter to continue..."
            ;;
        4)
            clear
            echo -e "${YELLOW}=== Full AI Debug Logs ===${NC}"
            echo "Showing all AI-related logs (Ctrl+C to exit):"
            echo ""
            tail -f "$APP_LOG" | jq -r 'select(.module == "IntentClassifier" or .module == "EmbeddingService" or .module == "aiAgent" or (.event // "" | tostring | contains("embedding")) or (.message // "" | tostring | contains("AI")) or (.message // "" | tostring | contains("classification"))) | .'
            ;;
        5)
            echo "Exiting..."
            exit 0
            ;;
        *)
            echo "Invalid choice. Please try again."
            sleep 2
            ;;
    esac
done