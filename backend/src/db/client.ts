/**
 * Database access: Prisma ORM on PostgreSQL (driver adapter @prisma/adapter-pg).
 *
 * - `db`: the runtime client. It connects as the non-owner app role (DATABASE_URL), so PostgreSQL
 *   row-level security applies to every query.
 * - `createDb(url)`: a client for another connection (the owner, for scripts, seeding and tests).
 * - `withTenantTx`: one transaction per request, with the caller's RLS context set first.
 * - `query` / `execute`: hand-written SQL (Prisma.sql) through Prisma ($queryRaw / $executeRaw),
 *   for reports and filters the query API cannot express.
 *
 * Values keep the shapes the API has always used (ids as numbers, money as "123.00", calendar
 * dates as "YYYY-MM-DD"): see values.ts and the generated result extension.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env';
import { type Prisma, PrismaClient } from '../generated/prisma/client';
import { resultExtension } from './resultExtension.generated';
import { TABLES } from './tables.generated';
import { fromRawRow, toDate } from './values';

/** Date-only columns per Prisma model, to accept "YYYY-MM-DD" on the way in. */
const DATE_FIELDS: Record<string, string[]> = Object.fromEntries(
  Object.values(TABLES).map((t) => [
    t.$meta.model,
    Object.entries(t.$meta.columns)
      .filter(([, c]) => c.dateOnly)
      .map(([k]) => k),
  ]),
);

function datesIn(model: string, value: unknown): unknown {
  const fields = DATE_FIELDS[model];
  if (!fields?.length || !value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => datesIn(model, v));
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const f of fields) if (f in out) out[f] = toDate(out[f]);
  return out;
}

function extend(client: PrismaClient) {
  return client
    .$extends({
      query: {
        $allModels: {
          // "YYYY-MM-DD" for date columns, in data and simple where clauses.
          $allOperations({ model, args, query }) {
            const a = args as Record<string, unknown> | undefined;
            if (a && DATE_FIELDS[model]?.length) {
              for (const key of ['data', 'where', 'create', 'update'] as const) {
                if (key in a) a[key] = datesIn(model, a[key]);
              }
            }
            return query(args);
          },
        },
      },
    })
    .$extends({ result: resultExtension });
}

export function createDb(connectionString: string, max = 20) {
  const base = new PrismaClient({ adapter: new PrismaPg({ connectionString, max }) });
  return { db: extend(base), disconnect: () => base.$disconnect() };
}

/** Runtime client: the non-owner app role, so RLS policies apply. */
const runtime = createDb(env.DATABASE_URL);
export const db = runtime.db;
export const disconnectDb = runtime.disconnect;

export type Db = typeof db;
/** The client inside an interactive transaction. */
export type Tx = Parameters<Extract<Parameters<Db['$transaction']>[0], (tx: never) => unknown>>[0];
export type Executor = Db | Tx;

/** Long enough for bulk work (imports, seeding); interactive transactions default to 5 s. */
const TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

export interface TenantContext {
  userId: number;
  /** 'all' => user has at least one global grant. */
  dealershipIds: number[] | 'all';
}

/** One transaction on a client (runtime or owner), e.g. for scripts and public routes. */
export function transaction<T>(client: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return client.$transaction((tx) => fn(tx as Tx), TX_OPTIONS);
}

/**
 * Runs `fn` in one transaction with the RLS session settings for the caller.
 * set_config(..., true) is transaction-local, so nothing leaks across pooled connections.
 */
export function withTenantTx<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return transaction(db, async (tx) => {
    await applyTenant(tx, ctx);
    return fn(tx);
  });
}

export async function applyTenant(tx: Executor, ctx: TenantContext): Promise<void> {
  const isGlobal = ctx.dealershipIds === 'all';
  const ids = isGlobal ? '{}' : `{${(ctx.dealershipIds as number[]).join(',')}}`;
  await tx.$queryRaw`select set_config('app.user_id', ${String(ctx.userId)}, true),
                            set_config('app.global', ${isGlobal ? 'on' : 'off'}, true),
                            set_config('app.dealership_ids', ${ids}, true)`;
}

/** Hand-written SQL returning rows (ids and counts as numbers). */
export async function query<T = Record<string, unknown>>(ex: Executor, statement: Prisma.Sql): Promise<T[]> {
  const rows = (await ex.$queryRaw(statement)) as Record<string, unknown>[];
  return rows.map((r) => fromRawRow<T>(r));
}

/** Hand-written SQL statement (insert / update / delete / DDL); returns the affected row count. */
export function execute(ex: Executor, statement: Prisma.Sql): Promise<number> {
  return ex.$executeRaw(statement);
}
