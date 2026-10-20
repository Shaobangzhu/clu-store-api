import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';

// Parse a single object with params/query/body schemas. This preserves transforms
// without assigning to Express 5's read-only req.query getter.
export function validate<S extends z.ZodType>(schema: S): RequestHandler {
  return async (req, res, next) => {
    const result = await schema.safeParseAsync({ params: req.params, query: req.query, body: req.body });
    if (!result.success) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Invalid request',
        result.error.issues.map((issue) => ({ path: issue.path, code: issue.code })),
      ));
      return;
    }
    res.locals.validated = result.data;
    next();
  };
}
