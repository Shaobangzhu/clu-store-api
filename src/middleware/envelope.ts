import type { RequestHandler } from 'express';

export const envelope: RequestHandler = (_req, res, next) => {
  res.locals.success = (data, status = 200, meta = null) => {
    if (status === 204) {
      res.status(204).end();
      return;
    }
    res.status(status).json({ success: true, data, meta });
  };
  next();
};
