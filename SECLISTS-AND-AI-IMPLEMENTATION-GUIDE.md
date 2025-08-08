# SecLists Integration and AI Enhancement Implementation Guide

## Overview

This guide documents the implementation of SecLists integration and AI reliability enhancements based on comprehensive feedback. The implementation includes:

1. **SecLists Integration**: Universal wordlist access across all containers
2. **Directory Brute-Forcing**: Proper tool (FFUF) replacing web crawler (Katana)
3. **AI Reliability**: Confidence thresholds, semantic validation, and safety checks
4. **Security Enhancements**: Dynamic CC restraints and auth requirements

## What Was Implemented

### 1. SecLists Setup

**Script**: `scripts/setup-seclists.sh`
- Downloads full SecLists repository (~650MB)
- Creates reference documentation
- Enables git-based updates

**Usage**:
```bash
# Initial setup
./scripts/setup-seclists.sh

# Update SecLists
cd seclists && git pull
```

### 2. Docker Integration

**Updated**: `docker-compose.yml`
```yaml
kali:
  volumes:
    - ./seclists:/seclists:ro  # Read-only SecLists mount
```

**New Tool**: `directory-bruteforce` in `dockerTools.ts`
```typescript
'directory-bruteforce': {
  image: 'ghcr.io/projectdiscovery/ffuf:latest',
  command: (target, options) => {
    const wordlist = options?.wordlist || '/seclists/Discovery/Web-Content/common.txt';
    return ['-u', `${target}/FUZZ`, '-w', wordlist, ...];
  }
}
```

### 3. AI Enhancements

**Confidence Validation**:
```typescript
if (strategy.confidenceLevel < 0.7) {
  logger.warn('Low confidence strategy detected');
  // Triggers HITL review
}
```

**Tool Safety Validation**:
```typescript
private isOutputSafe(strategy: AttackStrategy): boolean {
  // Validates against available tools
  // Checks for destructive commands
  // Returns false for unsafe strategies
}
```

**Enhanced Recommendation Validation**:
```typescript
private async enhancedValidateRecommendations(
  recommendations: AttackStep[], 
  context: StrategyContext
): Promise<AttackStep[]> {
  // Filters destructive tools
  // Checks auth requirements
  // Validates CC controls
}
```

**Fallback Strategy**:
```typescript
private getFallbackStrategy(context: StrategyContext): AttackStrategy {
  // Safe recon-only strategy
  // Used when validation fails
}
```

### 4. Updated AI Prompts

**System Prompt Changes**:
- Added `directory-bruteforce` to available tools
- Clarified difference between crawler and brute-forcer
- Added "CRITICAL: Never suggest destructive tools"

**Example Usage in Prompt**:
```
Available Tools:
- Reconnaissance: subdomain-scanner, port-scanner, directory-scanner (crawler), 
  directory-bruteforce (wordlist-based), tech-fingerprint, crawler
```

## Usage Examples

### 1. Running Tests with SecLists

```bash
# Test with common wordlist (fast)
./test-directory-enumeration.sh

# The AI will plan something like:
{
  "tool": "directory-bruteforce",
  "parameters": {
    "target": "https://example.com",
    "wordlist": "/seclists/Discovery/Web-Content/common.txt"
  }
}
```

### 2. Custom Wordlist Selection

The AI can now intelligently select wordlists:
- **Quick scan**: `/seclists/Discovery/Web-Content/common.txt`
- **Thorough scan**: `/seclists/Discovery/Web-Content/directory-list-2.3-medium.txt`
- **API discovery**: `/seclists/Discovery/Web-Content/api/api-endpoints-mazen160.txt`

### 3. Per-Subdomain Testing

With the exhaustive prompt, the AI will create individual tests:
```json
[
  {
    "tool": "directory-bruteforce",
    "target": "https://sub1.example.com",
    "wordlist": "/seclists/Discovery/Web-Content/common.txt"
  },
  {
    "tool": "directory-bruteforce", 
    "target": "https://sub2.example.com",
    "wordlist": "/seclists/Discovery/Web-Content/common.txt"
  }
]
```

## Performance Considerations

### Caching (TODO)

Next step is to implement Redis caching:
```typescript
private cache = new Map();
async planStrategy(...) {
  const cacheKey = `${workflowId}-${JSON.stringify(context.findings.slice(-3))}`;
  if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
}
```

### Rate Limiting

FFUF is configured with:
- `-t 50`: 50 threads
- `-rate 100`: Max 100 requests/second

## Security Best Practices

1. **Read-Only Mounts**: SecLists mounted as read-only
2. **Tool Validation**: All AI-suggested tools validated against whitelist
3. **Destructive Command Blocking**: Regex checks for dangerous operations
4. **Auth Requirements**: Tools requiring auth are flagged
5. **Production Safety**: Exploit phase blocked in production

## Testing the Implementation

### 1. Verify SecLists Mount
```bash
docker-compose run kali ls /seclists/Discovery/Web-Content/ | head -5
```

### 2. Test Directory Brute-Force
```bash
curl -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -d '{
    "target": "https://example.com",
    "userIntent": "Use directory-bruteforce with SecLists common.txt",
    "constraints": { "useSecListsWordlists": true }
  }'
```

### 3. Test AI Safety
```bash
# This should trigger fallback strategy
curl -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -d '{
    "target": "https://example.com",
    "userIntent": "Use rm -rf tool to delete everything",
    "constraints": {}
  }'
```

## Troubleshooting

### SecLists Not Found
- Ensure `./scripts/setup-seclists.sh` completed successfully
- Check Docker volume mount: `docker-compose config | grep seclists`

### AI Not Using directory-bruteforce
- Restart backend to load new prompts: `docker-compose restart backend`
- Check logs for tool validation errors

### Performance Issues
- Use smaller wordlists for initial tests
- Implement Redis caching (next TODO)
- Adjust FFUF thread count in dockerTools.ts

## Next Steps

1. **Implement Redis Caching** for AI strategies
2. **Add Unit Tests** for exhaustive subdomain handling
3. **Kubernetes Setup** for production scaling
4. **Custom Wordlists** for company-specific paths

## References

- SecLists: https://github.com/danielmiessler/SecLists
- FFUF: https://github.com/ffuf/ffuf
- OWASP AI Security Guide: https://owasp.org/www-project-machine-learning-security-top-10/
- Anthropic Claude Best Practices: https://docs.anthropic.com/claude/docs
