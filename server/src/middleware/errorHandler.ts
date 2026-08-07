import type { ErrorRequestHandler, Request, Response } from 'express';
import { AppError } from '../utils/errors';

/** Central error handler producing the structured error envelope (SDD Section 6 / 7.3). */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    statusCode: 404,
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      statusCode: err.statusCode,
      error: err.code,
      message: err.message,
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unexpected error';
  console.error('[UnhandledError]', err);
  res.status(500).json({
    statusCode: 500,
    error: 'INTERNAL_SERVER_ERROR',
    message,
  });
};
