import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('AuthMiddleware');

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        permissions: string[];
      };
    }
  }
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiry?: string;
  requireAuth?: boolean;
}

/**
 * Create authentication middleware
 */
export function createAuthMiddleware(config: AuthConfig) {
  const { jwtSecret, jwtExpiry = '24h', requireAuth = true } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract token from header
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

      if (!token) {
        if (requireAuth) {
          logger.warn('Missing authentication token', { 
            path: req.path, 
            ip: req.ip 
          });
          
          return res.status(401).json({
            error: 'Authentication required',
            message: 'Please provide a valid JWT token in the Authorization header'
          });
        }
        // If auth not required, continue without user context
        return next();
      }

      // Verify token
      const decoded = jwt.verify(token, jwtSecret) as any;
      
      // Attach user to request
      req.user = {
        id: decoded.sub || decoded.id,
        email: decoded.email,
        role: decoded.role || 'user',
        permissions: decoded.permissions || []
      };

      logger.debug('User authenticated', { 
        userId: req.user.id, 
        email: req.user.email 
      });

      next();

    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.warn('Token expired', { path: req.path });
        return res.status(401).json({
          error: 'Token expired',
          message: 'Please login again to get a new token'
        });
      }

      if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid token', { path: req.path, error: error.message });
        return res.status(401).json({
          error: 'Invalid token',
          message: 'The provided token is invalid'
        });
      }

      logger.error('Authentication error', { error });
      res.status(500).json({
        error: 'Authentication error',
        message: 'An error occurred during authentication'
      });
    }
  };
}

/**
 * Role-based access control middleware
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'You must be logged in to access this resource'
      });
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Insufficient permissions', { 
        userId: req.user.id, 
        requiredRoles: roles, 
        userRole: req.user.role 
      });
      
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `This resource requires one of the following roles: ${roles.join(', ')}`
      });
    }

    next();
  };
}

/**
 * Permission-based access control middleware
 */
export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'You must be logged in to access this resource'
      });
    }

    const hasPermission = permissions.some(permission => 
      req.user!.permissions.includes(permission)
    );

    if (!hasPermission) {
      logger.warn('Missing required permissions', { 
        userId: req.user.id, 
        requiredPermissions: permissions, 
        userPermissions: req.user.permissions 
      });
      
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `This resource requires one of the following permissions: ${permissions.join(', ')}`
      });
    }

    next();
  };
}

/**
 * API key authentication middleware
 */
export function apiKeyAuth(validApiKeys: Set<string>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      return res.status(401).json({
        error: 'API key required',
        message: 'Please provide an API key in the X-API-Key header'
      });
    }

    if (!validApiKeys.has(apiKey)) {
      logger.warn('Invalid API key', { 
        path: req.path, 
        ip: req.ip 
      });
      
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'The provided API key is invalid'
      });
    }

    // Set a synthetic user for API key auth
    req.user = {
      id: 'api-key-user',
      email: 'api@soc2-testing.com',
      role: 'api',
      permissions: ['workflow:run', 'workflow:read', 'queue:read']
    };

    next();
  };
}

/**
 * Optional authentication middleware
 */
export function optionalAuth(config: AuthConfig) {
  return createAuthMiddleware({ ...config, requireAuth: false });
}

/**
 * Generate JWT token
 */
export function generateToken(
  payload: any,
  secret: string,
  expiresIn: string = '24h'
): string {
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

/**
 * Decode JWT token without verification (for debugging)
 */
export function decodeToken(token: string): any {
  return jwt.decode(token);
}

/**
 * Authentication simulation middleware for development/testing
 * Sets context.auth based on provided credentials in request body
 */
export function authSimulation() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Check if auth credentials are provided in the request body
    const { username, password } = req.body?.auth || {};
    
    if (username && password) {
      // Simulate authentication by setting auth context
      req.user = {
        id: `sim-user-${username}`,
        email: `${username}@test.com`,
        role: 'authenticated',
        permissions: ['workflow:run', 'workflow:read', 'test:authenticated']
      };
      
      // Add auth context for restraint mechanisms
      (req as any).context = {
        ...(req as any).context,
        authenticated: true,
        authMethod: 'simulation',
        username
      };
      
      logger.info('Auth simulation activated', { 
        username, 
        userId: req.user.id,
        path: req.path 
      });
    } else {
      // No auth provided - set unauthenticated context
      (req as any).context = {
        ...(req as any).context,
        authenticated: false,
        authMethod: 'none'
      };
    }
    
    next();
  };
} 