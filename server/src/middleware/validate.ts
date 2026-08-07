import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';
import { BadRequestError } from '../utils/errors';

interface ValidationSources {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Middleware that validates request body/query/params against a Zod schema.
 * Invalid requests return 400 with a structured error.
 */
export function validate(sources: ValidationSources) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (sources.body) req.body = sources.body.parse(req.body);
      if (sources.query) req.query = sources.query.parse(req.query) as Request['query'];
      if (sources.params) req.params = sources.params.parse(req.params) as Request['params'];
      next();
    } catch (err) {
      const zodError = err as { issues?: Array<{ path: Array<string | number>; message: string }> };
      if (zodError.issues) {
        const detail = zodError.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        return next(new BadRequestError(detail));
      }
      return next(err as Error);
    }
  };
}
