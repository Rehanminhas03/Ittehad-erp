import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Tests load .env.test via vitest config; everything else uses .env (real environment variables win).
loadDotenv({ path: process.env.DOTENV_PATH ?? '.env', quiet: true });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  MIGRATION_DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(15 * 60),
  REFRESH_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(7 * 24 * 60 * 60),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  /** Secure (HTTPS-only) refresh cookie. Defaults to on in production; set false for plain-HTTP local stacks. */
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  /**
   * Development convenience (opt-in): exposes /api/auth/dev-login so the app opens already signed in.
   * Only ever registered when NODE_ENV=development; ignored otherwise.
   */
  DEV_AUTO_LOGIN: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Meta (Facebook / Instagram) lead ads → social media leads (see modules/integrations/meta.ts). */
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  /** The text typed into Meta when the webhook is added (VERIFY_TOKEN is accepted too). */
  META_VERIFY_TOKEN: z.string().optional(),
  VERIFY_TOKEN: z.string().optional(),
  /** One Page / System User access token (leads_retrieval, pages_show_list) for every Page; the leads go to META_DEFAULT_DEALERSHIP. */
  META_ACCESS_TOKEN: z.string().optional(),
  META_DEFAULT_DEALERSHIP: z.string().default('JET-ITH'),
  /** JSON list: [{"pageId":"…","dealership":"JET-ITH","accessToken":"…"}] */
  META_PAGES: z.string().optional(),
  META_GRAPH_VERSION: z.string().default('v21.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export const env = EnvSchema.parse(process.env);
export type Env = typeof env;
