# SOC2 Security Testing Platform - User Guide

## Table of Contents
1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Full Workflow Examples](#full-workflow-examples)
4. [Restraint Mechanisms](#restraint-mechanisms)
5. [Understanding CC Tags](#understanding-cc-tags)
6. [Performance Considerations](#performance-considerations)

## Overview

The SOC2 Security Testing Platform provides automated security assessments with AI-driven intent classification, RAG-enhanced context, and SOC2 control mapping. The system includes built-in restraint mechanisms to prevent unauthorized testing and ensure compliance.

## Getting Started

### Prerequisites
- Docker and Docker Compose installed
- Node.js 18+ (for local development)
- PostgreSQL with pgvector extension

### Quick Start

```bash
# Start the full stack
docker-compose up -d

# Access the application
# Frontend: http://localhost:5173
# Backend API: http://localhost:3000/api
# PostgreSQL: localhost:5432
```

## Full Workflow Examples

### Example 1: Test CC6.1 Post-Login

This example demonstrates testing access controls after authentication, which maps to SOC2 Common Criteria CC6.1 (Logical and Physical Access Controls).

1. **Submit the Form**
   ```
   Target: https://myapp.example.com
   Description: test access controls post-login
   Template: security-comprehensive
   ```

2. **System Response**
   - Intent Classification: Identifies "authentication" and "access control" intents
   - Attack Matching: Selects attacks like:
     - SQL injection (post-auth)
     - Privilege escalation
     - Session hijacking
   - CC Mapping: CC6.1, CC6.2, CC6.7

3. **Restraint Trigger**
   - System detects `requiresAuth` attacks
   - HITL approval dialog appears: "5 attacks require authenticated session"
   - User must provide credentials or approve testing

4. **Real-time Updates**
   ```json
   {
     "type": "progress",
     "data": {
       "phase": "testing",
       "progress": "Testing SQL injection on /api/users",
       "cc": ["CC6.1", "CC6.2"],
       "attacks": 8
     }
   }
   ```

5. **Final Report**
   - Compliance Score: 85%
   - CC6.1 Coverage: 90%
   - Findings: 2 high, 3 medium
   - Recommendations: Implement parameterized queries, strengthen session management

### Example 2: API Security Assessment

Testing REST API endpoints for common vulnerabilities.

1. **Submit Request**
   ```
   Target: https://api.example.com/v2
   Description: REST API security assessment including auth bypass
   Template: security-quick
   ```

2. **Workflow Processing**
   - Classified as: API Security, Authentication
   - Matched Attacks: 
     - API key exposure
     - JWT vulnerabilities
     - Rate limiting bypass
   - CC Tags: CC6.1, CC6.5, CC7.1

3. **No Restraint** (public API)
   - Tests proceed without HITL
   - Real-time dashboard updates
   - WebSocket messages show progress

### Example 3: Critical Infrastructure Test (HITL Required)

1. **Submit Request**
   ```
   Target: https://payment.critical-app.com
   Description: test payment processing security critical infrastructure
   Template: security-comprehensive
   ```

2. **HITL Trigger**
   - System identifies:
     - Critical severity attacks (10)
     - Sensitive CC codes (CC1.1 - Governance)
     - Payment processing target
   
3. **Approval Dialog**
   ```
   Human Approval Required:
   - 10 critical severity attacks require approval
   - Attacks targeting sensitive control areas require approval
   - Payment processing infrastructure detected
   
   [Deny] [Approve]
   ```

4. **Upon Approval**
   - Tests execute with additional logging
   - Higher detail in findings
   - Executive summary generated

## Restraint Mechanisms

### Authentication-Based Restraint

Attacks marked with `requiresAuth: true` trigger restraint when no credentials provided:

```javascript
// Attack Example
{
  name: "SQL Injection - Post Login",
  requiresAuth: true,
  severity: "high"
}
```

**User Experience:**
1. Form submitted without auth
2. System prompts for credentials
3. User can:
   - Provide username/password
   - Cancel (workflow stops)
   - Approve without auth (if authorized)

### HITL (Human-in-the-Loop) Restraint

Triggered by:
- Critical severity attacks
- Large attack volume (>5 without auth)
- Sensitive CC codes (governance, physical security)
- Progressive attacks without authentication

**Example Scenarios:**
```
Scenario 1: "test critical vulnerabilities"
→ HITL: "5 critical severity attacks require approval"

Scenario 2: "comprehensive scan" (unauthenticated)
→ HITL: "Large number of attacks without authentication requires approval"

Scenario 3: "test physical security controls"
→ HITL: "Attacks targeting sensitive control areas require approval"
```

## Understanding CC Tags

### Common CC Mappings

| Attack Type | Typical CC Codes | Description |
|------------|------------------|-------------|
| SQL Injection | CC6.1, CC6.7 | Logical access, data integrity |
| XSS | CC6.1, CC6.6 | Access control, input validation |
| Authentication Bypass | CC6.1, CC6.2 | Access control, user authentication |
| Data Exposure | CC6.5, CC8.1 | Data classification, privacy |
| DoS/DDoS | CC7.1, CC7.2 | Availability, capacity planning |

### Reading Your Report

```
Finding: SQL Injection in Login Form
Severity: High
Control: CC6.1 - Logical Access Controls
Impact: Unauthorized database access possible
```

This indicates:
- The vulnerability affects logical access controls
- It's a high-priority fix for SOC2 compliance
- Remediation will improve CC6.1 coverage

## Performance Considerations

### Scalability Metrics

Based on load testing with Artillery:

| Metric | Value | Notes |
|--------|-------|-------|
| Concurrent Workflows | 20 | Tested limit |
| Avg Response Time | <500ms | API endpoints |
| Peak Throughput | 60 req/s | With caching |
| WebSocket Connections | 100+ | Concurrent |

### Optimization Tips

1. **Use Quick Scans for Rapid Assessment**
   - 5-10 minute duration
   - Focused attack set
   - Good for CI/CD integration

2. **Batch Similar Targets**
   - RAG context improves with history
   - Embeddings are cached
   - Better pattern detection

3. **Schedule Comprehensive Scans**
   - Run during off-hours
   - Can take 30-60 minutes
   - Most thorough coverage

### Load Test Results

```bash
# Run load test
npm run test:load

# Results (10 concurrent workflows)
✓ Warm up: 100% success rate
✓ Ramp up: 99.5% success rate  
✓ Peak load: 98% success rate
✓ P95 latency: 850ms
✓ P99 latency: 1200ms
```

## Advanced Usage

### API Integration

```bash
# Direct API call with auth
curl -X POST http://localhost:3000/api/run-soc2-workflow \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "target": "https://api.example.com",
    "scope": "security",
    "description": "automated security scan",
    "auth": {
      "username": "testuser",
      "password": "testpass"
    }
  }'
```

### WebSocket Monitoring

```javascript
// Connect to WebSocket for real-time updates
const ws = new WebSocket('ws://localhost:3000/ws?workflowId=YOUR_WORKFLOW_ID');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch(message.type) {
    case 'progress':
      console.log(`Phase: ${message.data.phase}`);
      console.log(`CC Coverage: ${message.data.cc.join(', ')}`);
      break;
    case 'restraint':
      console.log(`Restraint: ${message.restraint}`);
      // Handle HITL or auth requirements
      break;
    case 'result':
      console.log(`Complete! Score: ${message.data.score}%`);
      break;
  }
};
```

### Handling Edge Cases

1. **Network Timeouts**
   - Default timeout: 30 seconds per attack
   - Configurable via options.timeout
   - Automatic retry for transient failures

2. **Large Target Lists**
   - Use CSV upload (coming soon)
   - Batch processing available
   - Progress saved between runs

3. **Custom Attack Patterns**
   - Add to attack-mapping.ts
   - Include TSC and CC mappings
   - Test with small scope first

## Troubleshooting

### Common Issues

1. **"Workflow rejected by user"**
   - You cancelled HITL approval
   - Re-submit and approve when prompted

2. **"Insufficient permissions"**
   - Add auth token to request
   - Check user role permissions

3. **Slow Performance**
   - Check PostgreSQL indexes
   - Ensure Redis is running
   - Monitor Docker resources

4. **Missing CC Tags**
   - Verify attack mappings
   - Check intent classification
   - Review TSC assignments

### Debug Mode

Enable detailed logging:
```bash
# Backend
DEBUG=soc2:* npm run dev

# Frontend  
VITE_DEBUG=true npm run dev
```

## Deployment

### Production Deployment

#### Prerequisites
- Docker Hub account (or other container registry)
- Production server with Docker and Docker Compose
- SSL certificates for HTTPS
- Production database with backups configured

#### Step 1: Build and Push Images

Images are automatically built and pushed via GitHub Actions on release:

```bash
# Create a new release
git tag v1.0.0
git push origin v1.0.0

# Or manually trigger deployment
gh workflow run deploy.yml --field tag_name=v1.0.0
```

#### Step 2: Production Configuration

1. **Copy and configure environment variables:**
   ```bash
   cp .env.prod .env
   # Edit .env with production values
   ```

2. **Key configurations to update:**
   - Database credentials
   - API keys (OpenAI, etc.)
   - JWT secret
   - SSL certificates
   - CORS origins
   - Redis password

#### Step 3: Deploy with Docker Compose

```bash
# Deploy with production compose file
docker-compose -f docker-compose.prod.yml up -d

# Scale backend for high availability
docker-compose -f docker-compose.prod.yml up -d --scale backend=3

# Verify all services are running
docker-compose -f docker-compose.prod.yml ps
```

#### Step 4: Database Initialization

```bash
# Run database migrations
docker-compose -f docker-compose.prod.yml exec backend npm run db:migrate

# Verify embeddings are loaded
docker-compose -f docker-compose.prod.yml exec postgres psql -U prod_user -d soc2db_prod -c "SELECT COUNT(*) FROM embeddings;"
```

### Kubernetes Deployment

For enterprise deployments, use Kubernetes:

```yaml
# k8s/deployment.yaml example
apiVersion: apps/v1
kind: Deployment
metadata:
  name: soc2-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: soc2-backend
  template:
    metadata:
      labels:
        app: soc2-backend
    spec:
      containers:
      - name: backend
        image: yourusername/soc2-backend:v1.0.0
        envFrom:
        - secretRef:
            name: soc2-secrets
        ports:
        - containerPort: 3001
```

Deploy to Kubernetes:
```bash
kubectl apply -f k8s/
kubectl scale deployment soc2-backend --replicas=5
```

### Monitoring in Production

1. **Access monitoring dashboards:**
   - Grafana: http://your-domain:3000
   - Prometheus: http://your-domain:9090
   - Jaeger: http://your-domain:16686

2. **Set up alerts:**
   ```bash
   # Configure Prometheus alerts
   docker-compose -f docker-compose.prod.yml exec prometheus reload
   ```

3. **Monitor key metrics:**
   - Request latency
   - Error rates
   - Database connections
   - Queue depth
   - Docker resource usage

### Security Hardening

1. **Enable AppArmor profiles:**
   ```bash
   docker run --security-opt apparmor=soc2-profile ...
   ```

2. **Apply seccomp policies:**
   ```bash
   docker run --security-opt seccomp=./docker/security-policies/seccomp-profile.json ...
   ```

3. **Network isolation:**
   ```bash
   # Use isolated networks
   docker network create --driver bridge --opt encrypted soc2-secure
   ```

### Backup and Recovery

1. **Automated backups:**
   ```bash
   # Database backup
   docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U prod_user soc2db_prod > backup.sql

   # Full system backup
   ./scripts/backup-prod.sh
   ```

2. **Restore procedure:**
   ```bash
   # Restore database
   docker-compose -f docker-compose.prod.yml exec -T postgres psql -U prod_user soc2db_prod < backup.sql
   ```

### CI/CD Pipeline

The platform includes automated CI/CD:

1. **On every push:**
   - Runs unit and integration tests
   - Performs security scanning
   - Checks code formatting

2. **On release:**
   - Builds multi-platform Docker images
   - Pushes to container registry
   - Creates deployment manifest

3. **Manual deployment:**
   ```bash
   # Trigger deployment workflow
   gh workflow run deploy.yml
   ```

### Scaling Considerations

1. **Horizontal scaling:**
   ```bash
   # Scale backend instances
   docker-compose -f docker-compose.prod.yml up -d --scale backend=5

   # Scale worker processes
   docker-compose -f docker-compose.prod.yml up -d --scale worker=3
   ```

2. **Database optimization:**
   - Enable connection pooling
   - Configure read replicas
   - Optimize indexes

3. **Caching strategy:**
   - Redis for session management
   - CDN for static assets
   - Query result caching

## Conclusion

The SOC2 Security Testing Platform provides comprehensive security assessment with built-in compliance mapping and safety controls. The restraint mechanisms ensure responsible testing while the real-time updates and detailed reporting support both technical and compliance teams.

For additional support or feature requests, please refer to the project documentation or submit an issue on GitHub. 