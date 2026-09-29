/**
 * Table and column identifiers for hand-written SQL run through Prisma ($queryRaw / Prisma.sql).
 * Interpolating a table renders "schema"."table"; a column renders "table"."column" — so
 * sql`select ${lead.status} from ${lead}` reads like the SQL it produces. Generated per model in
 * tables.generated.ts from prisma/schema.prisma.
 */
import { Prisma } from '../generated/prisma/client';

export interface ColumnMeta {
  /** Database column name (snake_case). */
  column: string;
  /** Prisma scalar type. */
  type: 'String' | 'Int' | 'BigInt' | 'Decimal' | 'DateTime' | 'Boolean' | 'Json' | 'Float' | 'Bytes';
  nullable: boolean;
  /** numeric(p, s): the number of decimals, so money reads "123.00" as it did before. */
  scale?: number;
  /** A calendar date (PostgreSQL `date`): read and written as "YYYY-MM-DD". */
  dateOnly?: boolean;
}

export interface TableMeta {
  /** Prisma model name, e.g. SalesOrder. */
  model: string;
  /** Prisma Client delegate, e.g. salesOrder (tx.salesOrder.findMany…). */
  delegate: string;
  schema: string;
  table: string;
  columns: Record<string, ColumnMeta>;
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

export type Table<C extends Record<string, ColumnMeta>> = Prisma.Sql & { readonly [K in keyof C]: Prisma.Sql } & { readonly $meta: TableMeta };

/** The table (as SQL) with a property per column (as SQL) and its metadata. */
export function defineTable<C extends Record<string, ColumnMeta>>(info: Omit<TableMeta, 'columns'>, columns: C): Table<C> {
  const t = Prisma.raw(`${quote(info.schema)}.${quote(info.table)}`) as Prisma.Sql & Record<string, unknown>;
  for (const [key, meta] of Object.entries(columns)) {
    if (key in t) throw new Error(`${info.model}.${key}: column name clashes with Prisma.Sql`);
    Object.defineProperty(t, key, { value: Prisma.raw(`${quote(info.table)}.${quote(meta.column)}`), enumerable: false });
  }
  Object.defineProperty(t, '$meta', { value: { ...info, columns }, enumerable: false });
  return t as unknown as Table<C>;
}

/** Any generated table. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTable = Table<Record<string, ColumnMeta>> & Record<string, any>;
