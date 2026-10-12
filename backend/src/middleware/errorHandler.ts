import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../config/logger';

// Structured error responses (SDD 7.3): consistent status code, error code,
// message; optional validation details.
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error('Unhandled error', { path: req.originalUrl, message, stack });
  if (message.includes('Cannot read') || message.includes('invalid column')) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
    return;
  }

  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
}
