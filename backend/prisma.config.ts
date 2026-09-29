import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma CLI configuration (migrations, introspection, client generation).
 * The CLI uses the OWNER connection (MIGRATION_DATABASE_URL): it creates tables, policies and
 * functions. The app itself connects as the non-owner role (DATABASE_URL, see src/db/client.ts) so
 * PostgreSQL row-level security applies to every request.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Seed data (dealerships, branches, demo users, stock…): `npx prisma db seed` / `npm run db:seed`.
    seed: 'tsx src/scripts/seed.ts',
  },
  datasource: {
    url: env('MIGRATION_DATABASE_URL'),
    // Scratch database for `prisma migrate dev` / `migrate diff --from-migrations` (optional).
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
