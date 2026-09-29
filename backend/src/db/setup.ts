/**
 * Database structure through Prisma Migrate (prisma/migrations; run from the backend directory
 * with the OWNER connection):
 *   migrateDatabase  `prisma migrate deploy` (tables, indexes, RLS policies, functions, triggers,
 *                    grants), then the permission catalog + default role templates
 *   dropAll          drops every module schema and Prisma's migration history (all data!)
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import '../modules'; // registers every module's permission catalog
import { syncPermissionsAndRoles } from '../modules/core/repository';
import { createDb, transaction } from './client';

const SCHEMAS = ['core', 'audit', 'sales', 'service', 'parts', 'accounts'];

/** Runs the Prisma CLI (prisma.config.ts) against `url`. */
function prismaCli(args: string[], url: string): string {
  const run = spawnSync(process.execPath, [path.resolve('node_modules/prisma/build/index.js'), ...args], {
    env: { ...process.env, MIGRATION_DATABASE_URL: url },
    encoding: 'utf8',
  });
  if (run.status !== 0) throw new Error(`prisma ${args.join(' ')} failed:\n${run.stdout}\n${run.stderr}`);
  return run.stdout;
}

async function withOwner<T>(url: string, fn: (db: ReturnType<typeof createDb>['db']) => Promise<T>): Promise<T> {
  const { db, disconnect } = createDb(url, 1);
  try {
    return await fn(db);
  } finally {
    await disconnect();
  }
}

/** Drops every module schema and Prisma's migration history (all data!). */
export async function dropAll(url: string) {
  await withOwner(url, async (db) => {
    for (const s of SCHEMAS) await db.$executeRawUnsafe(`drop schema if exists ${s} cascade`);
    await db.$executeRawUnsafe('drop table if exists public._prisma_migrations');
  });
}

/** Applies pending migrations, then registers the permission catalog and default roles. */
export async function migrateDatabase(url: string) {
  prismaCli(['migrate', 'deploy'], url);
  return withOwner(url, (db) => transaction(db, (tx) => syncPermissionsAndRoles(tx)));
}
