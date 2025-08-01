-- Migration: 001_create_tables.sql
-- Description: Create initial tables for SOC2 testing platform

BEGIN;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create schema
CREATE SCHEMA IF NOT EXISTS soc2;

-- Findings table
CREATE TABLE IF NOT EXISTS soc2.findings (
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

-- Attack patterns table
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

-- Test history table
CREATE TABLE IF NOT EXISTS soc2.test_history (
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

-- Embedding cache table
CREATE TABLE IF NOT EXISTS soc2.embedding_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  text_hash VARCHAR(64) UNIQUE NOT NULL,
  text TEXT NOT NULL,
  embedding vector(768) NOT NULL,
  model_name VARCHAR(255) DEFAULT 'nomic-embed-text',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP + INTERVAL '30 days'
);

-- User intents table
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

-- Update trigger function
CREATE OR REPLACE FUNCTION soc2.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger
CREATE TRIGGER update_findings_updated_at 
  BEFORE UPDATE ON soc2.findings 
  FOR EACH ROW 
  EXECUTE FUNCTION soc2.update_updated_at_column();

COMMIT; 