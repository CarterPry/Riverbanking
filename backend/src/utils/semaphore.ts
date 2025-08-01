/**
 * Semaphore implementation for controlling concurrent operations
 */
export class Semaphore {
  private permits: number;
  private waitingQueue: Array<() => void> = [];

  constructor(permits: number) {
    if (permits < 1) {
      throw new Error('Semaphore must have at least 1 permit');
    }
    this.permits = permits;
  }

  /**
   * Acquire a permit, waiting if necessary
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }

    // Wait for a permit to become available
    return new Promise<void>((resolve) => {
      this.waitingQueue.push(resolve);
    });
  }

  /**
   * Try to acquire a permit without waiting
   */
  tryAcquire(): boolean {
    if (this.permits > 0) {
      this.permits--;
      return true;
    }
    return false;
  }

  /**
   * Release a permit
   */
  release(): void {
    this.permits++;

    // If there are waiting tasks, give the permit to the first one
    if (this.waitingQueue.length > 0) {
      const resolve = this.waitingQueue.shift();
      if (resolve) {
        this.permits--;
        resolve();
      }
    }
  }

  /**
   * Get the number of available permits
   */
  availablePermits(): number {
    return this.permits;
  }

  /**
   * Get the number of waiting tasks
   */
  getQueueLength(): number {
    return this.waitingQueue.length;
  }

  /**
   * Execute a function with semaphore protection
   */
  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

/**
 * Rate limiter implementation using semaphore
 */
export class RateLimiter {
  private semaphore: Semaphore;
  private interval: number;
  private tokens: number;
  private maxTokens: number;
  private timer?: NodeJS.Timeout;

  constructor(maxTokens: number, intervalMs: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.interval = intervalMs;
    this.semaphore = new Semaphore(maxTokens);
    this.startRefillTimer();
  }

  private startRefillTimer(): void {
    this.timer = setInterval(() => {
      const tokensToAdd = Math.min(
        this.maxTokens - this.tokens,
        this.maxTokens - this.semaphore.availablePermits()
      );
      
      for (let i = 0; i < tokensToAdd; i++) {
        this.semaphore.release();
        this.tokens++;
      }
    }, this.interval);
  }

  async acquire(): Promise<void> {
    await this.semaphore.acquire();
    this.tokens--;
  }

  tryAcquire(): boolean {
    if (this.semaphore.tryAcquire()) {
      this.tokens--;
      return true;
    }
    return false;
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

/**
 * Create a semaphore with a specific concurrency limit
 */
export function createConcurrencyLimiter(limit: number): Semaphore {
  return new Semaphore(limit);
}

/**
 * Execute tasks with concurrency control
 */
export async function executeWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrencyLimit: number
): Promise<T[]> {
  const semaphore = new Semaphore(concurrencyLimit);
  const results: T[] = [];

  await Promise.all(
    tasks.map(async (task, index) => {
      await semaphore.acquire();
      try {
        const result = await task();
        results[index] = result;
      } finally {
        semaphore.release();
      }
    })
  );

  return results;
} 