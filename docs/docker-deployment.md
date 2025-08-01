# Docker Deployment Guide

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 1.29+
- 8GB RAM minimum (16GB recommended)
- 20GB free disk space

## Quick Start

### 1. Clone Repository
```bash
git clone <repository-url>
cd multicontext
```

### 2. Environment Setup
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Start Services
```bash
# Development mode
docker-compose up -d

# Production mode
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 4. Initialize Database
```bash
./scripts/setup-docker-db.sh
```

### 5. Access Applications
- Frontend: http://localhost:3001
- Backend API: http://localhost:3000
- Grafana: http://localhost:3002 (admin/admin)
- Prometheus: http://localhost:9090
- Jaeger: http://localhost:16686

## Service Management

### Starting Services
```bash
# Start all services
docker-compose up -d

# Start specific services
docker-compose up -d backend frontend db

# View logs
docker-compose logs -f backend
```

### Stopping Services
```bash
# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: deletes data)
docker-compose down -v
```

### Restarting Services
```bash
# Restart a specific service
docker-compose restart backend

# Rebuild and restart
docker-compose up -d --build backend
```

## Monitoring

### Grafana Dashboards
1. Access Grafana at http://localhost:3002
2. Default credentials: admin/admin
3. Pre-configured dashboards:
   - Restraint & CC Dashboard
   - System Performance
   - Application Metrics

### Prometheus Queries
Access Prometheus at http://localhost:9090

Example queries:
```promql
# Restraint failures rate
rate(restraint_failures_total[5m])

# Anomaly score
anomaly_score

# API latency (95th percentile)
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

### Log Aggregation
View logs in Grafana via Loki datasource:
1. Go to Explore in Grafana
2. Select Loki datasource
3. Query examples:
   ```
   {job="backend"} |= "error"
   {job="kali"} |= "vulnerability"
   ```

### Distributed Tracing
Access Jaeger UI at http://localhost:16686
- Search by service: backend, frontend
- View request flows
- Analyze latency

## Security Configuration

### Kali Container Isolation
The Kali container runs in an isolated network by default:
```yaml
networks:
  isolated-test:
    internal: true
```

To allow external access for specific tests:
```bash
docker-compose run --rm kali nmap scanme.nmap.org
```

### AppArmor Profile
Load custom AppArmor profile:
```bash
sudo apparmor_parser -r docker/security-policies/apparmor-profile
```

### Seccomp Profile
Applied automatically via docker-compose.prod.yml

## Troubleshooting

### Common Issues

#### 1. Port Conflicts
```bash
# Check what's using a port
lsof -i :3000

# Change port in docker-compose.yml
```

#### 2. Database Connection Failed
```bash
# Check if database is running
docker-compose ps db

# View database logs
docker-compose logs db

# Manually connect
docker-compose exec db psql -U user -d soc2db
```

#### 3. Out of Memory
```bash
# Check container resource usage
docker stats

# Increase memory limits in docker-compose.prod.yml
```

#### 4. Slow Performance
```bash
# Check Docker system resources
docker system df

# Clean up unused resources
./scripts/cleanup-docker.sh --prune
```

### Debug Commands

```bash
# Enter a running container
docker-compose exec backend bash

# Run one-off command
docker-compose run --rm backend npm test

# Check container health
docker-compose ps

# View recent logs
docker-compose logs --tail=100 backend

# Follow logs in real-time
docker-compose logs -f
```

## Backup & Restore

### Backup Database
```bash
# Create backup
docker-compose exec db pg_dump -U user soc2db > backup.sql

# With timestamp
docker-compose exec db pg_dump -U user soc2db > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore Database
```bash
# Restore from backup
docker-compose exec -T db psql -U user -d soc2db < backup.sql
```

### Backup Volumes
```bash
# Backup all volumes
docker run --rm -v multicontext_pgdata:/data -v $(pwd):/backup alpine tar czf /backup/pgdata-backup.tar.gz -C /data .
```

## Production Deployment

### SSL/TLS Configuration
1. Add reverse proxy service to docker-compose.prod.yml
2. Configure SSL certificates
3. Update frontend to use HTTPS endpoints

### Environment Variables
Required for production:
```env
NODE_ENV=production
PROD_DB_PASS=<secure-password>
REDIS_PASSWORD=<secure-password>
GRAFANA_ADMIN_PASSWORD=<secure-password>
JWT_SECRET=<secure-secret>
```

### Resource Limits
Set in docker-compose.prod.yml:
```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

### Health Checks
Configure health checks for critical services:
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

## Maintenance

### Regular Tasks
1. **Daily**: Check monitoring dashboards
2. **Weekly**: Review logs for errors
3. **Monthly**: Update Docker images
4. **Quarterly**: Security patches

### Update Procedure
```bash
# Pull latest changes
git pull origin main

# Update images
docker-compose pull

# Restart services
docker-compose up -d

# Run migrations
./scripts/setup-docker-db.sh
```

### Cleanup
```bash
# Remove stopped containers
docker container prune

# Remove unused images
docker image prune

# Full cleanup (careful!)
./scripts/cleanup-docker.sh --all
```