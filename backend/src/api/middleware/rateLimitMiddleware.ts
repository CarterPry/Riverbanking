import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('RateLimitMiddleware');

export interface RateLimitConfig {
  windowMs?: number;
  max?: number;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

/**
 * Create rate limiter with default configuration
 */
export function createRateLimiter(config: RateLimitConfig = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // Limit each IP to 100 requests per windowMs
    message = 'Too many requests from this IP, please try again later.',
    standardHeaders = true,
    legacyHeaders = false,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator
  } = config;

  return rateLimit({
    windowMs,
    max,
    message,
    standardHeaders,
    legacyHeaders,
    skipSuccessfulRequests,
    skipFailedRequests,
    keyGenerator: keyGenerator || ((req: Request) => {
      // Use forwarded IP if behind proxy, otherwise use direct IP
      return req.headers['x-forwarded-for']?.toString().split(',')[0] || 
             req.socket.remoteAddress || 
             'unknown';
    }),
    handler: (req: Request, res: Response) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        headers: req.headers
      });
      
      res.status(429).json({
        error: 'Too Many Requests',
        message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    },
    skip: (req: Request) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/api/health';
    }
  });
}

/**
 * Create stricter rate limiter for sensitive endpoints
 */
export function createStrictRateLimiter(config: RateLimitConfig = {}) {
  return createRateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // Only 10 requests per 5 minutes
    message: 'Too many requests to sensitive endpoint. Please try again later.',
    ...config
  });
}

/**
 * Create rate limiter for workflow endpoints
 */
export function createWorkflowRateLimiter(config: RateLimitConfig = {}) {
  return createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 workflows per hour
    message: 'Workflow rate limit exceeded. Please wait before starting new workflows.',
    skipSuccessfulRequests: false,
    skipFailedRequests: true, // Don't count failed requests
    ...config
  });
}

/**
 * Create rate limiter for authentication endpoints
 */
export function createAuthRateLimiter(config: RateLimitConfig = {}) {
  return createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per 15 minutes
    message: 'Too many authentication attempts. Please try again later.',
    skipSuccessfulRequests: true, // Don't count successful logins
    skipFailedRequests: false,
    ...config
  });
}

/**
 * Create rate limiter based on user ID (for authenticated routes)
 */
export function createUserRateLimiter(config: RateLimitConfig = {}) {
  return createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Higher limit for authenticated users
    keyGenerator: (req: Request) => {
      // Use user ID if authenticated, otherwise fall back to IP
      return req.user?.id || req.ip || 'unknown';
    },
    message: 'User rate limit exceeded. Please slow down your requests.',
    ...config
  });
}

/**
 * Create dynamic rate limiter that adjusts based on user role
 */
export function createDynamicRateLimiter() {
  const limits = {
    admin: 1000,
    user: 100,
    api: 500,
    guest: 50
  };

  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: (req: Request) => {
      const role = req.user?.role || 'guest';
      return limits[role as keyof typeof limits] || limits.guest;
    },
    keyGenerator: (req: Request) => {
      return req.user?.id || req.ip || 'unknown';
    },
    message: (req: Request) => {
      const role = req.user?.role || 'guest';
      const limit = limits[role as keyof typeof limits] || limits.guest;
      return `Rate limit exceeded for ${role} users. Limit: ${limit} requests per 15 minutes.`;
    },
    standardHeaders: true,
    legacyHeaders: false
  });
}

/**
 * Create sliding window rate limiter for more accurate limiting
 */
export function createSlidingWindowRateLimiter(config: RateLimitConfig = {}) {
  const windowLog: Map<string, number[]> = new Map();
  const windowMs = config.windowMs || 60 * 1000; // 1 minute default
  const max = config.max || 60;

  return (req: Request, res: Response, next: Function) => {
    const key = config.keyGenerator?.(req) || req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get or create log for this key
    let requests = windowLog.get(key) || [];
    
    // Remove old entries
    requests = requests.filter(timestamp => timestamp > windowStart);
    
    // Check if limit exceeded
    if (requests.length >= max) {
      logger.warn('Sliding window rate limit exceeded', {
        key,
        requests: requests.length,
        max
      });
      
      return res.status(429).json({
        error: 'Too Many Requests',
        message: config.message || 'Rate limit exceeded',
        retryAfter: Math.ceil((requests[0] + windowMs - now) / 1000)
      });
    }

    // Add current request
    requests.push(now);
    windowLog.set(key, requests);

    // Cleanup old keys periodically
    if (Math.random() < 0.01) { // 1% chance
      for (const [k, v] of windowLog.entries()) {
        if (v.length === 0 || v[v.length - 1] < windowStart) {
          windowLog.delete(k);
        }
      }
    }

    next();
  };
}

/**
 * Distributed rate limiter using Redis (placeholder for future implementation)
 */
export function createDistributedRateLimiter(config: RateLimitConfig = {}) {
  // This would use Redis to share rate limit state across multiple instances
  logger.warn('Distributed rate limiter not implemented, falling back to in-memory');
  return createRateLimiter(config);
} 