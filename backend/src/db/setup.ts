import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { is } from 'drizzle-orm';
import { PgDialect, PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import pg from 'pg';
import '../modules'; // registers every module's permission catalog
import { syncPermissionsAndRoles } from '../modules/core/repository';
import { createDb } from './client';
import * as schema from './schema';

const SCHEMAS = ['core', 'audit', 'sales', 'service', 'parts', 'accounts'];
const sqlFile = (name: string) => readFileSync(path.resolve('src/db/sql', name), 'utf8');

async function runSql(url: string, text: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(text);
  } finally {
    await client.end();
  }
}

/**
 * drizzle-kit push (0.31) creates RLS policies but drops their USING / WITH CHECK expressions
 * (`drizzle-kit export` renders them correctly, and later pushes do not diff them). The models stay
 * the single source of truth: after push, re-apply every policy's expressions from the models.
 */
function policyReconcileSql(): string {
  const dialect = new PgDialect({ casing: 'snake_case' });
  const statements: string[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const cfg = getTableConfig(value);
    for (const p of cfg.policies) {
      const clauses: string[] = [];
      if (p.using) clauses.push(`using (${dialect.sqlToQuery(p.using).sql})`);
      if (p.withCheck) clauses.push(`with check (${dialect.sqlToQuery(p.withCheck).sql})`);
      if (clauses.length) statements.push(`alter policy "${p.name}" on "${cfg.schema ?? 'public'}"."${cfg.name}" ${clauses.join(' ')};`);
    }
  }
  return statements.join('\n');
}

/** Drops every module schema (all data!). */
export async function dropAll(url: string) {
  await runSql(url, SCHEMAS.map((s) => `drop schema if exists ${s} cascade;`).join('\n'));
}

/**
 * Brings the database in line with the TypeScript models (no migration files):
 *   1. pre-push.sql   schemas + RLS helper functions
 *   2. drizzle-kit push   tables, indexes, constraints, RLS policies from the models
 *   3. post-push.sql  grants for the app role + append-only triggers
 *   4. permission catalog + default role templates
 * Runs from the backend directory with the owner connection.
 */
export async function syncDatabase(url: string) {
  await runSql(url, sqlFile('pre-push.sql'));

  const push = spawnSync(process.execPath, [path.resolve('node_modules/drizzle-kit/bin.cjs'), 'push', '--force'], {
    env: { ...process.env, MIGRATION_DATABASE_URL: url },
    encoding: 'utf8',
  });
  // drizzle-kit can exit 0 after an error (e.g. a prompt it cannot show without a TTY).
  const output = `${push.stdout}\n${push.stderr}`;
  if (push.status !== 0 || /^\s*Error\b|Interactive prompts require a TTY/m.test(output)) {
    throw new Error(
      `drizzle-kit push failed. If it needs to ask a question (e.g. a rename or data-loss choice), run\n` +
        `  npx drizzle-kit push\ninteractively in backend/, then npm run db:sync again.\n\n${output}`,
    );
  }

  await runSql(url, policyReconcileSql());
  await runSql(url, sqlFile('post-push.sql'));

  const { pool, db } = createDb(url, 1);
  try {
    return await db.transaction((tx) => syncPermissionsAndRoles(tx));
  } finally {
    await pool.end();
  }
}
