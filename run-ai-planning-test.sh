#!/bin/bash

# Runner script for AI Planning Tests
# This script provides an easy way to test the AI's initial planning and thought process

set -e

echo "=================================================="
echo "🧪 AI Security Planning Test Suite"
echo "=================================================="
echo ""

# Check dependencies
check_dependency() {
    if ! command -v $1 &> /dev/null; then
        echo "❌ $1 is not installed. Please install it first."
        return 1
    fi
    echo "✅ $1 is installed"
    return 0
}

echo "📦 Checking dependencies..."
check_dependency "node" || exit 1
check_dependency "npm" || exit 1
check_dependency "python3" || exit 1
check_dependency "jq" || echo "⚠️  jq not installed (optional, for pretty JSON output)"
echo ""

# Create output directory
OUTPUT_DIR="./ai-test-outputs"
mkdir -p "$OUTPUT_DIR"

# Install Node dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing Node.js dependencies..."
    npm install node-fetch uuid ws
fi

# Install Python dependencies if needed
echo "📦 Checking Python dependencies..."
pip3 install -q rich websockets aiohttp 2>/dev/null || echo "⚠️  Some Python packages may be missing"
echo ""

# Function to run a test
run_test() {
    local test_type=$1
    local test_name=$2
    
    echo "=================================================="
    echo "🚀 Running: $test_name"
    echo "=================================================="
    
    case $test_type in
        "basic")
            echo "Using basic shell script..."
            bash test-ai-first-step.sh
            ;;
        "node")
            echo "Using Node.js incremental tester..."
            node incremental-ai-test.js --scenario=initial-planning
            ;;
        "python")
            echo "Using Python monitor with rich output..."
            python3 monitor-ai-planning.py \
                --target "https://sweetspotgov.com" \
                --description "I want you to test against all subdomains and dir's. Test all access, stuff like sql injection, sending JWT tokens, catching any leaky api's stuff like this."
            ;;
        *)
            echo "Unknown test type: $test_type"
            return 1
            ;;
    esac
    
    echo ""
    echo "✅ Test completed"
    echo ""
}

# Main menu
show_menu() {
    echo "🎯 Select a test to run:"
    echo ""
    echo "  1) Quick Test - Basic shell script (fastest)"
    echo "  2) Detailed Test - Node.js with WebSocket monitoring"
    echo "  3) Visual Test - Python with rich console output"
    echo "  4) Run All Tests"
    echo "  5) View Previous Results"
    echo "  6) Exit"
    echo ""
    read -p "Enter choice (1-6): " choice
    
    case $choice in
        1)
            run_test "basic" "Quick AI Planning Test"
            ;;
        2)
            run_test "node" "Detailed Incremental Test"
            ;;
        3)
            run_test "python" "Visual Planning Monitor"
            ;;
        4)
            echo "Running all tests..."
            run_test "basic" "Quick AI Planning Test"
            sleep 5
            run_test "node" "Detailed Incremental Test"
            sleep 5
            run_test "python" "Visual Planning Monitor"
            ;;
        5)
            echo "📁 Previous test results:"
            ls -la "$OUTPUT_DIR"/*.json 2>/dev/null || echo "No results found"
            echo ""
            read -p "Enter filename to view (or press Enter to skip): " filename
            if [ -n "$filename" ]; then
                if [ -f "$OUTPUT_DIR/$filename" ]; then
                    cat "$OUTPUT_DIR/$filename" | jq '.' 2>/dev/null || cat "$OUTPUT_DIR/$filename"
                else
                    echo "File not found: $OUTPUT_DIR/$filename"
                fi
            fi
            ;;
        6)
            echo "Goodbye!"
            exit 0
            ;;
        *)
            echo "Invalid choice"
            ;;
    esac
}

# Parse command line arguments
if [ "$1" == "--quick" ]; then
    run_test "basic" "Quick AI Planning Test"
elif [ "$1" == "--detailed" ]; then
    run_test "node" "Detailed Incremental Test"
elif [ "$1" == "--visual" ]; then
    run_test "python" "Visual Planning Monitor"
elif [ "$1" == "--all" ]; then
    run_test "basic" "Quick AI Planning Test"
    sleep 5
    run_test "node" "Detailed Incremental Test"
    sleep 5
    run_test "python" "Visual Planning Monitor"
elif [ "$1" == "--help" ]; then
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --quick     Run quick test using shell script"
    echo "  --detailed  Run detailed test with Node.js"
    echo "  --visual    Run visual test with Python"
    echo "  --all       Run all tests"
    echo "  --help      Show this help message"
    echo ""
    echo "Without options, an interactive menu will be shown."
else
    # Interactive mode
    while true; do
        show_menu
        echo ""
        read -p "Run another test? (y/n): " again
        if [ "$again" != "y" ]; then
            break
        fi
        echo ""
    done
fi

echo ""
echo "=================================================="
echo "📊 Test Results Summary"
echo "=================================================="
echo "Output directory: $OUTPUT_DIR"
echo "Latest results:"
ls -lt "$OUTPUT_DIR"/*.json 2>/dev/null | head -5 || echo "No results yet"
echo ""
echo "To analyze results:"
echo "  cat $OUTPUT_DIR/<filename>.json | jq '.aiThoughts'"
echo "  cat $OUTPUT_DIR/<filename>.json | jq '.testPlan'"
echo ""