import { Pool } from 'pg';
import { logger } from '../utils/logger';

export interface WorkflowData {
  workflowId: string;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';
  target: string;
  scope: string;
  description?: string;
  template: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  results?: any;
  metadata?: any;
}

export class WorkflowModel {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/soc2_testing',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.initializeDatabase();
  }

  private async initializeDatabase() {
    try {
      // Create workflows table if it doesn't exist
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS workflows (
          workflow_id VARCHAR(255) PRIMARY KEY,
          status VARCHAR(50) NOT NULL,
          target TEXT NOT NULL,
          scope VARCHAR(100) NOT NULL,
          description TEXT,
          template VARCHAR(100) NOT NULL,
          start_time BIGINT NOT NULL,
          end_time BIGINT,
          duration INTEGER,
          results JSONB,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
        CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at);
      `);

      logger.info('Workflow database initialized');
    } catch (error) {
      logger.error('Failed to initialize workflow database', { error });
    }
  }

  async createWorkflow(workflow: WorkflowData): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO workflows (
          workflow_id, status, target, scope, description, template,
          start_time, end_time, duration, results, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          workflow.workflowId,
          workflow.status,
          workflow.target,
          workflow.scope,
          workflow.description,
          workflow.template,
          workflow.startTime,
          workflow.endTime,
          workflow.duration,
          JSON.stringify(workflow.results),
          JSON.stringify(workflow.metadata)
        ]
      );
      logger.debug('Workflow created in database', { workflowId: workflow.workflowId });
    } catch (error) {
      logger.error('Failed to create workflow in database', { error, workflowId: workflow.workflowId });
      throw error;
    }
  }

  async updateWorkflow(workflowId: string, updates: Partial<WorkflowData>): Promise<void> {
    try {
      const updateFields = [];
      const values = [];
      let paramCount = 1;

      Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'workflowId') {
          const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          updateFields.push(`${dbField} = $${paramCount}`);
          values.push(
            key === 'results' || key === 'metadata' 
              ? JSON.stringify(value) 
              : value
          );
          paramCount++;
        }
      });

      if (updateFields.length === 0) return;

      values.push(workflowId);
      
      await this.pool.query(
        `UPDATE workflows 
         SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
         WHERE workflow_id = $${paramCount}`,
        values
      );

      logger.debug('Workflow updated in database', { workflowId });
    } catch (error) {
      logger.error('Failed to update workflow in database', { error, workflowId });
      throw error;
    }
  }

  async getWorkflow(workflowId: string): Promise<WorkflowData | null> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM workflows WHERE workflow_id = $1',
        [workflowId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        workflowId: row.workflow_id,
        status: row.status,
        target: row.target,
        scope: row.scope,
        description: row.description,
        template: row.template,
        startTime: parseInt(row.start_time),
        endTime: row.end_time ? parseInt(row.end_time) : undefined,
        duration: row.duration,
        results: row.results,
        metadata: row.metadata
      };
    } catch (error) {
      logger.error('Failed to get workflow from database', { error, workflowId });
      throw error;
    }
  }

  async getActiveWorkflows(): Promise<WorkflowData[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM workflows 
         WHERE status IN ('pending', 'executing') 
         ORDER BY created_at DESC`
      );

      return result.rows.map(row => ({
        workflowId: row.workflow_id,
        status: row.status,
        target: row.target,
        scope: row.scope,
        description: row.description,
        template: row.template,
        startTime: parseInt(row.start_time),
        endTime: row.end_time ? parseInt(row.end_time) : undefined,
        duration: row.duration,
        results: row.results,
        metadata: row.metadata
      }));
    } catch (error) {
      logger.error('Failed to get active workflows from database', { error });
      throw error;
    }
  }

  async deleteOldWorkflows(daysOld: number = 30): Promise<number> {
    try {
      const result = await this.pool.query(
        `DELETE FROM workflows 
         WHERE created_at < NOW() - INTERVAL '${daysOld} days'
         AND status IN ('completed', 'failed', 'cancelled')`
      );

      return result.rowCount || 0;
    } catch (error) {
      logger.error('Failed to delete old workflows', { error });
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}