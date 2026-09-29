/**
 * Building blocks for hand-written SQL run through Prisma ($queryRaw): Prisma's own sql / join /
 * raw / empty, plus small helpers for WHERE conditions (and / or / eq / inArray …) used where the
 * conditions are dynamic — access scopes, list filters and reports. Values are always sent as
 * query parameters; identifiers come from the generated tables (tables.generated.ts).
 */
import { Prisma } from '../generated/prisma/client';

export type SQL = Prisma.Sql;
export const sql = Prisma.sql;
export const join = Prisma.join;
export const raw = Prisma.raw;
export const empty = Prisma.empty;

type Cond = SQL | undefined | null | false;
const present = (conds: Cond[]) => conds.filter((c): c is SQL => !!c);

/** All conditions (undefined ones are skipped); undefined when there are none. */
export function and(...conds: Cond[]): SQL | undefined {
  const c = present(conds);
  if (!c.length) return undefined;
  return c.length === 1 ? c[0] : sql`(${join(c, ' and ')})`;
}

/** Any condition (undefined ones are skipped); undefined when there are none. */
export function or(...conds: Cond[]): SQL | undefined {
  const c = present(conds);
  if (!c.length) return undefined;
  return c.length === 1 ? c[0] : sql`(${join(c, ' or ')})`;
}

export const not = (c: SQL) => sql`not (${c})`;
export const eq = (col: SQL, v: unknown) => sql`${col} = ${v}`;
export const ne = (col: SQL, v: unknown) => sql`${col} <> ${v}`;
export const gt = (col: SQL, v: unknown) => sql`${col} > ${v}`;
export const gte = (col: SQL, v: unknown) => sql`${col} >= ${v}`;
export const lt = (col: SQL, v: unknown) => sql`${col} < ${v}`;
export const lte = (col: SQL, v: unknown) => sql`${col} <= ${v}`;
export const isNull = (col: SQL) => sql`${col} is null`;
export const isNotNull = (col: SQL) => sql`${col} is not null`;
export const ilike = (col: SQL, pattern: string) => sql`${col} ilike ${pattern}`;

/** col in (…values); an empty list matches nothing. */
export function inArray(col: SQL, values: readonly unknown[]): SQL {
  return values.length ? sql`${col} in (${join(values as unknown[])})` : sql`false`;
}
/** col not in (…values); an empty list matches everything. */
export function notInArray(col: SQL, values: readonly unknown[]): SQL {
  return values.length ? sql`${col} not in (${join(values as unknown[])})` : sql`true`;
}

/** `where …` clause, or nothing. */
export const where = (cond: SQL | undefined) => (cond ? sql`where ${cond}` : empty);
