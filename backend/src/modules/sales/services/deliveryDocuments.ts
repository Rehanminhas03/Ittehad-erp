/**
 * Saved delivery documents (Vehicle Delivery Acceptance Note, Delivery Note): the data typed for a car is kept, so the
 * document can be opened, corrected and printed again. Anyone who sees the dealership's orders can look at them; the
 * Sales Admin and the Delivery Team (and whoever may update orders) save and remove them.
 */
import type { EntityCtx } from '../../../entity/types';
import { forbidden, notFound } from '../../../lib/errors';
import type { z } from '../../../lib/zod';
import { SalesPerm as P } from '../permissions';
import type { DeliveryDocumentBody, DeliveryDocumentsQuery } from '../schemas';

const WRITERS = [P.ordersUpdate, P.deliveriesComplete, P.deliveriesSchedule];
const canWrite = (ctx: EntityCtx, dealershipId: number) => WRITERS.some((c) => ctx.access.canIn(c, { dealershipId }));
const canView = (ctx: EntityCtx, dealershipId: number) => ctx.access.canIn(P.ordersViewAll, { dealershipId });

type Row = { id: number; dealershipId: number; salesOrderId: number | null; kind: string; label: string; data: unknown; createdAt: Date; createdById: number | null; updatedAt: Date; updatedById: number | null };

async function shape(ctx: EntityCtx, rows: Row[]) {
  const userIds = [...new Set(rows.flatMap((r) => [r.createdById, r.updatedById]).filter((x): x is number => typeof x === 'number'))];
  const orderIds = [...new Set(rows.map((r) => r.salesOrderId).filter((x): x is number => typeof x === 'number'))];
  const [users, orders] = await Promise.all([
    userIds.length ? ctx.tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }) : [],
    orderIds.length ? ctx.tx.salesOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNo: true } }) : [],
  ]);
  const name = new Map(users.map((u) => [Number(u.id), u.fullName]));
  const no = new Map(orders.map((o) => [Number(o.id), o.orderNo]));
  return rows.map((r) => ({
    id: Number(r.id),
    kind: r.kind as 'acceptance' | 'note',
    dealershipId: Number(r.dealershipId),
    orderId: r.salesOrderId === null ? null : Number(r.salesOrderId),
    orderNo: r.salesOrderId === null ? null : (no.get(Number(r.salesOrderId)) ?? null),
    label: r.label,
    data: r.data as Record<string, string>,
    createdByName: r.createdById === null ? null : (name.get(Number(r.createdById)) ?? null),
    createdAt: r.createdAt,
    updatedByName: r.updatedById === null ? null : (name.get(Number(r.updatedById)) ?? null),
    updatedAt: r.updatedAt,
  }));
}

/** The saved documents the caller may see: of an order, of one kind, or found by their label. Newest first. */
export async function listDeliveryDocuments(ctx: EntityCtx, q: z.output<typeof DeliveryDocumentsQuery>) {
  const rows = (await ctx.tx.deliveryDocument.findMany({
    where: {
      ...(q.orderId ? { salesOrderId: q.orderId } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.q ? { label: { contains: q.q, mode: 'insensitive' as const } } : {}),
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: 300,
  })) as unknown as Row[];
  return shape(ctx, rows.filter((r) => canView(ctx, Number(r.dealershipId))));
}

export async function getDeliveryDocument(ctx: EntityCtx, id: number) {
  const r = (await ctx.tx.deliveryDocument.findUnique({ where: { id } })) as unknown as Row | null;
  if (!r || !canView(ctx, Number(r.dealershipId))) throw notFound('Document not found');
  return (await shape(ctx, [r]))[0]!;
}

/** Saves a new document. */
export async function saveDeliveryDocument(ctx: EntityCtx, input: z.output<typeof DeliveryDocumentBody>) {
  if (!canWrite(ctx, input.dealershipId)) throw forbidden('You cannot save delivery documents at this dealership');
  if (input.orderId) {
    const o = await ctx.tx.salesOrder.findUnique({ where: { id: input.orderId }, select: { dealershipId: true } });
    if (!o || Number(o.dealershipId) !== input.dealershipId) throw notFound('Order not found');
  }
  const r = (await ctx.tx.deliveryDocument.create({
    data: { dealershipId: input.dealershipId, salesOrderId: input.orderId ?? null, kind: input.kind, label: input.label, data: input.data, createdById: ctx.access.userId, updatedById: ctx.access.userId },
  })) as unknown as Row;
  await ctx.audit({ entityType: 'sales.delivery_document', entityId: Number(r.id), action: 'create', dealershipId: input.dealershipId, branchId: null, changes: { kind: input.kind, label: input.label } });
  return (await shape(ctx, [r]))[0]!;
}

/** Saves the corrected data of a saved document. */
export async function updateDeliveryDocument(ctx: EntityCtx, id: number, input: z.output<typeof DeliveryDocumentBody>) {
  const cur = (await ctx.tx.deliveryDocument.findUnique({ where: { id } })) as unknown as Row | null;
  if (!cur || !canView(ctx, Number(cur.dealershipId))) throw notFound('Document not found');
  if (!canWrite(ctx, Number(cur.dealershipId))) throw forbidden('You cannot change delivery documents at this dealership');
  const r = (await ctx.tx.deliveryDocument.update({ where: { id }, data: { label: input.label || cur.label, data: input.data, updatedAt: new Date(), updatedById: ctx.access.userId } })) as unknown as Row;
  await ctx.audit({ entityType: 'sales.delivery_document', entityId: id, action: 'update', dealershipId: Number(cur.dealershipId), branchId: null, changes: { kind: cur.kind, label: r.label } });
  return (await shape(ctx, [r]))[0]!;
}

export async function removeDeliveryDocument(ctx: EntityCtx, id: number) {
  const cur = (await ctx.tx.deliveryDocument.findUnique({ where: { id } })) as unknown as Row | null;
  if (!cur || !canView(ctx, Number(cur.dealershipId))) throw notFound('Document not found');
  if (!canWrite(ctx, Number(cur.dealershipId))) throw forbidden('You cannot remove delivery documents at this dealership');
  await ctx.tx.deliveryDocument.delete({ where: { id } });
  await ctx.audit({ entityType: 'sales.delivery_document', entityId: id, action: 'delete', dealershipId: Number(cur.dealershipId), branchId: null, changes: { kind: cur.kind, label: cur.label } });
  return { ok: true as const };
}
