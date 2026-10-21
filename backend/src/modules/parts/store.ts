/**
 * The store desk, second part: the manager's catalogue (new parts, part-number and price changes), the
 * open job cards to issue parts to, and the all-parts stock view with in / out per part.
 */
import { scopeWhere } from '../../auth/access';
import { query } from '../../db/client';
import { type SQL, and, eq, raw, sql } from '../../db/sql';
import type { EntityCtx } from '../../entity/types';
import { conflict, forbidden, validationError } from '../../lib/errors';
import { lineAmount } from '../../lib/money';
import type { PageQuery } from '../../lib/pagination';
import { offsetOf } from '../../lib/pagination';
import type { z } from '../../lib/zod';
import { branch as branchTable, user } from '../core/models';
import { inventoryTransaction, legacySale, part, stockItem } from './models';
import { normalizePartNo } from './entities';
import { PartsPerm as P } from './permissions';
import type { AssignModelsBody, DirectIssueBody, InventoryQuery, ManagePartCreate, ManagePartUpdate, PartPrefixQuery, PriceChangeBody, SaleReportQuery, EarlierSalesQuery } from './schemas';
import { assertBranch, resolveLines } from './service';
import { moveStockLines } from './stock';

const karachiMonth = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 7);

// =============================================================================
// Manager: add parts, change part numbers and prices (for the brands the manager looks after)
// =============================================================================
/** The catalogue is shared by the group; a store manager may change only the parts of their own brand. */
async function assertBrandRight(ctx: EntityCtx, brand: string | null) {
  const sc = ctx.access.scope(P.catalogManage);
  if (sc.global) return;
  const ids = [...new Set([...sc.dealershipIds, ...sc.branches.map((b) => b.dealershipId)])];
  const brands = ids.length ? (await ctx.tx.dealership.findMany({ where: { id: { in: ids } }, select: { brand: true } })).map((d) => d.brand.toLowerCase()) : [];
  if (!brand || !brands.includes(brand.toLowerCase())) throw forbidden(brand ? `You manage the parts of ${brands.join(', ') || 'no brand'}, not ${brand}` : 'This part has no brand: only the head office can change it');
}

export async function createManagedPart(ctx: EntityCtx, input: z.output<typeof ManagePartCreate>) {
  await assertBrandRight(ctx, input.brand);
  const partNo = normalizePartNo(input.partNo);
  const dup = await ctx.tx.part.findFirst({ where: { partNo }, select: { id: true } });
  if (dup) throw conflict(`Part number ${partNo} already exists`, { existingId: dup.id });
  const row = await ctx.tx.part.create({
    data: { partNo, description: input.description, brand: input.brand, category: input.category ?? null, uom: input.uom, sellingPrice: input.sellingPrice, modelIds: input.modelIds ?? [], createdById: ctx.access.userId, updatedById: ctx.access.userId },
  });
  await ctx.audit({ entityType: 'parts.part', entityId: row.id, action: 'create', dealershipId: null, branchId: null, changes: { partNo, description: input.description, sellingPrice: input.sellingPrice } });
  return row;
}

export async function updateManagedPart(ctx: EntityCtx, id: number, input: z.output<typeof ManagePartUpdate>) {
  const before = await ctx.tx.part.findFirst({ where: { id } });
  if (!before) throw validationError([{ in: 'params', path: 'id', message: 'Part not found' }]);
  await assertBrandRight(ctx, before.brand);
  const patch: Record<string, unknown> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const set = (k: string, to: unknown, from: unknown) => {
    if (to !== undefined && String(to ?? '') !== String(from ?? '')) {
      patch[k] = to;
      changes[k] = { from, to };
    }
  };
  if (input.partNo !== undefined) {
    const partNo = normalizePartNo(input.partNo);
    if (partNo !== before.partNo) {
      const dup = await ctx.tx.part.findFirst({ where: { partNo }, select: { id: true } });
      if (dup) throw conflict(`Part number ${partNo} already exists`, { existingId: dup.id });
      set('partNo', partNo, before.partNo);
    }
  }
  set('description', input.description, before.description);
  set('category', input.category, before.category);
  set('uom', input.uom, before.uom);
  set('isActive', input.isActive, before.isActive);
  if (input.modelIds !== undefined) {
    const to = [...new Set(input.modelIds)].sort((a, b) => a - b);
    if (to.join() !== [...before.modelIds].sort((a, b) => a - b).join()) {
      patch.modelIds = to;
      changes.modelIds = { from: before.modelIds, to };
    }
  }
  if (input.sellingPrice !== undefined) {
    const [{ same } = { same: 'true' }] = await query<{ same: string }>(ctx.tx, sql`select (${before.sellingPrice.toString()}::numeric = ${input.sellingPrice}::numeric)::text as same`);
    if (same !== 'true') {
      patch.sellingPrice = input.sellingPrice;
      changes.sellingPrice = { from: before.sellingPrice.toString(), to: input.sellingPrice };
    }
  }
  if (!Object.keys(patch).length) return before;
  const row = await ctx.tx.part.update({ where: { id }, data: { ...patch, updatedById: ctx.access.userId } });
  await ctx.audit({ entityType: 'parts.part', entityId: id, action: 'update', dealershipId: null, branchId: null, changes });
  return row;
}

/** Raise (+) or lower (−) the prices of a brand's parts, optionally one category, by a percentage. */
export async function changePrices(ctx: EntityCtx, input: z.output<typeof PriceChangeBody>) {
  await assertBrandRight(ctx, input.brand);
  const cat: SQL = input.category ? sql`and ${part.category} = ${input.category}` : sql``;
  const rows = await query<{ id: number }>(
    ctx.tx,
    sql`update ${part}
           set ${raw('selling_price')} = round(${part.sellingPrice} * (1 + ${input.percent}::numeric / 100), 2),
               ${raw('updated_at')} = now(), ${raw('updated_by_id')} = ${ctx.access.userId}
         where lower(${part.brand}) = lower(${input.brand}) ${cat}
     returning ${part.id} as "id"`,
  );
  await ctx.audit({ entityType: 'parts.part', entityId: 0, action: 'price_change', dealershipId: null, branchId: null, changes: { brand: input.brand, category: input.category ?? null, percent: input.percent, parts: rows.length } });
  return { changed: rows.length };
}

// =============================================================================
// Open job cards, and issuing against one
// =============================================================================
export async function openJobCards(ctx: EntityCtx, dealershipId: number) {
  if (!ctx.access.canIn(P.issuesCreate, { dealershipId })) throw forbidden();
  const cards = await ctx.tx.jobCard.findMany({
    where: { dealershipId, status: { in: ['open', 'in_progress'] } },
    include: { vehicle: true, visit: true },
    orderBy: { id: 'desc' },
    take: 200,
  });
  const entryIds = cards.map((c) => c.visit.scheduleEntryId).filter((x): x is number => !!x);
  const entryNames = new Map((entryIds.length ? await ctx.tx.vehicleSchedule.findMany({ where: { id: { in: entryIds } }, select: { id: true, name: true } }) : []).map((e) => [e.id, e.name]));
  const models = new Map((await ctx.tx.vehicleModel.findMany({ where: { id: { in: [...new Set(cards.map((c) => c.vehicle.modelId))] } }, select: { id: true, name: true } })).map((m) => [m.id, m.name]));
  const customers = new Map((await ctx.tx.customer.findMany({ where: { id: { in: [...new Set(cards.map((c) => c.visit.customerId))] } }, select: { id: true, fullName: true } })).map((c) => [c.id, c.fullName]));
  return cards.map((c) => ({
    id: c.id,
    jobCardNo: c.jobCardNo,
    status: c.status,
    registrationNo: c.vehicle.registrationNo,
    vin: c.vehicle.vin,
    modelName: models.get(c.vehicle.modelId) ?? null,
    customerName: customers.get(c.visit.customerId) ?? null,
    freeService: c.visit.freeService,
    serviceLabel: entryNames.get(c.visit.scheduleEntryId ?? 0) ?? null,
  }));
}

/**
 * Parts out of the store against an open job card (the workshop's) or a typed repair order (RO) number, or
 * unused parts back. With a job card, its number and the vehicle come from the after-sales record and the
 * parts are added to the job card's lines (priced for the customer's bill).
 */
export async function issueDirect(ctx: EntityCtx, input: z.output<typeof DirectIssueBody>) {
  const target = { dealershipId: input.dealershipId, branchId: input.branchId };
  if (!ctx.access.canIn(P.issuesCreate, target)) throw forbidden();
  await assertBranch(ctx, input.dealershipId, input.branchId);
  const jc = input.jobCardId
    ? await ctx.tx.jobCard.findFirst({ where: { id: input.jobCardId, dealershipId: input.dealershipId }, include: { vehicle: true } })
    : null;
  if (input.jobCardId && !jc) throw validationError([{ in: 'body', path: 'jobCardId', message: 'Choose a job card of this dealership' }]);
  if (jc && !['open', 'in_progress'].includes(jc.status)) throw conflict(`Job card ${jc.jobCardNo} is ${jc.status}: parts can only be issued to an open job card`);
  const referenceNo = jc ? jc.jobCardNo : (input.referenceNo ?? '').trim();
  if (referenceNo.length < 2) throw validationError([{ in: 'body', path: 'referenceNo', message: 'Choose the open job card, or enter the repair order number' }]);
  const vehicleRef = jc ? [jc.vehicle.registrationNo, jc.vehicle.vin].filter(Boolean).join(' / ') || null : (input.vehicleRef ?? null);

  const lines = await resolveLines(ctx, input.lines);
  const out = input.kind === 'issue';
  const note = vehicleRef ? `Vehicle ${vehicleRef}` : null;
  const priceOf = (l: (typeof lines)[number]) => l.unitPrice ?? l.part.sellingPrice.toString();

  // The job card's own lines first, so a return can never take back more than was issued to it.
  if (jc) {
    for (const [i, l] of lines.entries()) {
      const existing = await ctx.tx.jobCardLine.findFirst({ where: { jobCardId: jc.id, partNo: l.part.partNo, source: 'parts' } });
      if (out) continue;
      const have = existing ? Number(existing.quantity) : 0;
      if (Number(l.quantity) > have) throw validationError([{ in: 'body', path: `lines.${i}.quantity`, message: `Only ${have} of ${l.part.partNo} were issued to ${jc.jobCardNo}` }]);
    }
  }

  const results = await moveStockLines(
    ctx,
    lines.map((l) => ({
      ...target,
      partId: l.part.id,
      type: out ? ('issue' as const) : ('return' as const),
      quantity: out ? `-${l.quantity}` : l.quantity,
      unitPrice: priceOf(l),
      referenceType: jc ? 'job_card' : 'repair_order',
      referenceId: jc ? jc.id : 0,
      referenceNo,
      notes: note,
      invoiceNo: input.invoiceNo?.trim() || null,
      remarks: input.notes?.trim() || null,
    })),
  );

  if (jc) {
    for (const l of lines) {
      const existing = await ctx.tx.jobCardLine.findFirst({ where: { jobCardId: jc.id, partNo: l.part.partNo, source: 'parts' } });
      const delta = out ? Number(l.quantity) : -Number(l.quantity);
      const qty = (existing ? Number(existing.quantity) : 0) + delta;
      if (existing) {
        if (qty <= 0) await ctx.tx.jobCardLine.deleteMany({ where: { id: existing.id } });
        else await ctx.tx.jobCardLine.update({ where: { id: existing.id }, data: { quantity: String(qty), amount: lineAmount(existing.unitPrice.toString(), String(qty)) } });
      } else if (out) {
        const price = priceOf(l);
        await ctx.tx.jobCardLine.create({
          data: { dealershipId: jc.dealershipId, jobCardId: jc.id, kind: 'part', description: l.part.description, partNo: l.part.partNo, quantity: l.quantity, unitPrice: price, amount: lineAmount(price, l.quantity), source: 'parts', status: 'done', doneById: ctx.access.userId, doneAt: new Date() },
        });
      }
    }
  }
  await ctx.audit({ entityType: 'parts.part', entityId: 0, action: out ? 'issue' : 'return', ...target, changes: { referenceNo, jobCardId: jc?.id ?? null, lines: input.lines } });
  return {
    referenceNo,
    kind: input.kind,
    lines: lines.map((l, i) => ({ partNo: l.part.partNo, description: l.part.description, quantity: l.quantity, unitCost: results[i]!.unitCost, unitPrice: priceOf(l), balanceAfter: results[i]!.balanceAfter })),
  };
}

// =============================================================================
// Every part with its stock, and what came in and went out this month
// =============================================================================
export async function inventory(ctx: EntityCtx, q: PageQuery, f: z.output<typeof InventoryQuery>) {
  const stockConds: SQL[] = [scopeWhere(ctx.access.scope(P.stockView), { dealership: stockItem.dealershipId, branch: stockItem.branchId })];
  const moveConds: SQL[] = [scopeWhere(ctx.access.scope(P.stockView), { dealership: inventoryTransaction.dealershipId, branch: inventoryTransaction.branchId })];
  if (f.dealershipId) {
    stockConds.push(eq(stockItem.dealershipId, f.dealershipId));
    moveConds.push(eq(inventoryTransaction.dealershipId, f.dealershipId));
  }
  if (f.branchId) {
    stockConds.push(eq(stockItem.branchId, f.branchId));
    moveConds.push(eq(inventoryTransaction.branchId, f.branchId));
  }
  moveConds.push(sql`to_char(${inventoryTransaction.occurredAt} at time zone 'Asia/Karachi', 'YYYY-MM') = ${karachiMonth()}`);

  const conds: SQL[] = [sql`${part.isActive}`];
  if (f.brand) conds.push(sql`lower(${part.brand}) = lower(${f.brand})`);
  if (f.category) conds.push(eq(part.category, f.category));
  if (f.modelId) conds.push(sql`${f.modelId}::int = any(${part.modelIds})`);
  if (q.q?.trim()) {
    const like = `%${q.q.trim()}%`;
    conds.push(sql`(${part.partNo} ilike ${like} or ${part.description} ilike ${like})`);
  }
  if (f.inStock) conds.push(sql`coalesce(s.on_hand, 0) > 0`);
  if (f.lowStock) conds.push(sql`(coalesce(s.reorder, 0) > 0 and coalesce(s.on_hand, 0) <= s.reorder)`);
  const joins = sql`
    left join (select ${stockItem.partId} as part_id, sum(${stockItem.quantityOnHand}) as on_hand,
                      sum(${stockItem.quantityOnHand} * ${stockItem.averageCost}) as value, max(${stockItem.reorderLevel}) as reorder
                 from ${stockItem} where ${and(...stockConds)!} group by ${stockItem.partId}) s on s.part_id = ${part.id}
    left join (select ${inventoryTransaction.partId} as part_id,
                      sum(${inventoryTransaction.quantity}) filter (where ${inventoryTransaction.quantity} > 0) as in_qty,
                      -sum(${inventoryTransaction.quantity}) filter (where ${inventoryTransaction.quantity} < 0) as out_qty
                 from ${inventoryTransaction} where ${and(...moveConds)!} group by ${inventoryTransaction.partId}) m on m.part_id = ${part.id}`;
  const where = and(...conds)!;
  const items = await query<{
    partId: number; partNo: string; description: string; brand: string | null; category: string | null; sellingPrice: string;
    onHand: string; stockValue: string; reorderLevel: string; inThisMonth: string; outThisMonth: string;
  }>(
    ctx.tx,
    sql`select ${part.id} as "partId", ${part.partNo} as "partNo", ${part.description} as "description", ${part.brand} as "brand", ${part.category} as "category",
               ${part.sellingPrice}::text as "sellingPrice", coalesce(s.on_hand, 0)::text as "onHand",
               coalesce(round(s.value, 2), 0)::text as "stockValue", coalesce(s.reorder, 0)::text as "reorderLevel",
               coalesce(m.in_qty, 0)::text as "inThisMonth", coalesce(m.out_qty, 0)::text as "outThisMonth"
          from ${part} ${joins}
         where ${where}
         order by (coalesce(s.on_hand, 0) > 0) desc, ${part.partNo}
         limit ${q.pageSize} offset ${offsetOf(q)}`,
  );
  const [{ total } = { total: 0 }] = await query<{ total: number }>(ctx.tx, sql`select count(*)::int as total from ${part} ${joins} where ${where}`);
  const [t] = await query<{ stockValue: string; parts: number }>(
    ctx.tx,
    sql`select coalesce(round(sum(s.value), 2), 0)::text as "stockValue", (count(*) filter (where s.on_hand > 0))::int as "parts" from ${part} ${joins} where ${where}`,
  );
  return { items, total, page: q.page, pageSize: q.pageSize, stockValue: t?.stockValue ?? '0', partsInStock: t?.parts ?? 0 };
}

/** The brand's parts grouped by the first characters of the part code, with the models assigned to each group. */
export async function partPrefixes(ctx: EntityCtx, f: z.output<typeof PartPrefixQuery>) {
  await assertBrandRight(ctx, f.brand);
  return query<{ prefix: string; parts: number; assigned: number; sample: string; modelIds: number[] }>(
    ctx.tx,
    sql`select left(${part.partNo}, ${f.length}::int) as "prefix", count(*)::int as "parts",
               (count(*) filter (where cardinality(${part.modelIds}) > 0))::int as "assigned",
               min(${part.description}) as "sample",
               coalesce(min(${part.modelIds}::text) filter (where cardinality(${part.modelIds}) > 0), '{}')::int[] as "modelIds"
          from ${part}
         where lower(${part.brand}) = lower(${f.brand}) and ${part.isActive}
         group by 1 order by 2 desc, 1 limit 200`,
  );
}

/** Set (or add) the vehicle models of all parts of a brand whose code starts with a prefix. */
export async function assignModels(ctx: EntityCtx, input: z.output<typeof AssignModelsBody>) {
  await assertBrandRight(ctx, input.brand);
  const ids = [...new Set(input.modelIds)];
  if (ids.length) {
    const ok = await ctx.tx.vehicleModel.findMany({ where: { id: { in: ids }, brand: { equals: input.brand, mode: 'insensitive' } }, select: { id: true } });
    if (ok.length !== ids.length) throw validationError([{ in: 'body', path: 'modelIds', message: `Choose ${input.brand} models only` }]);
  }
  const prefix = normalizePartNo(input.prefix);
  const arr = `{${ids.join(',')}}`;
  const set = input.mode === 'add'
    ? sql`(select coalesce(array_agg(distinct x order by x), '{}') from unnest(${part.modelIds} || ${arr}::int[]) x)`
    : sql`${arr}::int[]`;
  const rows = await query<{ id: number }>(
    ctx.tx,
    sql`update ${part} set ${raw('model_ids')} = ${set}, ${raw('updated_at')} = now(), ${raw('updated_by_id')} = ${ctx.access.userId}
         where lower(${part.brand}) = lower(${input.brand}) and ${part.partNo} like ${prefix + '%'} returning ${part.id} as "id"`,
  );
  await ctx.audit({ entityType: 'parts.part', entityId: 0, action: 'assign_models', dealershipId: null, branchId: null, changes: { brand: input.brand, prefix, modelIds: ids, mode: input.mode, parts: rows.length } });
  return { changed: rows.length };
}

/** The active vehicle models of a brand (all brands when none is given), for the Vehicle filter. */
export async function partVehicleModels(ctx: EntityCtx, brand?: string) {
  return ctx.tx.vehicleModel.findMany({
    where: { isActive: true, ...(brand ? { brand: { equals: brand, mode: 'insensitive' as const } } : {}) },
    select: { id: true, brand: true, name: true },
    orderBy: [{ brand: 'asc' }, { name: 'asc' }],
    take: 200,
  });
}

/**
 * The sale report: one line per part issued (a return is a negative line), with the RO / job card number, the
 * invoice, the price charged and the cost, for a period. Within the caller's stores.
 */
export async function saleReport(ctx: EntityCtx, f: z.output<typeof SaleReportQuery>) {
  const conds: SQL[] = [
    scopeWhere(ctx.access.scope(P.stockView), { dealership: inventoryTransaction.dealershipId, branch: inventoryTransaction.branchId }),
    sql`${inventoryTransaction.type} in ('issue', 'return')`,
  ];
  if (f.dealershipId) conds.push(eq(inventoryTransaction.dealershipId, f.dealershipId));
  if (f.branchId) conds.push(eq(inventoryTransaction.branchId, f.branchId));
  const day = sql`(${inventoryTransaction.occurredAt} at time zone 'Asia/Karachi')::date`;
  if (f.from) conds.push(sql`${day} >= ${f.from}::date`);
  if (f.to) conds.push(sql`${day} <= ${f.to}::date`);
  const qty = sql`(-${inventoryTransaction.quantity})`;
  const price = sql`coalesce(${inventoryTransaction.unitPrice}, ${part.sellingPrice})`;
  return query<{
    date: string; roNo: string | null; invoiceNo: string | null; partNo: string; partName: string; quantity: string;
    unitPrice: string; totalPrice: string; remarks: string | null; unitCost: string; totalCost: string; vehicle: string | null; store: string; issuedBy: string | null;
  }>(
    ctx.tx,
    sql`select to_char(${day}, 'DD-Mon-YYYY') as "date", ${inventoryTransaction.referenceNo} as "roNo", ${inventoryTransaction.invoiceNo} as "invoiceNo",
               ${part.partNo} as "partNo", ${part.description} as "partName", ${qty}::text as "quantity",
               ${price}::text as "unitPrice", round(${qty} * ${price}, 2)::text as "totalPrice",
               ${inventoryTransaction.remarks} as "remarks", ${inventoryTransaction.unitCost}::text as "unitCost",
               round(${qty} * ${inventoryTransaction.unitCost}, 2)::text as "totalCost",
               ${inventoryTransaction.notes} as "vehicle", ${branchTable.name} as "store", ${user.fullName} as "issuedBy"
          from ${inventoryTransaction}
          inner join ${part} on ${part.id} = ${inventoryTransaction.partId}
          inner join ${branchTable} on ${branchTable.id} = ${inventoryTransaction.branchId}
          left join ${user} on ${user.id} = ${inventoryTransaction.actorId}
         where ${and(...conds)!}
         order by ${inventoryTransaction.occurredAt} asc, ${inventoryTransaction.id} asc
         limit 20000`,
  );
}

/** The sales recorded before the system (the sale report sheet): a page of lines, with the totals of the whole search. */
export async function earlierSales(ctx: EntityCtx, f: z.output<typeof EarlierSalesQuery>) {
  const conds: SQL[] = [scopeWhere(ctx.access.scope(P.stockView), { dealership: legacySale.dealershipId })];
  if (f.dealershipId) conds.push(eq(legacySale.dealershipId, f.dealershipId));
  if (f.q) {
    const like = `%${f.q}%`;
    conds.push(sql`(${legacySale.invoiceNo} ilike ${like} or ${legacySale.roNo} ilike ${like} or ${legacySale.partNo} ilike ${like} or ${legacySale.partName} ilike ${like} or ${legacySale.remarks} ilike ${like})`);
  }
  const where = and(...conds)!;
  const items = await query<{ lineNo: number; roNo: string | null; invoiceNo: string | null; partNo: string; partName: string; quantity: string; unitPrice: string; totalPrice: string; remarks: string | null }>(
    ctx.tx,
    sql`select ${legacySale.lineNo} as "lineNo", ${legacySale.roNo} as "roNo", ${legacySale.invoiceNo} as "invoiceNo", ${legacySale.partNo} as "partNo",
               ${legacySale.partName} as "partName", ${legacySale.quantity}::text as "quantity", ${legacySale.unitPrice}::text as "unitPrice",
               ${legacySale.totalPrice}::text as "totalPrice", ${legacySale.remarks} as "remarks"
          from ${legacySale} where ${where} order by ${legacySale.lineNo} asc limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`,
  );
  const [t] = await query<{ total: number; invoices: number; totalAmount: string; totalQuantity: string }>(
    ctx.tx,
    sql`select count(*)::int as "total", count(distinct ${legacySale.invoiceNo})::int as "invoices",
               coalesce(sum(${legacySale.totalPrice}), 0)::text as "totalAmount", coalesce(sum(${legacySale.quantity}), 0)::text as "totalQuantity"
          from ${legacySale} where ${where}`,
  );
  return { items, page: f.page, pageSize: f.pageSize, total: t?.total ?? 0, invoices: t?.invoices ?? 0, totalAmount: t?.totalAmount ?? '0', totalQuantity: t?.totalQuantity ?? '0' };
}

/** Distinct categories of a brand's parts, for the filter lists. */
export async function partCategories(ctx: EntityCtx, brand?: string) {
  const rows = await query<{ category: string }>(
    ctx.tx,
    sql`select distinct ${part.category} as "category" from ${part}
         where ${part.category} is not null ${brand ? sql`and lower(${part.brand}) = lower(${brand})` : sql``} order by 1`,
  );
  return rows.map((r) => r.category);
}

