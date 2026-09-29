import { query } from '../../db/client';
import { raw, sql } from '../../db/sql';
import type { EntityCtx } from '../../entity/types';
import { conflict } from '../../lib/errors';
import { type MOVEMENT_TYPES, stockItem } from './models';

export type MovementType = (typeof MOVEMENT_TYPES)[number];

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
  // One stock row per (branch, part): a no-op when it already exists.
  await ctx.tx.stockItem.createMany({
    data: [{ dealershipId: m.dealershipId, branchId: m.branchId, partId: m.partId }],
    skipDuplicates: true,
  });
  const [item] = await query<{ id: number; quantityOnHand: string; averageCost: string }>(
    ctx.tx,
    sql`select ${stockItem.id} as "id", ${stockItem.quantityOnHand}::text as "quantityOnHand", ${stockItem.averageCost}::text as "averageCost"
          from ${stockItem}
         where ${stockItem.branchId} = ${m.branchId} and ${stockItem.partId} = ${m.partId}
           for update`,
  );

  const inbound = !m.quantity.trim().startsWith('-');
  const cost = inbound && m.unitCost != null ? m.unitCost : item!.averageCost;
  // One atomic statement: numeric arithmetic in Postgres, never below zero.
  const averageCost = inbound
    ? sql`case when ${stockItem.quantityOnHand} + ${m.quantity}::numeric = 0 then ${cost}::numeric
               else round((${stockItem.quantityOnHand} * ${stockItem.averageCost} + ${m.quantity}::numeric * ${cost}::numeric)
                          / (${stockItem.quantityOnHand} + ${m.quantity}::numeric), 2) end`
    : stockItem.averageCost;
  const [updated] = await query<{ balanceAfter: string; averageCostAfter: string }>(
    ctx.tx,
    sql`update ${stockItem}
           set ${raw('quantity_on_hand')} = ${stockItem.quantityOnHand} + ${m.quantity}::numeric,
               ${raw('average_cost')} = ${averageCost},
               ${raw('updated_at')} = now()
         where ${stockItem.id} = ${item!.id} and ${stockItem.quantityOnHand} + ${m.quantity}::numeric >= 0
     returning ${stockItem.quantityOnHand}::text as "balanceAfter", ${stockItem.averageCost}::text as "averageCostAfter"`,
  );

  if (!updated) {
    const p = await ctx.tx.part.findFirst({ where: { id: m.partId }, select: { partNo: true } });
    throw conflict(`Not enough stock of ${p?.partNo ?? `part ${m.partId}`}: ${Number(item!.quantityOnHand)} on hand, ${Math.abs(Number(m.quantity))} needed`, {
      partId: m.partId,
      onHand: item!.quantityOnHand,
    });
  }

  const [{ value } = { value: '0' }] = await query<{ value: string }>(
    ctx.tx,
    sql`select round(${m.quantity}::numeric * ${cost}::numeric, 2)::text as value`,
  );

  await ctx.tx.inventoryTransaction.create({
    data: {
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
    },
    select: { id: true },
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
  const [{ total } = { total: '0.00' }] = await query<{ total: string }>(
    ctx.tx,
    sql`select coalesce(sum(v), 0)::numeric(14,2)::text as total from unnest(${`{${values.join(',')}}`}::numeric[]) v`,
  );
  return total;
}
