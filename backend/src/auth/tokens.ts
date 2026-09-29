import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

interface AccessClaims {
  sub: string;
  tv: number;
}

export function signAccessToken(userId: number, tokenVersion: number): string {
  return jwt.sign({ tv: tokenVersion } satisfies Omit<AccessClaims, 'sub'>, env.JWT_ACCESS_SECRET, {
    subject: String(userId),
    expiresIn: env.ACCESS_TOKEN_TTL_SEC,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): { userId: number; tokenVersion: number } | null {
  try {
    const claims = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as AccessClaims;
    const userId = Number(claims.sub);
    if (!Number.isSafeInteger(userId) || typeof claims.tv !== 'number') return null;
    return { userId, tokenVersion: claims.tv };
  } catch {
    return null;
  }
}

/**
 * Refresh tokens are opaque random strings; only a keyed hash is stored, so a DB leak
 * does not yield usable tokens.
 */
export function newRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(env.JWT_REFRESH_SECRET).update(token).digest('hex');
}
