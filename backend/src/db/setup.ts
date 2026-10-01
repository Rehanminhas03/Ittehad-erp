/**
 * Database structure through Prisma Migrate (prisma/migrations; run from the backend directory
 * with the OWNER connection):
 *   migrateDatabase  `prisma migrate deploy` (tables, indexes, RLS policies, functions, triggers),
 *                    then the app-role grants (APP_GRANTS, so new tables are covered too) and the
 *                    permission catalog + default role templates
 *   dropAll          drops every module schema and Prisma's migration history (all data!)
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import '../modules'; // registers every module's permission catalog
import { syncPermissionsAndRoles } from '../modules/core/repository';
import { createDb, transaction } from './client';

const SCHEMAS = ['core', 'audit', 'sales', 'service', 'parts', 'accounts'];

/**
 * Re-applied after every migrate (idempotent). The runtime role `dms_app` (created once by
 * `npm run setup`, see scripts/setup.mjs) gets DML only and is not a table owner, so RLS applies to it.
 * Append-only tables: no UPDATE/DELETE for the app role, and a trigger stops everyone else too —
 * add each new append-only table to the list.
 */
const APP_GRANTS = [
  'grant usage on schema core, audit, sales, service, parts, accounts to dms_app',
  'grant select, insert, update, delete on all tables in schema core, sales, service, parts, accounts to dms_app',
  'grant usage, select on all sequences in schema core, audit, sales, service, parts, accounts to dms_app',
  'revoke all on audit.audit_log from dms_app',
  'grant select, insert on audit.audit_log to dms_app',
  `do $$
declare
  t text;
begin
  foreach t in array array[
    'audit.audit_log',
    'core.workflow_transition',
    'core.domain_event',
    'parts.inventory_transaction',
    'accounts.journal_entry',
    'accounts.journal_line'
  ] loop
    execute format('revoke update, delete, truncate on %s from dms_app', t);
    execute format('drop trigger if exists append_only on %s', t);
    execute format(
      'create trigger append_only before update or delete on %s for each row execute function core.forbid_mutation()', t);
  end loop;
end
$$`,
];

/**
 * Runs the Prisma CLI (prisma.config.ts) against `url`. "Can't reach database server" (P1001) is
 * retried: a remote database (e.g. Neon) can take a while to wake up or to accept the connection.
 */
export function prismaCli(args: string[], url: string, attempts = 4): string {
  for (let i = 1; ; i++) {
    const run = spawnSync(process.execPath, [path.resolve('node_modules/prisma/build/index.js'), ...args], {
      env: { ...process.env, MIGRATION_DATABASE_URL: url },
      encoding: 'utf8',
    });
    if (run.status === 0) return run.stdout;
    const output = `${run.stdout}\n${run.stderr}`;
    if (i >= attempts || !output.includes('P1001')) throw new Error(`prisma ${args.join(' ')} failed:\n${output}`);
    console.warn(`prisma ${args.join(' ')}: database not reachable, retrying (${i}/${attempts - 1})`);
  }
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

/** Applies pending migrations and the app-role grants, then registers the permission catalog and default roles. */
export async function migrateDatabase(url: string) {
  prismaCli(['migrate', 'deploy'], url);
  return withOwner(url, (db) =>
    transaction(db, async (tx) => {
      for (const stmt of APP_GRANTS) await tx.$executeRawUnsafe(stmt);
      return syncPermissionsAndRoles(tx);
    }),
  );
}
