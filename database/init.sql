-- Database initialization for SOC2 Testing Platform
-- Requires pgvector extension for embeddings

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create schema
CREATE SCHEMA IF NOT EXISTS soc2;

-- Findings table for storing security test results with embeddings
CREATE TABLE IF NOT EXISTS soc2.findings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL,
  attack_id VARCHAR(255) NOT NULL,
  tool_name VARCHAR(255) NOT NULL,
  target VARCHAR(512) NOT NULL,
  severity VARCHAR(50) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  finding_type VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  embedding vector(768), -- Ollama nomic-embed-text dimension
  remediation TEXT,
  evidence JSONB,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Attack patterns table for storing curated attacks with embeddings
CREATE TABLE IF NOT EXISTS soc2.attack_patterns (
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

-- Historical test results for learning
CREATE TABLE IF NOT EXISTS soc2.test_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL,
  target VARCHAR(512) NOT NULL,
  attack_pattern_id UUID REFERENCES soc2.attack_patterns(id),
  success_rate DECIMAL(5,2) CHECK (success_rate >= 0 AND success_rate <= 100),
  execution_time INTEGER NOT NULL, -- milliseconds
  findings_count INTEGER DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Embeddings cache for common queries
CREATE TABLE IF NOT EXISTS soc2.embedding_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  text_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA256 of input text
  text TEXT NOT NULL,
  embedding vector(768) NOT NULL,
  model_name VARCHAR(255) DEFAULT 'nomic-embed-text',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP + INTERVAL '30 days'
);

-- User intents for classification history
CREATE TABLE IF NOT EXISTS soc2.user_intents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL,
  raw_input TEXT NOT NULL,
  classified_type VARCHAR(255) NOT NULL,
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  embedding vector(768),
  matched_attacks JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_findings_workflow ON soc2.findings(workflow_id);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON soc2.findings(severity);
CREATE INDEX IF NOT EXISTS idx_findings_created ON soc2.findings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attack_patterns_type ON soc2.attack_patterns(attack_type);
CREATE INDEX IF NOT EXISTS idx_test_history_target ON soc2.test_history(target);
CREATE INDEX IF NOT EXISTS idx_embedding_cache_hash ON soc2.embedding_cache(text_hash);
CREATE INDEX IF NOT EXISTS idx_embedding_cache_expires ON soc2.embedding_cache(expires_at);

-- Create vector similarity search indexes (HNSW for better performance)
CREATE INDEX IF NOT EXISTS idx_findings_embedding ON soc2.findings 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_attack_patterns_embedding ON soc2.attack_patterns 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_user_intents_embedding ON soc2.user_intents 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Create update trigger for updated_at
CREATE OR REPLACE FUNCTION soc2.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_findings_updated_at 
  BEFORE UPDATE ON soc2.findings 
  FOR EACH ROW 
  EXECUTE FUNCTION soc2.update_updated_at_column(); 