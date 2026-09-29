import { type Executor, query } from '../db/client';
import { type SQL, inArray, join, sql } from '../db/sql';
import type { AnyTable, Row } from './types';

/** Where a display name comes from: a table and the column/expression to show. */
export interface NameSource {
  table: AnyTable;
  id: SQL;
  label: SQL;
}

/**
 * Batch-adds display names to rows for list/detail responses, all sources in one query (UNION ALL,
 * one branch per field; labels as text):
 *   withNames(tx, rows, { customerName: { key: 'customerId', source: CUSTOMER_NAME } })
 */
export async function withNames(ex: Executor, rows: Row[], spec: Record<string, { key: string; source: NameSource }>): Promise<Row[]> {
  const fields = Object.entries(spec);
  const branches: SQL[] = [];
  fields.forEach(([, { key, source }], i) => {
    const ids = [...new Set(rows.map((r) => r[key]).filter((x): x is number => typeof x === 'number'))];
    if (ids.length) {
      branches.push(sql`(select ${i}::int as f, ${source.id} as id, (${source.label})::text as label from ${source.table} where ${inArray(source.id, ids)})`);
    }
  });
  const found = branches.length ? await query<{ f: number; id: number; label: string | null }>(ex, join(branches, ' union all ')) : [];
  const maps = fields.map(() => new Map<number, string | null>());
  for (const f of found) maps[f.f]!.set(f.id, f.label);
  return rows.map((r) => {
    const out: Row = { ...r };
    fields.forEach(([field, { key }], i) => {
      out[field] = r[key] == null ? null : (maps[i]!.get(r[key] as number) ?? null);
    });
    return out;
  });
}
