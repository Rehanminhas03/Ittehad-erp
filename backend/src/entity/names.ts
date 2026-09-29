import { type SQL, inArray } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { Executor } from '../db/client';
import type { AnyTable, Row } from './types';

/** Where a display name comes from: a table and the column/expression to show. */
export interface NameSource {
  table: AnyTable;
  id: AnyPgColumn;
  label: AnyPgColumn | SQL;
}

/**
 * Batch-adds display names to rows for list/detail responses, one query per source:
 *   withNames(tx, rows, { customerName: { key: 'customerId', source: CUSTOMER_NAME } })
 */
export async function withNames(ex: Executor, rows: Row[], spec: Record<string, { key: string; source: NameSource }>): Promise<Row[]> {
  const maps: Record<string, Map<number, string>> = {};
  // Sequential: all lookups share the request's single transaction connection.
  for (const [field, { key, source }] of Object.entries(spec)) {
    const ids = [...new Set(rows.map((r) => r[key]).filter((x): x is number => typeof x === 'number'))];
    const found = ids.length
      ? await ex.select({ id: source.id, label: source.label }).from(source.table).where(inArray(source.id, ids))
      : [];
    maps[field] = new Map(found.map((f) => [f.id as number, f.label as string]));
  }
  return rows.map((r) => {
    const out: Row = { ...r };
    for (const [field, { key }] of Object.entries(spec)) out[field] = r[key] == null ? null : (maps[field]!.get(r[key] as number) ?? null);
    return out;
  });
}
