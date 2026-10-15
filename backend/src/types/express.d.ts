import type { Access } from '../auth/access';

declare global {
  namespace Express {
    interface Request {
      access?: Access;
      requestId?: string;
      /** The unparsed JSON body (to check the signature of the Meta webhook). */
      rawBody?: Buffer;
    }
  }
}

export {};
