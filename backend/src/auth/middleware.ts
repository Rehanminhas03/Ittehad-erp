import type { NextFunction, Request, Response } from 'express';
import { unauthorized } from '../lib/errors';
import { loadAccess } from './grants';
import { verifyAccessToken } from './tokens';

/** Resolves `req.access` from the bearer token; responds 401 when missing or invalid. */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) throw unauthorized();
  const claims = verifyAccessToken(token);
  if (!claims) throw unauthorized('Invalid or expired token');
  const access = await loadAccess(claims.userId, claims.tokenVersion);
  if (!access) throw unauthorized('Session is no longer valid');
  req.access = access;
  next();
}
