# SOC2 Testing Platform

AI-enhanced monorepo for automating SOC 2 penetration testing with intelligent attack classification, progressive testing, and compliance reporting.

## 🚀 Overview

This platform automates security testing for SOC2 compliance by:
- Using AI/ML for intelligent attack classification and routing
- Executing security tests in isolated Docker containers
- Providing real-time monitoring and progress tracking
- Generating comprehensive compliance reports
- Supporting Human-in-the-Loop (HITL) for critical operations

## 📋 Table of Contents

- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Development](#development)
- [Testing](#testing)
- [Configuration](#configuration)
- [Contributing](#contributing)

## 🏗️ Architecture

### High-Level Pipeline Flow

```mermaid
graph TD
    A[Frontend Form Input] --> B[API Layer: POST /run-soc2-workflow]
    B --> C[Intent Classification]
    C --> D[Trust Classifier]
    D --> E[Methodology Router]
    E --> F[Context Enrichment]
    F --> G{Critical/Auth Required?}
    G -->|Yes| H[HITL Review]
    G -->|No| I[Queue/Spawner]
    H --> I
    I --> J[Parallel Agents]
    J --> K[Result Processing]
    K --> L[Anomaly Detection]
    L --> M[Evidence Export]
    M --> N[Memory Update]
    N --> O[Dashboard Output]
```

### Key Components

1. **Intent Classification**: Uses embeddings to match input to curated attack patterns
2. **Context Enrichment**: Queries historical data via pgvector for relevance
3. **Parallel Execution**: Spawns concurrent agents with progressive testing
4. **HITL Integration**: Requires approval for critical or auth-required tests
5. **Real-time Monitoring**: WebSocket-based progress updates

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm >= 8.0.0
- Docker and Docker Compose
- PostgreSQL (for pgvector)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd soc2-testing-platform
```

2. Copy environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Install dependencies:
```bash
npm install
```

4. Start development servers:
```bash
npm run dev
```

The backend will run on http://localhost:3000 and frontend on http://localhost:3001

## 📁 Project Structure

```
soc2-testing-platform/
├── backend/                 # Node.js/Express backend
│   ├── src/
│   │   ├── api/            # REST endpoints
│   │   ├── layers/         # Pipeline layers
│   │   ├── mcp-server/     # MCP orchestration
│   │   ├── services/       # Shared services
│   │   └── compliance/     # SOC2 mappings
│   └── tests/              # Backend tests
├── frontend/               # React frontend
│   ├── src/
│   │   ├── pages/         # React pages
│   │   ├── components/    # UI components
│   │   └── services/      # API clients
│   └── public/            # Static assets
├── shared/                # Shared types
├── database/              # DB schemas
├── docker/                # Docker configs
├── monitoring/            # Observability stack
└── templates/             # Attack methodologies
```

## 🛠️ Development

### Backend Development

```bash
cd backend
npm run dev  # Start with hot reload
```

Key endpoints:
- `GET /health` - Health check
- `GET /api/hello` - Test endpoint
- `POST /api/run-soc2-workflow` - Main workflow endpoint

### Frontend Development

```bash
cd frontend
npm run dev  # Start Vite dev server
```

Access at http://localhost:3001

### Running Tests

```bash
# All tests
npm run test:all

# Backend only
npm run test --workspace=backend

# Frontend only
npm run test --workspace=frontend
```

## ⚙️ Configuration

### Environment Variables

Key configuration in `.env`:

```bash
# Database
PG_CONNECTION_STRING=postgresql://user:pass@localhost:5432/soc2_testing

# API
API_PORT=3000
FRONTEND_PORT=3001

# Security
JWT_SECRET=your-secret-key

# AI/Embeddings
EMBEDDING_API_URL=http://localhost:11434/api/embeddings
LLM_TEMPERATURE=0.2

# Features
ENABLE_HITL=true
ENABLE_PROGRESSIVE_TESTING=true
```

### Docker Services

The platform uses several Docker services:
- **Kali Linux**: Security testing tools
- **PostgreSQL + pgvector**: Embeddings storage
- **Redis**: Job queue
- **Monitoring Stack**: Prometheus, Grafana, Loki

## 🧪 Testing

### Unit Tests
```bash
npm run test --workspace=backend -- --testPathPattern=unit
```

### Integration Tests
```bash
npm run test --workspace=backend -- --testPathPattern=integration
```

### E2E Tests
```bash
npm run test --workspace=backend -- --testPathPattern=e2e
```

## 📊 Monitoring

Access monitoring dashboards:
- Grafana: http://localhost:3002
- Prometheus: http://localhost:9090
- Jaeger: http://localhost:16686

## 🔐 Security Considerations

- All security tests run in isolated Docker containers
- Authentication required for sensitive operations
- Rate limiting on API endpoints
- Comprehensive audit logging
- No external data transmission

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details

## 🎯 Roadmap

- [x] Monorepo setup
- [x] Basic backend/frontend scaffolding
- [ ] Complete pipeline implementation
- [ ] AI/ML integration
- [ ] Full test coverage
- [ ] Production deployment

## 📚 Additional Resources

- [SOC2 Compliance Guide](docs/soc2-guide.md)
- [API Documentation](docs/api-spec.yaml)
- [Architecture Details](docs/architecture.md)

---

Built with ❤️ for secure and compliant infrastructure 