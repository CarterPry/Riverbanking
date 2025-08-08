# AI Integration Checklist - Steps to Complete Before Testing

## Current Status
✅ All new AI components have been created
✅ Legacy components still exist alongside new ones
❌ Dependencies not installed
❌ Main index.ts still using old components
❌ Environment variables not configured

## Required Steps Before Testing

### 1. Install Missing Dependencies
```bash
cd backend
npm install @anthropic-ai/sdk
```

### 2. Update Environment Variables
Add to your `.env` file:
```env
# Required for new AI system
ANTHROPIC_API_KEY=your-anthropic-api-key
ANTHROPIC_MODEL=claude-opus-4-1-20250805

# Notification webhooks (optional but recommended)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK
TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/YOUR/WEBHOOK

# AI Configuration
ENABLE_AI_MONITORING=true
AI_DECISION_LOG_PATH=./logs/ai-decisions
```

### 3. Create Required Directories
```bash
mkdir -p backend/logs/ai-decisions
mkdir -p backend/logs/workflows
```

### 4. Update Database Schema
The new system needs additional tables for AI decision logging:
```sql
-- Add to your database
CREATE TABLE IF NOT EXISTS ai_decisions (
    id UUID PRIMARY KEY,
    workflow_id VARCHAR(255) NOT NULL,
    decision_type VARCHAR(100) NOT NULL,
    input JSONB NOT NULL,
    output JSONB NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_decisions_workflow ON ai_decisions(workflow_id);
CREATE INDEX idx_ai_decisions_type ON ai_decisions(decision_type);
```

### 5. Switch to New Index File
```bash
# Backup current index
cp backend/src/index.ts backend/src/index-legacy.ts

# Use new AI-integrated index
cp backend/src/index-ai-integrated.ts backend/src/index.ts
```

### 6. Pull Required Docker Images
```bash
# Pull all security testing tools
docker pull projectdiscovery/subfinder:latest
docker pull instrumentisto/nmap:latest
docker pull ghcr.io/owasp/zap:stable
docker pull ghcr.io/sqlmapproject/sqlmap:latest
docker pull drwetter/testssl.sh:latest
docker pull aquasec/trivy:latest
docker pull ticarpi/jwt_tool:latest
```

### 7. Update Docker Compose (Optional)
Add to `docker-compose.yml`:
```yaml
  backend:
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - ENABLE_AI_MONITORING=true
    volumes:
      - ./backend/logs:/app/logs
      - /var/run/docker.sock:/var/run/docker.sock
```

### 8. Test Configuration
Run these commands to verify setup:
```bash
# Test Anthropic connection
curl -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -d '{"target": "example.com", "userIntent": "Test configuration"}'

# Check health endpoint
curl http://localhost:3001/health
```

## Migration Path Options

### Option A: Full Migration (Recommended)
1. Complete all steps above
2. Remove old components after testing
3. Update all frontend references

### Option B: Gradual Migration
1. Run both systems side-by-side
2. Use `/api/v2/` endpoints for new system
3. Keep `/api/` endpoints for legacy
4. Migrate workflows one at a time

## Testing Checklist

### Pre-flight Checks
- [ ] Anthropic API key is valid
- [ ] OpenAI API key is valid (for embeddings)
- [ ] Docker daemon is running
- [ ] All Docker images are pulled
- [ ] Database is accessible
- [ ] Logs directory exists and is writable

### Functional Tests
- [ ] Can create a new workflow via API
- [ ] WebSocket connects successfully
- [ ] AI generates strategic plans
- [ ] Tools execute in Docker containers
- [ ] Findings are properly analyzed
- [ ] Audit reports generate correctly

### Integration Tests
- [ ] Run sweetspot scenario: `npm run test:sweetspot`
- [ ] Check real-time updates in dashboard
- [ ] Verify approval workflow triggers
- [ ] Test restraint system blocks dangerous operations

## Known Issues to Address

1. **Import Path Updates**: Some files may need import path updates
2. **Frontend Integration**: Dashboard needs to use new WebSocket events
3. **Legacy Code**: Old layers can be removed after verification
4. **Type Definitions**: May need to add type definitions for new components

## Quick Start Commands

```bash
# After completing setup
cd backend
npm install @anthropic-ai/sdk
npm run dev

# In another terminal
cd frontend
npm run dev

# Test the system
curl -X POST http://localhost:3001/api/v2/workflow/execute \
  -H "Content-Type: application/json" \
  -d '{
    "target": "sweetspotgov.com",
    "userIntent": "Test all subdomains for SQL injection and API vulnerabilities",
    "constraints": {
      "environment": "development"
    }
  }'
```

## Verification

Once setup is complete, you should see:
1. AI decisions being logged in `backend/logs/ai-decisions/`
2. Real-time updates in the dashboard
3. Strategic explanations for each test phase
4. Dynamic test selection based on findings

## Ready for Testing?

Complete all items in the checklist above, then the system will be ready for testing!