# Common Issues and Fixes

## Current Known Issues

### 1. ✅ Docker Detection (FIXED)
- **Issue**: Backend falling back to mock mode
- **Fix**: Environment variables now load before service initialization

### 2. ✅ WebSocket Disconnections (FIXED)
- **Issue**: Immediate disconnection after connection
- **Fix**: Added 200ms debounce and proper message formatting

### 3. ⚠️ TypeScript Configuration Warnings
- **Issue**: Duplicate keys in frontend/tsconfig.json
- **Location**: Lines 3, 5, 16, 17
- **Fix Needed**: Remove duplicate "strict" and "skipLibCheck" entries

### 4. ⚠️ Port Conflicts
- **Issue**: Frontend tries port 3001 but falls back to 3002
- **Fix**: Either:
  - Kill process using port 3001: `lsof -ti:3001 | xargs kill -9`
  - Update FRONTEND_PORT in .env to 3002

### 5. ⚠️ Redis Warnings
- **Issue**: BullMQ warnings about maxRetriesPerRequest
- **Impact**: Cosmetic only, doesn't affect functionality
- **Fix**: Update Redis configuration in queue service

## Quick Fixes

### Fix TypeScript Configuration
```bash
# Remove duplicate keys from frontend/tsconfig.json
sed -i '' '16d;17d' frontend/tsconfig.json
```

### Clear Port 3001
```bash
# Find and kill process using port 3001
lsof -ti:3001 | xargs kill -9
```

### Fix Redis Configuration
```javascript
// In backend/src/services/queueService.ts
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,  // Add this line
};
```

## Monitoring Commands

### Check Service Health
```bash
# Backend health
curl http://localhost:3000/health

# Check WebSocket
wscat -c ws://localhost:3000/ws?workflowId=test-123

# Check Docker
docker ps

# Check Redis
redis-cli ping
```

### View Logs
```bash
# Backend logs (if using PM2)
pm2 logs backend

# Or direct output
npm run dev 2>&1 | grep -E "(error|warn|WebSocket)"
```

## Performance Optimization

### 1. Database Indexing
- Add indexes for frequently queried fields
- Workflow ID, status, created_at

### 2. Docker Image Caching
- Pre-pull required images during setup
- Use local registry for faster access

### 3. WebSocket Connection Pooling
- Implement connection limits
- Add rate limiting per client

## Security Hardening

### 1. Environment Variables
- Remove API keys from .env before committing
- Use secrets management in production

### 2. CORS Configuration
- Tighten allowed origins in production
- Remove wildcard origin matching

### 3. Input Validation
- Add rate limiting to all endpoints
- Validate workflow targets against whitelist

### 4. Docker Security
- Run containers with limited privileges
- Use security profiles (AppArmor/SELinux)
- Network isolation between containers

## Deployment Preparation

### 1. Production Environment
```bash
# Create production .env
cp .env .env.production
# Edit with production values

# Build for production
npm run build --workspace=frontend
npm run build --workspace=backend
```

### 2. Docker Compose Production
```bash
# Use production compose file
docker-compose -f docker-compose.prod.yml up -d
```

### 3. SSL/TLS Setup
- Use reverse proxy (Nginx/Caddy)
- Configure Let's Encrypt
- Force HTTPS redirect

## Maintenance Tasks

### Daily
- Check error logs
- Monitor disk space
- Verify backup completion

### Weekly
- Update Docker images
- Review security alerts
- Clean old workflows

### Monthly
- Update dependencies
- Security audit
- Performance review