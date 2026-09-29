import { and, eq, sql } from 'drizzle-orm';
import type { EntityCtx } from '../../entity/types';
import { conflict } from '../../lib/errors';
import { inventoryTransaction, part, stockItem } from './models';

export type MovementType = (typeof inventoryTransaction.$inferInsert)['type'];

export interface Movement {
  dealershipId: number;
  branchId: number;
  partId: number;
  type: MovementType;
  /** Signed decimal string: positive into stock, negative out. */
  quantity: string;
  /** Cost for stock coming in (receipts, transfers in, returns, positive adjustments). Outbound uses the average cost. */
  unitCost?: string | null;
  referenceType: string;
  referenceId: number;
  referenceNo?: string | null;
  notes?: string | null;
}

export interface MovementResult {
  unitCost: string;
  value: string;
  balanceAfter: string;
  averageCostAfter: string;
}

/**
 * The only way stock changes. In the caller's transaction:
 *   1. lock the branch's stock row (created on first use);
 *   2. apply the quantity, refusing to go below zero; inbound stock updates the moving-average cost;
 *   3. append the ledger row (append-only table) with the resulting balance and cost.
 * Arithmetic runs in Postgres numeric, so quantities and money are exact.
 */
export async function moveStock(ctx: EntityCtx, m: Movement): Promise<MovementResult> {
  await ctx.tx
    .insert(stockItem)
    .values({ dealershipId: m.dealershipId, branchId: m.branchId, partId: m.partId })
    .onConflictDoNothing({ target: [stockItem.branchId, stockItem.partId] });
  const [item] = await ctx.tx
    .select()
    .from(stockItem)
    .where(and(eq(stockItem.branchId, m.branchId), eq(stockItem.partId, m.partId)))
    .for('update');

  const inbound = !m.quantity.trim().startsWith('-');
  const cost = inbound && m.unitCost != null ? m.unitCost : item!.averageCost;
  const [updated] = await ctx.tx
    .update(stockItem)
    .set({
      quantityOnHand: sql`${stockItem.quantityOnHand} + ${m.quantity}::numeric`,
      averageCost: inbound
        ? sql`case when ${stockItem.quantityOnHand} + ${m.quantity}::numeric = 0 then ${cost}::numeric
                   else round((${stockItem.quantityOnHand} * ${stockItem.averageCost} + ${m.quantity}::numeric * ${cost}::numeric)
                              / (${stockItem.quantityOnHand} + ${m.quantity}::numeric), 2) end`
        : stockItem.averageCost,
      updatedAt: new Date(),
    })
    .where(and(eq(stockItem.id, item!.id), sql`${stockItem.quantityOnHand} + ${m.quantity}::numeric >= 0`))
    .returning({ balanceAfter: stockItem.quantityOnHand, averageCostAfter: stockItem.averageCost });

  if (!updated) {
    const [p] = await ctx.tx.select({ partNo: part.partNo }).from(part).where(eq(part.id, m.partId));
    throw conflict(`Not enough stock of ${p?.partNo ?? `part ${m.partId}`}: ${Number(item!.quantityOnHand)} on hand, ${Math.abs(Number(m.quantity))} needed`, {
      partId: m.partId,
      onHand: item!.quantityOnHand,
    });
  }

  const [{ value } = { value: '0' }] = await ctx.tx.execute<{ value: string }>(
    sql`select round(${m.quantity}::numeric * ${cost}::numeric, 2)::text as value`,
  ).then((r) => r.rows);

  await ctx.tx.insert(inventoryTransaction).values({
    dealershipId: m.dealershipId,
    branchId: m.branchId,
    partId: m.partId,
    type: m.type,
    quantity: m.quantity,
    unitCost: cost,
    value,
    balanceAfter: updated.balanceAfter,
    averageCostAfter: updated.averageCostAfter,
    referenceType: m.referenceType,
    referenceId: m.referenceId,
    referenceNo: m.referenceNo ?? null,
    notes: m.notes ?? null,
    actorId: ctx.access.userId,
  });
  return { unitCost: cost, value, ...updated };
}

/**
 * Moves several lines. Rows are locked in part order, so two documents touching the same parts
 * cannot deadlock each other.
 */
export async function moveStockLines(ctx: EntityCtx, moves: Movement[]): Promise<MovementResult[]> {
  const order = moves.map((m, i) => ({ m, i })).sort((a, b) => a.m.branchId - b.m.branchId || a.m.partId - b.m.partId);
  const results: MovementResult[] = new Array(moves.length);
  for (const { m, i } of order) results[i] = await moveStock(ctx, m);
  return results;
}

/** Sum of signed values, exact (for event payloads / document totals). */
export async function sumValues(ctx: EntityCtx, values: string[]): Promise<string> {
  if (!values.length) return '0.00';
  const [{ total } = { total: '0.00' }] = await ctx.tx
    .execute<{ total: string }>(sql`select coalesce(sum(v), 0)::numeric(14,2)::text as total from unnest(${`{${values.join(',')}}`}::numeric[]) v`)
    .then((r) => r.rows);
  return total;
}
