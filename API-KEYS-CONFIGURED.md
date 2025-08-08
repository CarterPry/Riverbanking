# API Keys Configuration Complete

## ✅ Successfully Configured:

### 1. Anthropic API Key (for AI Decision Making)
- **Key**: `sk-ant-api03-...` (stored in .env)
- **Model**: `claude-opus-4-1-20250805`
- **Used in**: `backend/src/services/strategicAIService.ts`
- **Purpose**: Powers all AI strategic planning and security decision making

### 2. OpenAI API Key (for Embeddings)
- **Key**: `sk-proj-lpPT...` (stored in .env)
- **Used in**: `backend/src/services/embeddingService.ts`
- **Purpose**: Generates embeddings for semantic search and knowledge base

## Configuration Details:

### Environment Variables (.env)
```bash
# AI Model Configuration
ANTHROPIC_API_KEY=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
ANTHROPIC_MODEL=claude-opus-4-1-20250805

# Embeddings Configuration
OPENAI_API_KEY=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
EMBEDDING_API_URL=https://api.openai.com/v1/embeddings
```

### Code Implementation:

1. **StrategicAIService** (backend/src/services/strategicAIService.ts):
```typescript
private model = process.env.ANTHROPIC_MODEL || 'claude-opus-4-1-20250805';
constructor() {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is required');
    }
    this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
    });
}
```

2. **EmbeddingService** (backend/src/services/embeddingService.ts):
```typescript
if (isOpenAI && process.env.OPENAI_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.OPENAI_API_KEY}`;
}
```

## Security Notes:

1. **Never commit API keys to git** - The .env file should be in .gitignore
2. **Rotate keys regularly** - These keys should be rotated periodically
3. **Use environment-specific keys** - Different keys for dev/staging/production
4. **Monitor usage** - Watch API usage in both Anthropic and OpenAI dashboards

## Testing the Configuration:

To verify everything is working:

```bash
# Test the AI decision making
./test-directory-enumeration.sh

# Check backend health
curl http://localhost:3001/health | jq .

# View AI logs
tail -f backend/logs/exceptions.log | grep -E "Anthropic|Strategic"
```

## Cost Monitoring:

- **Claude Opus 4.1**: Premium pricing tier (check Anthropic dashboard)
- **OpenAI Embeddings**: $0.10 per 1M tokens (ada-002 model)

Monitor your usage at:
- Anthropic Console: https://console.anthropic.com/
- OpenAI Dashboard: https://platform.openai.com/usage

## Troubleshooting:

If you encounter issues:
1. Check if .env file is loaded: `echo $ANTHROPIC_API_KEY`
2. Verify backend is reading env: `docker-compose logs backend | grep "API"`
3. Check for rate limits in API responses
4. Ensure API keys have proper permissions

The system is now fully configured with both AI providers!
