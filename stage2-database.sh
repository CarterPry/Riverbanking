#!/bin/bash

echo "======================================"
echo "Stage 2: Database Setup"
echo "======================================"

# Load environment variables
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL not set in .env"
    echo "Please add DATABASE_URL to your .env file"
    echo "Example: DATABASE_URL=postgresql://user:password@localhost:5432/restraint"
    exit 1
fi

echo "1. Testing database connection..."
# Test connection with psql if available
if command -v psql &> /dev/null; then
    psql "$DATABASE_URL" -c "SELECT NOW();" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "✅ Database connection successful"
    else
        echo "❌ Database connection failed"
        echo "Please check your DATABASE_URL"
        exit 1
    fi
else
    echo "⚠️  psql not found, skipping connection test"
fi

echo "2. Creating database tables..."

# Create SQL file for tables
cat > create_ai_tables.sql << 'EOF'
-- AI Decisions table for audit logging
CREATE TABLE IF NOT EXISTS ai_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id VARCHAR(255) NOT NULL,
    decision_type VARCHAR(100) NOT NULL,
    input JSONB NOT NULL,
    output JSONB NOT NULL,
    metadata JSONB,
    outcome JSONB,
    audit_flags JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for AI decisions
CREATE INDEX IF NOT EXISTS idx_ai_decisions_workflow ON ai_decisions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_type ON ai_decisions(decision_type);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_created ON ai_decisions(created_at);

-- Approval requests table
CREATE TABLE IF NOT EXISTS approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    requester JSONB NOT NULL,
    context JSONB NOT NULL,
    metadata JSONB,
    response JSONB,
    escalation JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for approval requests
CREATE INDEX IF NOT EXISTS idx_approval_requests_workflow ON approval_requests(workflow_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);

-- Workflow results table
CREATE TABLE IF NOT EXISTS workflow_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) NOT NULL,
    target VARCHAR(255) NOT NULL,
    user_intent TEXT NOT NULL,
    phases JSONB,
    findings JSONB,
    executive_summary TEXT,
    owasp_coverage JSONB,
    cc_controls JSONB,
    recommendations JSONB,
    audit_report JSONB,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    duration INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for workflow results
CREATE INDEX IF NOT EXISTS idx_workflow_results_status ON workflow_results(status);
CREATE INDEX IF NOT EXISTS idx_workflow_results_target ON workflow_results(target);
EOF

# Execute SQL
if command -v psql &> /dev/null; then
    echo "Running SQL script..."
    psql "$DATABASE_URL" -f create_ai_tables.sql
    if [ $? -eq 0 ]; then
        echo "✅ Database tables created successfully"
    else
        echo "❌ Failed to create database tables"
        exit 1
    fi
else
    echo "⚠️  psql not found. Please run the following SQL manually:"
    echo ""
    cat create_ai_tables.sql
    echo ""
fi

# Clean up
rm -f create_ai_tables.sql

echo ""
echo "Stage 2 Complete! ✅"
echo ""
echo "Database is ready for AI decision logging"
echo "Next: Run stage3-docker.sh to pull Docker images"