import { config } from 'dotenv';

/** Rebuilds the test database from the models once per test run. */
export default async function setup() {
  config({ path: '.env.test', override: true, quiet: true });
  process.env.DOTENV_PATH = '.env.test';
  const { dropAll, syncDatabase } = await import('../src/db/setup');
  const url = process.env.MIGRATION_DATABASE_URL!;
  await dropAll(url);
  await syncDatabase(url);
  // A second sync against the existing schema must be a no-op. drizzle-kit cannot diff some
  // constructs and would prompt (and fail) on every later `db:sync` of a real database.
  await syncDatabase(url);
}
