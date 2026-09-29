import type { Access } from '../auth/access';

declare global {
  namespace Express {
    interface Request {
      access?: Access;
      requestId?: string;
    }
  }
}

export {};
