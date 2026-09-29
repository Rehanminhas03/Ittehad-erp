// Applies pending Prisma migrations (keeps data) and registers the permission catalog / default roles.
// Structure changes: edit prisma/schema.prisma, then `npx prisma migrate dev --name <change>`.
import { env } from '../config/env';
import { migrateDatabase } from '../db/setup';

try {
  const { added, removed } = await migrateDatabase(env.MIGRATION_DATABASE_URL);
  console.log(`Database migrated. Permissions added: ${added.length}, removed: ${removed.length}`);
  process.exit(0);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
