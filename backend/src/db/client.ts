import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env';
import * as schema from './schema';

export function createDb(connectionString: string, max = 20) {
  const pool = new pg.Pool({ connectionString, max });
  return { pool, db: drizzle(pool, { schema, casing: 'snake_case' }) };
}

/** Runtime pool: connects as the non-owner app role, so RLS policies apply. */
export const { pool, db } = createDb(env.DATABASE_URL);

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Executor = Db | Tx;

export interface TenantContext {
  userId: number;
  /** 'all' => user has at least one global grant. */
  dealershipIds: number[] | 'all';
}

/**
 * Runs `fn` in one transaction with the RLS session settings for the caller.
 * set_config(..., true) is transaction-local, so nothing leaks across pooled connections.
 */
export function withTenantTx<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await applyTenant(tx, ctx);
    return fn(tx);
  });
}

export async function applyTenant(tx: Tx, ctx: TenantContext): Promise<void> {
  const isGlobal = ctx.dealershipIds === 'all';
  const ids = isGlobal ? '{}' : `{${(ctx.dealershipIds as number[]).join(',')}}`;
  await tx.execute(
    sql`select set_config('app.user_id', ${String(ctx.userId)}, true),
               set_config('app.global', ${isGlobal ? 'on' : 'off'}, true),
               set_config('app.dealership_ids', ${ids}, true)`,
  );
}
