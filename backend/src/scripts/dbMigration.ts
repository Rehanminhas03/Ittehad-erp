// Creates a migration from the changes in prisma/schema.prisma:
//   npm run db:migration -- --name <change>
// The SQL is worked out against the scratch shadow database only (SHADOW_DATABASE_URL, emptied first):
// the migration files so far → the schema. No other database is touched; review
// prisma/migrations/<timestamp>_<change>/migration.sql (add an RLS policy / trigger for a new table),
// then `npm run db:generate` and `npm run db:migrate`.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { dropAll, prismaCli } from '../db/setup';

const name = process.argv[process.argv.indexOf('--name') + 1];
if (!process.argv.includes('--name') || !name || !/^[a-z0-9_]+$/.test(name)) {
  console.error('Usage: npm run db:migration -- --name <change_in_snake_case>');
  process.exit(1);
}
const shadow = process.env.SHADOW_DATABASE_URL;
if (!shadow) {
  console.error('SHADOW_DATABASE_URL is not set (a scratch database, e.g. postgres://dms:dms@127.0.0.1:5433/dms_shadow)');
  process.exit(1);
}

try {
  await dropAll(shadow);
  const sql = prismaCli(['migrate', 'diff', '--from-migrations', 'prisma/migrations', '--to-schema', 'prisma/schema.prisma', '--script'], shadow);
  if (/^\s*-- This is an empty migration\.\s*$/.test(sql)) {
    console.log('No changes in prisma/schema.prisma: nothing to migrate.');
    process.exit(0);
  }
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const dir = path.join('prisma', 'migrations', `${stamp}_${name}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'migration.sql'), sql);
  console.log(`Created ${dir}/migration.sql — review it, then: npm run db:generate && npm run db:migrate`);
  process.exit(0);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
