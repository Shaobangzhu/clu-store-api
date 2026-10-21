import type { RequestHandler } from 'express';
import type { Role } from '../generated/prisma/client.js';
import { AppError } from '../lib/errors.js';
import type { AuthService } from '../modules/auth/service.js';
import { unauthorized } from '../modules/auth/token.js';

export function requireAuth(service: AuthService | undefined): RequestHandler {
  return async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!service) throw new AppError(503, 'SERVICE_NOT_READY', 'Authentication is not configured');
    const header = req.headers.authorization;
    if (!header || header.length > 4096 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(header)) {
      throw unauthorized();
    }
    res.locals.user = await service.authenticate(header.slice(7));
    next();
  };
}
export function requireRole(role: Role): RequestHandler {
  return (_req, res, next) => {
    if (!res.locals.user) throw unauthorized();
    if (res.locals.user.role !== role) throw new AppError(403, 'FORBIDDEN', 'Access denied');
    next();
  };
}
