import { config } from 'dotenv';

/** Rebuilds the test database from the Prisma migrations once per test run. */
export default async function setup() {
  config({ path: '.env.test', override: true, quiet: true });
  process.env.DOTENV_PATH = '.env.test';
  const { dropAll, migrateDatabase } = await import('../src/db/setup');
  const url = process.env.MIGRATION_DATABASE_URL!;
  await dropAll(url);
  await migrateDatabase(url);
  // Applying again to an up-to-date database must be a no-op (as on every later deploy).
  await migrateDatabase(url);
}
