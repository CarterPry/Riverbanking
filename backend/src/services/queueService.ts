import { Queue, Worker, QueueEvents, Job, JobsOptions, WorkerOptions } from 'bullmq';
import { createLogger } from '../utils/logger.js';
import { EnrichedAttack } from '../models/viableAttacks.js';
import { TestResult } from '../models/testResult.js';
import { MCPServer } from '../mcp-server/server.js';

const logger = createLogger('QueueService');

export interface TestJob {
  workflowId: string;
  attack: EnrichedAttack;
  target: string;
  auth?: any;
  priority: 'critical' | 'standard' | 'low';
}

export interface QueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export class QueueService {
  private testQueue: Queue<TestJob>;
  private queueEvents: QueueEvents;
  private workers: Worker<TestJob, TestResult>[];
  private mcpServer: MCPServer;
  private connectionOptions: any;

  constructor(mcpServer: MCPServer) {
    this.mcpServer = mcpServer;
    
    // Redis connection options
    this.connectionOptions = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        return Math.min(times * 50, 2000);
      }
    };

    // Initialize queue
    this.testQueue = new Queue<TestJob>('soc2-tests', {
      connection: this.connectionOptions,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: {
          age: 3600, // 1 hour
          count: 100
        },
        removeOnFail: {
          age: 86400, // 24 hours
          count: 1000
        }
      }
    });

    // Initialize queue events
    this.queueEvents = new QueueEvents('soc2-tests', {
      connection: this.connectionOptions
    });

    this.workers = [];
    this.setupEventListeners();
  }

  /**
   * Initialize the queue service
   */
  async initialize(): Promise<void> {
    logger.info('Initializing queue service');

    // Wait for Redis connection
    await this.testQueue.waitUntilReady();
    await this.queueEvents.waitUntilReady();

    // Start workers
    const workerCount = parseInt(process.env.QUEUE_WORKERS || '4');
    await this.startWorkers(workerCount);

    logger.info(`Queue service initialized with ${workerCount} workers`);
  }

  /**
   * Add a test job to the queue
   */
  async addTestJob(job: TestJob, options?: JobsOptions): Promise<Job<TestJob>> {
    const jobOptions: JobsOptions = {
      priority: this.getPriorityValue(job.priority),
      delay: this.getDelayForPriority(job.priority),
      ...options
    };

    logger.info(`Adding test job to queue`, {
      workflowId: job.workflowId,
      attack: job.attack.attackName,
      priority: job.priority
    });

    return this.testQueue.add(
      `test-${job.attack.attackId}`,
      job,
      jobOptions
    );
  }

  /**
   * Add multiple test jobs in bulk
   */
  async addBulkTestJobs(jobs: TestJob[]): Promise<Job<TestJob>[]> {
    const bulkJobs = jobs.map(job => ({
      name: `test-${job.attack.attackId}`,
      data: job,
      opts: {
        priority: this.getPriorityValue(job.priority),
        delay: this.getDelayForPriority(job.priority)
      }
    }));

    logger.info(`Adding ${jobs.length} test jobs to queue`);
    return this.testQueue.addBulk(bulkJobs);
  }

  /**
   * Get queue metrics
   */
  async getMetrics(): Promise<QueueMetrics> {
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      this.testQueue.getWaitingCount(),
      this.testQueue.getActiveCount(),
      this.testQueue.getCompletedCount(),
      this.testQueue.getFailedCount(),
      this.testQueue.getDelayedCount(),
      0 // getPausedCount() not available in BullMQ
    ]);

    return { waiting, active, completed, failed, delayed, paused };
  }

  /**
   * Get jobs by status
   */
  async getJobs(
    status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed',
    start = 0,
    end = 20
  ): Promise<Job<TestJob>[]> {
    switch (status) {
      case 'waiting':
        return this.testQueue.getWaiting(start, end);
      case 'active':
        return this.testQueue.getActive(start, end);
      case 'completed':
        return this.testQueue.getCompleted(start, end);
      case 'failed':
        return this.testQueue.getFailed(start, end);
      case 'delayed':
        return this.testQueue.getDelayed(start, end);
      default:
        return [];
    }
  }

  /**
   * Pause the queue
   */
  async pause(): Promise<void> {
    logger.info('Pausing queue');
    await this.testQueue.pause();
  }

  /**
   * Resume the queue
   */
  async resume(): Promise<void> {
    logger.info('Resuming queue');
    await this.testQueue.resume();
  }

  /**
   * Clear jobs by status
   */
  async clearJobs(status: 'completed' | 'failed' | 'delayed' | 'wait'): Promise<void> {
    logger.info(`Clearing ${status} jobs`);
    await this.testQueue.clean(0, 0, status);
  }

  /**
   * Start queue workers
   */
  private async startWorkers(count: number): Promise<void> {
    const workerOptions: WorkerOptions = {
      connection: this.connectionOptions,
      concurrency: 1,
      lockDuration: 300000, // 5 minutes
      stalledInterval: 30000, // 30 seconds
      maxStalledCount: 1
    };

    for (let i = 0; i < count; i++) {
      const worker = new Worker<TestJob, TestResult>(
        'soc2-tests',
        async (job) => this.processTestJob(job),
        workerOptions
      );

      this.setupWorkerEventListeners(worker, i);
      this.workers.push(worker);
    }

    logger.info(`Started ${count} queue workers`);
  }

  /**
   * Process a test job
   */
  private async processTestJob(job: Job<TestJob>): Promise<TestResult> {
    const { workflowId, attack, target, auth } = job.data;

    logger.info(`Processing test job`, {
      jobId: job.id,
      workflowId,
      attack: attack.attackName
    });

    try {
      // Update job progress
      await job.updateProgress(10);

      // Execute the test via MCP server
      const result = await this.mcpServer.handleToolCall(
        attack.tools[0].name,
        {
          target,
          ...auth,
          ...attack.tools[0].arguments
        },
        workflowId
      );

      // Update job progress
      await job.updateProgress(100);

      logger.info(`Test job completed`, {
        jobId: job.id,
        workflowId,
        attack: attack.attackName,
        findings: result.findings.length
      });

      return result;

    } catch (error) {
      logger.error(`Test job failed`, {
        jobId: job.id,
        workflowId,
        attack: attack.attackName,
        error
      });

      throw error;
    }
  }

  /**
   * Setup queue event listeners
   */
  private setupEventListeners(): void {
    this.queueEvents.on('completed', ({ jobId, returnvalue }) => {
      logger.debug(`Job completed: ${jobId}`);
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.error(`Job failed: ${jobId}`, { reason: failedReason });
    });

    this.queueEvents.on('progress', ({ jobId, data }) => {
      logger.debug(`Job progress: ${jobId}`, { progress: data });
    });

    this.queueEvents.on('stalled', ({ jobId }) => {
      logger.warn(`Job stalled: ${jobId}`);
    });
  }

  /**
   * Setup worker event listeners
   */
  private setupWorkerEventListeners(worker: Worker<TestJob, TestResult>, index: number): void {
    worker.on('completed', (job) => {
      logger.debug(`Worker ${index} completed job: ${job.id}`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`Worker ${index} job failed: ${job?.id}`, { error: err });
    });

    worker.on('error', (err) => {
      logger.error(`Worker ${index} error`, { error: err });
    });

    worker.on('stalled', (jobId) => {
      logger.warn(`Worker ${index} stalled on job: ${jobId}`);
    });
  }

  /**
   * Get priority value for BullMQ
   */
  private getPriorityValue(priority: 'critical' | 'standard' | 'low'): number {
    const priorityMap = {
      critical: 1,
      standard: 5,
      low: 10
    };
    return priorityMap[priority];
  }

  /**
   * Get delay based on priority
   */
  private getDelayForPriority(priority: 'critical' | 'standard' | 'low'): number {
    if (priority === 'low') {
      // Delay low priority jobs if outside business hours
      const hour = new Date().getHours();
      if (hour < 8 || hour > 18) {
        return 0; // No delay during off hours
      }
      return 5 * 60 * 1000; // 5 minutes delay during business hours
    }
    return 0; // No delay for critical and standard
  }

  /**
   * Schedule a recurring test
   */
  async scheduleRecurringTest(
    job: TestJob,
    pattern: string, // Cron pattern
    options?: JobsOptions
  ): Promise<void> {
    await this.testQueue.add(
      `recurring-${job.attack.attackId}`,
      job,
      {
        repeat: {
          pattern,
          tz: 'UTC'
        },
        ...options
      }
    );

    logger.info(`Scheduled recurring test`, {
      attack: job.attack.attackName,
      pattern
    });
  }

  /**
   * Remove a recurring test
   */
  async removeRecurringTest(attackId: string): Promise<void> {
    const repeatableJobs = await this.testQueue.getRepeatableJobs();
    const job = repeatableJobs.find(j => j.name === `recurring-${attackId}`);
    
    if (job) {
      await this.testQueue.removeRepeatableByKey(job.key);
      logger.info(`Removed recurring test: ${attackId}`);
    }
  }

  /**
   * Get queue health status
   */
  async getHealthStatus(): Promise<{
    isHealthy: boolean;
    metrics: QueueMetrics;
    workersActive: number;
    redisConnected: boolean;
  }> {
    try {
      const metrics = await this.getMetrics();
      const workersActive = this.workers.filter(w => !w.closing).length;
      const redisClient = await this.testQueue.client;
      const redisConnected = await redisClient.ping() === 'PONG';

      const isHealthy = workersActive > 0 && redisConnected;

      return {
        isHealthy,
        metrics,
        workersActive,
        redisConnected
      };
    } catch (error) {
      logger.error('Failed to get health status', { error });
      return {
        isHealthy: false,
        metrics: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
        workersActive: 0,
        redisConnected: false
      };
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up queue service');

    // Stop workers
    await Promise.all(this.workers.map(worker => worker.close()));

    // Close queue connections
    await this.queueEvents.close();
    await this.testQueue.close();

    logger.info('Queue service cleanup complete');
  }
} 