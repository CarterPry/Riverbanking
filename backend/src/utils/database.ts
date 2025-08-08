import pg from 'pg';
import { createLogger } from './logger.js';

const { Pool } = pg;
const logger = createLogger('Database');

let pool: pg.Pool | null = null;

export async function setupDatabase(): Promise<pg.Pool> {
  if (pool) {
    return pool;
  }

  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test connection
    await pool.query('SELECT NOW()');
    logger.info('Database connection established');

    // Create tables if they don't exist
    await createTables();

    return pool;
  } catch (error) {
    logger.error('Failed to setup database', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      connectionString: process.env.DATABASE_URL?.replace(/password=.*@/, 'password=***@')
    });
    throw error;
  }
}

async function createTables(): Promise<void> {
  if (!pool) throw new Error('Database not initialized');

  try {
    // Create AI decisions table for audit logging
    await pool.query(`
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
      )
    `);

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_decisions_workflow 
      ON ai_decisions(workflow_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_decisions_type 
      ON ai_decisions(decision_type)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_decisions_created 
      ON ai_decisions(created_at)
    `);

    // Create approval requests table
    await pool.query(`
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
      )
    `);

    // Create workflow results table
    await pool.query(`
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
      )
    `);

    logger.info('Database tables created/verified');
  } catch (error) {
    logger.error('Failed to create tables', { error });
    throw error;
  }
}

export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call setupDatabase() first.');
  }
  return pool;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection closed');
  }
}