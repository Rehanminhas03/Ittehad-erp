import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// No migration files: `npm run db:sync` / `db:reset` push the models straight to the database
// (see src/db/setup.ts). Uses the owner connection.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  casing: 'snake_case',
  schemaFilter: ['core', 'audit', 'sales', 'service', 'parts', 'accounts'],
  entities: { roles: false },
  dbCredentials: { url: process.env.MIGRATION_DATABASE_URL! },
});
