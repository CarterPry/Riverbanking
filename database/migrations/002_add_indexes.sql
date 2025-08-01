-- Migration: 002_add_indexes.sql
-- Description: Add performance indexes including HNSW vector indexes

BEGIN;

-- Basic B-tree indexes for common queries
CREATE INDEX IF NOT EXISTS idx_findings_workflow ON soc2.findings(workflow_id);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON soc2.findings(severity);
CREATE INDEX IF NOT EXISTS idx_findings_created ON soc2.findings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_findings_target ON soc2.findings(target);

CREATE INDEX IF NOT EXISTS idx_attack_patterns_type ON soc2.attack_patterns(attack_type);
CREATE INDEX IF NOT EXISTS idx_attack_patterns_auth ON soc2.attack_patterns(requires_auth);

CREATE INDEX IF NOT EXISTS idx_test_history_target ON soc2.test_history(target);
CREATE INDEX IF NOT EXISTS idx_test_history_workflow ON soc2.test_history(workflow_id);
CREATE INDEX IF NOT EXISTS idx_test_history_created ON soc2.test_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_embedding_cache_hash ON soc2.embedding_cache(text_hash);
CREATE INDEX IF NOT EXISTS idx_embedding_cache_expires ON soc2.embedding_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_user_intents_workflow ON soc2.user_intents(workflow_id);
CREATE INDEX IF NOT EXISTS idx_user_intents_type ON soc2.user_intents(classified_type);

-- HNSW indexes for vector similarity search
-- These provide fast approximate nearest neighbor search

-- Findings embedding index
CREATE INDEX IF NOT EXISTS idx_findings_embedding ON soc2.findings 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Attack patterns embedding index
CREATE INDEX IF NOT EXISTS idx_attack_patterns_embedding ON soc2.attack_patterns 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- User intents embedding index
CREATE INDEX IF NOT EXISTS idx_user_intents_embedding ON soc2.user_intents 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Embedding cache index
CREATE INDEX IF NOT EXISTS idx_embedding_cache_embedding ON soc2.embedding_cache
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Compound indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_findings_workflow_severity ON soc2.findings(workflow_id, severity);
CREATE INDEX IF NOT EXISTS idx_test_history_target_created ON soc2.test_history(target, created_at DESC);

-- GIN indexes for JSONB fields
CREATE INDEX IF NOT EXISTS idx_findings_metadata ON soc2.findings USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_findings_evidence ON soc2.findings USING gin(evidence);
CREATE INDEX IF NOT EXISTS idx_attack_patterns_tools ON soc2.attack_patterns USING gin(tools);

COMMIT; 