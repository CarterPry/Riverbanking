-- SOC2 Testing Platform Database Schema
-- Full schema dump for reference and documentation
-- Generated from migrations 001 and 002

-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS soc2;

-- Tables
CREATE TABLE soc2.findings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL,
  attack_id VARCHAR(255) NOT NULL,
  tool_name VARCHAR(255) NOT NULL,
  target VARCHAR(512) NOT NULL,
  severity VARCHAR(50) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  finding_type VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  embedding vector(768),
  remediation TEXT,
  evidence JSONB,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE soc2.attack_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attack_id VARCHAR(255) UNIQUE NOT NULL,
  attack_name VARCHAR(512) NOT NULL,
  description TEXT NOT NULL,
  attack_type VARCHAR(255) NOT NULL,
  embedding vector(768),
  tsc TEXT[] NOT NULL DEFAULT '{}',
  cc TEXT[] NOT NULL DEFAULT '{}',
  tools JSONB NOT NULL DEFAULT '[]',
  requires_auth BOOLEAN DEFAULT false,
  progressive BOOLEAN DEFAULT false,
  evidence_required TEXT[] DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE soc2.test_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL,
  target VARCHAR(512) NOT NULL,
  attack_pattern_id UUID REFERENCES soc2.attack_patterns(id),
  success_rate DECIMAL(5,2) CHECK (success_rate >= 0 AND success_rate <= 100),
  execution_time INTEGER NOT NULL,
  findings_count INTEGER DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE soc2.embedding_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  text_hash VARCHAR(64) UNIQUE NOT NULL,
  text TEXT NOT NULL,
  embedding vector(768) NOT NULL,
  model_name VARCHAR(255) DEFAULT 'nomic-embed-text',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP + INTERVAL '30 days'
);

CREATE TABLE soc2.user_intents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL,
  raw_input TEXT NOT NULL,
  classified_type VARCHAR(255) NOT NULL,
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  embedding vector(768),
  matched_attacks JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Functions
CREATE OR REPLACE FUNCTION soc2.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers
CREATE TRIGGER update_findings_updated_at 
  BEFORE UPDATE ON soc2.findings 
  FOR EACH ROW 
  EXECUTE FUNCTION soc2.update_updated_at_column();

-- Indexes
-- B-tree indexes
CREATE INDEX idx_findings_workflow ON soc2.findings(workflow_id);
CREATE INDEX idx_findings_severity ON soc2.findings(severity);
CREATE INDEX idx_findings_created ON soc2.findings(created_at DESC);
CREATE INDEX idx_findings_target ON soc2.findings(target);
CREATE INDEX idx_findings_workflow_severity ON soc2.findings(workflow_id, severity);

CREATE INDEX idx_attack_patterns_type ON soc2.attack_patterns(attack_type);
CREATE INDEX idx_attack_patterns_auth ON soc2.attack_patterns(requires_auth);

CREATE INDEX idx_test_history_target ON soc2.test_history(target);
CREATE INDEX idx_test_history_workflow ON soc2.test_history(workflow_id);
CREATE INDEX idx_test_history_created ON soc2.test_history(created_at DESC);
CREATE INDEX idx_test_history_target_created ON soc2.test_history(target, created_at DESC);

CREATE INDEX idx_embedding_cache_hash ON soc2.embedding_cache(text_hash);
CREATE INDEX idx_embedding_cache_expires ON soc2.embedding_cache(expires_at);

CREATE INDEX idx_user_intents_workflow ON soc2.user_intents(workflow_id);
CREATE INDEX idx_user_intents_type ON soc2.user_intents(classified_type);

-- HNSW vector indexes
CREATE INDEX idx_findings_embedding ON soc2.findings 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_attack_patterns_embedding ON soc2.attack_patterns 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_user_intents_embedding ON soc2.user_intents 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_embedding_cache_embedding ON soc2.embedding_cache
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- GIN indexes for JSONB
CREATE INDEX idx_findings_metadata ON soc2.findings USING gin(metadata);
CREATE INDEX idx_findings_evidence ON soc2.findings USING gin(evidence);
CREATE INDEX idx_attack_patterns_tools ON soc2.attack_patterns USING gin(tools); 