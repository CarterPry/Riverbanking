# AI Communication Monitoring Guide

This guide explains how to monitor and debug AI communication in the SOC2 Testing Platform, including requests, responses, embeddings, and classifications.

## Overview

The AI monitoring system provides multiple ways to observe what the AI is receiving and outputting:

1. **Terminal-based monitoring** - Real-time log analysis
2. **Web dashboard** - Visual monitoring interface
3. **Debug logging** - Enhanced logging configuration
4. **Log analysis** - Pattern detection and statistics

## Quick Start

### 1. Enable Enhanced AI Logging

First, enable verbose AI logging:

```bash
# Run the setup script
./enable-ai-debug-logging.sh

# Source the environment variables
source ./set-ai-debug-env.sh

# Start the backend with debug logging
cd backend && npm run dev
```

### 2. Monitor AI Communication

Choose your preferred monitoring method:

#### Option A: Terminal Monitoring

```bash
# Run the AI communication monitor
./monitor-ai-communication.sh

# Select from the menu:
# 1) Summary Dashboard - Overview of recent AI operations
# 2) Real-time Stream - Live AI communication monitoring
# 3) Pattern Analysis - Statistics and trends
# 4) Full Debug Mode - All AI-related logs
```

#### Option B: Web Dashboard

```bash
# Open the dashboard in your browser
open ai-monitor-dashboard.html
# Or navigate to: file:///path/to/multicontext/ai-monitor-dashboard.html

# The dashboard will automatically connect to the backend WebSocket
```

## What Gets Monitored

### 1. Embedding Operations
- **Input text** being embedded
- **API calls** to OpenAI/embedding service
- **Response times** and performance metrics
- **Cache hits** vs. new generations
- **Errors** and retry attempts

### 2. Intent Classification
- **User input** being classified
- **Classification results** (intent, confidence)
- **Matched attacks** with similarity scores
- **Entity extraction** (targets, attack types)
- **Progress updates** during classification

### 3. AI Agent Communication
- **Prompts** sent to LLMs
- **Responses** received
- **Context building** process
- **Error handling**

### 4. Workflow Decisions
- **Workflow starts** with input data
- **Attack selection** based on classification
- **Progress updates** throughout execution
- **Results** and findings

## Understanding the Logs

### Log Entry Types

1. **AI Request** - Shows exactly what's being sent to AI services
   ```json
   {
     "event": "ai_request",
     "component": "embedding-service",
     "input": "Test for SQL injection vulnerabilities",
     "parameters": { "model": "text-embedding-ada-002" }
   }
   ```

2. **AI Response** - Shows what the AI returns
   ```json
   {
     "event": "ai_response",
     "component": "embedding-service",
     "output": [0.0123, -0.0456, ...], // embedding vector
     "duration": 156,
     "cached": false
   }
   ```

3. **Classification Result** - Intent classification output
   ```json
   {
     "event": "classification_complete",
     "intent": "SECURITY_TEST",
     "confidence": 0.92,
     "topMatch": "SQL Injection",
     "matchedAttacks": 3
   }
   ```

## Terminal Monitor Features

### 1. Summary Dashboard
- Recent embedding operations
- Latest classifications
- Active workflows
- Security test executions

### 2. Real-time Stream
- Color-coded log entries
- Filtered by AI components
- Shows input/output preview
- Updates as events occur

### 3. Pattern Analysis
- Total operation counts
- Cache hit rates
- Most common intents
- Error frequency

### 4. Full Debug Mode
- Raw JSON logs
- All AI-related events
- Complete request/response data
- Useful for deep debugging

## Web Dashboard Features

### Metrics Display
- Total AI requests
- Embeddings generated
- Classifications performed
- Average response time

### Real-time Panels
- **AI Communication Stream** - All AI interactions
- **Intent Classifications** - Classification results
- **Embeddings & Similarity** - Embedding operations
- **Active Workflows** - Workflow progress

### Controls
- Connect/disconnect WebSocket
- Filter log types
- Clear logs
- Export logs as JSON

## Debugging Tips

### 1. Check API Keys
```bash
# Verify OpenAI API key is set
echo $OPENAI_API_KEY | head -c 20
```

### 2. Monitor Specific Components
```bash
# Watch only embedding operations
tail -f backend/logs/app.log | jq 'select(.event == "embedding_generation")'

# Watch only classifications
tail -f backend/logs/app.log | jq 'select(.module == "IntentClassifier")'
```

### 3. Check Error Logs
```bash
# View recent AI errors
tail -f backend/logs/error.log | grep -E "embedding|OpenAI|AI"
```

### 4. Performance Analysis
```bash
# Calculate average embedding generation time
cat backend/logs/app.log | jq -r 'select(.event == "embedding_generation") | .duration' | awk '{sum+=$1; count++} END {print "Average:", sum/count, "ms"}'
```

## Troubleshooting

### No AI Communication Visible
1. Ensure backend is running with debug logging enabled
2. Check that `LOG_LEVEL=debug` is set
3. Verify WebSocket connection in web dashboard
4. Check `backend/logs/app.log` exists

### WebSocket Connection Failed
1. Verify backend is running on port 3000
2. Check CORS settings allow your origin
3. Look for WebSocket errors in browser console

### Missing Embeddings
1. Check OpenAI API key is valid
2. Verify embedding service is initialized
3. Look for errors in embedding generation
4. Run `node scripts/generate-embeddings-direct.js` if needed

## Log File Locations

- **Application logs**: `backend/logs/app.log`
- **Error logs**: `backend/logs/error.log`
- **AI debug config**: `backend/logs/ai-debug-config.json`
- **Exported logs**: Downloads folder (from web dashboard)

## Advanced Usage

### Custom Log Filtering
```bash
# Create custom filters for specific AI operations
tail -f backend/logs/app.log | jq 'select(.event == "ai_request" and .component == "intent-classifier")'
```

### Performance Monitoring
```bash
# Monitor embedding generation performance
watch -n 1 'tail -100 backend/logs/app.log | jq "select(.event == \"embedding_generation\") | {model: .model, duration: .duration, cached: .cached}" | tail -10'
```

### Integration with External Tools
The logs are in JSON format, making them easy to:
- Import into Elasticsearch/Kibana
- Process with log aggregation tools
- Analyze with custom scripts
- Visualize in Grafana

## Best Practices

1. **Enable debug logging only when needed** - It generates verbose output
2. **Monitor response times** - High latency indicates API issues
3. **Check cache hit rates** - Low rates mean repeated API calls
4. **Export logs regularly** - For historical analysis
5. **Use filters** - Focus on specific components when debugging

## Support

For issues with AI monitoring:
1. Check this guide first
2. Review error logs
3. Verify API keys and service availability
4. Check the WebSocket connection
5. Ensure all dependencies are installed