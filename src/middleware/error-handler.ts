import type { ErrorRequestHandler } from 'express';
import type { Logger } from 'pino';
import { AppError } from '../lib/errors.js';

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    let publicError = new AppError(500, 'INTERNAL_ERROR', 'Internal server error');
    if (error instanceof AppError) {
      publicError = error;
    } else if (error instanceof URIError) {
      publicError = new AppError(400, 'VALIDATION_ERROR', 'Invalid path encoding');
    } else if (typeof error === 'object' && error !== null && 'type' in error) {
      if (error.type === 'entity.parse.failed') {
        publicError = new AppError(400, 'MALFORMED_JSON', 'Malformed JSON body');
      } else if (error.type === 'entity.too.large') {
        publicError = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
      } else if (error.type === 'charset.unsupported' || error.type === 'encoding.unsupported') {
        publicError = new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported body encoding');
      }
    }
    if (publicError.status >= 500 && publicError.code !== 'SERVICE_NOT_READY') {
      // Do not serialize unknown errors: they may contain bodies, SQL or credentials.
      logger.error({ requestId: res.locals.requestId, code: publicError.code }, 'Request failed');
    }
    res.status(publicError.status).json({
      success: false,
      error: { code: publicError.code, message: publicError.message, details: publicError.details },
    });
  };
}
