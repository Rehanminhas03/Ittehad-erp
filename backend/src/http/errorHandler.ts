import type { ErrorRequestHandler, RequestHandler } from 'express';
import { env } from '../config/env';
import { HttpError } from '../lib/errors';
import { logger } from '../lib/logger';

interface PgError {
  code?: string;
  detail?: string;
  constraint?: string;
  message?: string;
}

/** Drizzle wraps driver errors (DrizzleQueryError.cause); look through the chain. */
function pgErrorOf(err: unknown): PgError | null {
  let e: unknown = err;
  for (let i = 0; i < 3 && e; i++) {
    const c = (e as PgError).code;
    if (typeof c === 'string' && /^[0-9A-Z]{5}$/.test(c)) return e as PgError;
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

function toHttp(err: unknown): HttpError | null {
  if (err instanceof HttpError) return err;
  if ((err as { type?: string }).type === 'entity.parse.failed') return new HttpError(400, 'bad_request', 'Malformed JSON body');
  const pg = pgErrorOf(err);
  if (!pg) return null;
  switch (pg.code) {
    case '23505':
      return new HttpError(409, 'conflict', 'A record with the same unique value already exists', { constraint: pg.constraint });
    case '23503':
      return new HttpError(409, 'conflict', 'The operation references a missing record or one still in use', { constraint: pg.constraint });
    case '23514':
    case '23502':
    case '22P02':
      return new HttpError(422, 'validation_error', 'The data violates a database rule', { constraint: pg.constraint });
    case '42501': // RLS WITH CHECK violation / append-only trigger / missing grant
      return new HttpError(403, 'forbidden', 'Not permitted');
    case '40001':
    case '40P01':
      return new HttpError(409, 'conflict', 'Concurrent update detected; please retry');
    default:
      return null;
  }
}

/** Connection-level failures: the database is down or not reachable (not a bug in the request). */
const DB_DOWN_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', '57P01', '57P03', '08001', '08006']);
function isDatabaseDown(err: unknown, depth = 0): boolean {
  if (!err || depth > 4) return false;
  const e = err as { code?: string; cause?: unknown; errors?: unknown[] };
  if (typeof e.code === 'string' && DB_DOWN_CODES.has(e.code)) return true;
  // Node reports a refused localhost connection (IPv4 + IPv6) as an AggregateError of both.
  if (Array.isArray(e.errors) && e.errors.some((x) => isDatabaseDown(x, depth + 1))) return true;
  return isDatabaseDown(e.cause, depth + 1);
}

function errorChain(err: unknown): string {
  const parts: string[] = [];
  for (let e: unknown = err, i = 0; e && i < 3; e = (e as { cause?: unknown }).cause, i++) {
    parts.push(String((e as Error).message ?? e));
  }
  return parts.join(' <- ');
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // The database is not running (e.g. after the PC restarted): say so instead of "Internal server error".
  if (isDatabaseDown(err)) {
    logger.error({ err, requestId: req.requestId, path: req.path }, 'database unreachable');
    const debug = env.NODE_ENV === 'production' ? undefined : 'Start the database: `npm run db:start` in the project folder (or run `npm run dev` from there).';
    res.status(503).json({
      error: { code: 'database_unavailable', message: 'The system cannot reach its database right now. Please try again in a minute or contact the administrator.', requestId: req.requestId, debug },
    });
    return;
  }
  const http = toHttp(err);
  if (!http || http.status >= 500) {
    logger.error({ err, requestId: req.requestId, path: req.path }, 'unhandled error');
    const debug = env.NODE_ENV === 'production' ? undefined : errorChain(err);
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error', requestId: req.requestId, debug } });
    return;
  }
  res.status(http.status).json({ error: { code: http.code, message: http.message, details: http.details } });
};

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } });
};
