/**
 * The values the API has always used, from what Prisma returns:
 *   BigInt ids / counts -> number   (ids stay far below 2^53)
 *   Decimal (numeric)   -> "123.00" (fixed decimals, as PostgreSQL returns them)
 *   date                -> "YYYY-MM-DD"
 * And "YYYY-MM-DD" strings -> Date for date columns on the way in (Prisma needs a Date there).
 */
import { Prisma } from '../generated/prisma/client';

type Nullable<T> = T | null;

export function fromBigInt<T extends Nullable<bigint>>(v: T): T extends bigint ? number : null {
  return (v === null || v === undefined ? null : Number(v)) as T extends bigint ? number : null;
}

export function fromDecimal<T extends Nullable<{ toFixed(dp: number): string }>>(v: T, scale: number): T extends null ? null : string {
  return (v === null || v === undefined ? null : v.toFixed(scale)) as T extends null ? null : string;
}

export function fromDate<T extends Nullable<Date>>(v: T): T extends Date ? string : null {
  return (v === null || v === undefined ? null : v.toISOString().slice(0, 10)) as T extends Date ? string : null;
}

/** "2026-09-29" -> Date at UTC midnight (how Prisma stores a calendar date). */
export function toDate(v: unknown): unknown {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : v;
}

/**
 * Rows from $queryRaw: BigInt -> number, Decimal -> string. (Hand-written SQL that returns money
 * already casts it, e.g. sum(x)::numeric(14,2)::text; a bare numeric keeps its digits.)
 */
export function fromRawValue(v: unknown): unknown {
  if (typeof v === 'bigint') return Number(v);
  if (Prisma.Decimal.isDecimal(v)) return (v as Prisma.Decimal).toString();
  if (Array.isArray(v)) return v.map(fromRawValue);
  return v;
}

export function fromRawRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = fromRawValue(v);
  return out as T;
}
