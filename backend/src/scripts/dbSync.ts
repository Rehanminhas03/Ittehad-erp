// Applies model changes to the database, keeping data. For a clean rebuild use db:reset.
import { env } from '../config/env';
import { syncDatabase } from '../db/setup';

try {
  const { added, removed } = await syncDatabase(env.MIGRATION_DATABASE_URL);
  console.log(`Database in sync with models. Permissions added: ${added.length}, removed: ${removed.length}`);
  process.exit(0);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
