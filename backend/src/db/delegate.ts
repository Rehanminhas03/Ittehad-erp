/**
 * Generic access to a model's Prisma delegate (tx.lead, tx.salesOrder…) from its generated table
 * identifier, for code that works over any model (the entity engine, document lines).
 */
import type { Executor } from './client';
import type { AnyTable } from './tableIdentifiers';

type Row = Record<string, unknown> & { id: number };
type Args = Record<string, unknown>;

export interface ModelDelegate {
  findMany(args?: Args): Promise<Row[]>;
  findUnique(args: Args): Promise<Row | null>;
  findFirst(args?: Args): Promise<Row | null>;
  create(args: Args): Promise<Row>;
  update(args: Args): Promise<Row>;
  delete(args: Args): Promise<Row>;
  count(args?: Args): Promise<number>;
}

export function delegateOf(ex: Executor, table: AnyTable): ModelDelegate {
  const d = (ex as unknown as Record<string, ModelDelegate>)[table.$meta.delegate];
  if (!d) throw new Error(`No Prisma delegate "${table.$meta.delegate}"`);
  return d;
}

/**
 * The model's own columns from a data object (Prisma rejects unknown keys; the API objects may carry
 * extras). `undefined` values are left out; `id` is never written.
 */
export function pickColumns(table: AnyTable, data: Record<string, unknown>): Record<string, unknown> {
  const cols = table.$meta.columns;
  return Object.fromEntries(Object.entries(data).filter(([k, v]) => k !== 'id' && v !== undefined && k in cols));
}
