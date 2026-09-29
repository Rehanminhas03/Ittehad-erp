// Drops ALL module schemas and rebuilds the database from the Prisma migrations. Destroys all data.
import { env } from '../config/env';
import { dropAll, migrateDatabase } from '../db/setup';

if (env.NODE_ENV === 'production') {
  console.error('db:reset is disabled in production');
  process.exit(1);
}
try {
  await dropAll(env.MIGRATION_DATABASE_URL);
  const { added } = await migrateDatabase(env.MIGRATION_DATABASE_URL);
  console.log(`Database rebuilt from the migrations. ${added.length} permissions registered.`);
  process.exit(0);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
