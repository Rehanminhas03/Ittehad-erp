/**
 * PDI (pre-delivery inspection) of the car on a sales order. The Delivery Team records it when they
 * mark the car received: PDI done, and whether there is an issue (with a description). It can be
 * updated later (e.g. the issue is fixed). Everyone who sees the order (its salesperson, the Assistant
 * Manager, the Manager, the Sales Admin) sees it, and can comment on it, like the follow-up comments.
 */
import type { EntityCtx, Row } from '../../../entity/types';
import { conflict, forbidden } from '../../../lib/errors';
import type { z } from '../../../lib/zod';
import { orders } from '../entities';
import { SalesPerm as P } from '../permissions';
import type { PdiBody, PdiCommentBody } from '../schemas';

const targetOf = (o: Record<string, unknown>) => ({ dealershipId: o.dealershipId as number, branchId: (o.branchId as number | null) ?? null });

/** Saves the PDI on the order (the caller has checked the right to do so). */
export async function savePdi(ctx: EntityCtx, order: Row, input: z.output<typeof PdiBody>) {
  const notes = input.notes?.trim() || null;
  await ctx.tx.salesOrder.update({
    where: { id: order.id },
    data: { pdiDone: input.done, pdiIssue: input.issue, pdiNotes: notes, pdiRecordedAt: new Date(), pdiRecordedById: ctx.access.userId },
    select: { id: true },
  });
  await ctx.audit({
    entityType: 'sales.order',
    entityId: order.id,
    action: 'pdi.record',
    ...targetOf(order),
    changes: { done: input.done, issue: input.issue, notes },
  });
}

/** Delivery Team: record or correct the PDI once the car is at the dealership. */
export async function recordPdi(ctx: EntityCtx, orderId: number, input: z.output<typeof PdiBody>) {
  const o = await orders.findVisible(ctx, orderId, { lock: true });
  if (!orders.canOnRow(ctx.access, o, P.ordersAllocate)) throw forbidden('Only the Delivery Team records the PDI');
  if (!o.vehicleId) throw conflict('There is no car on this order yet');
  const car = await ctx.tx.vehicle.findFirst({ where: { id: o.vehicleId as number }, select: { status: true } });
  if (!car || !['received', 'ready_for_delivery'].includes(car.status)) throw conflict('Record the PDI once the car is received (or ready for delivery)');
  await savePdi(ctx, o, input);
  return getPdi(ctx, orderId);
}

/** The PDI and its comments, for everyone who can see the order. */
export async function getPdi(ctx: EntityCtx, orderId: number) {
  const o = await orders.findVisible(ctx, orderId);
  const full = await ctx.tx.salesOrder.findUnique({
    where: { id: orderId },
    select: { pdiDone: true, pdiIssue: true, pdiNotes: true, pdiRecordedAt: true, pdiRecordedById: true },
  });
  const comments = await ctx.tx.orderPdiComment.findMany({ where: { salesOrderId: orderId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 200 });
  const ids = [...new Set([full?.pdiRecordedById, ...comments.map((c) => c.createdById)].filter((x): x is number => typeof x === 'number'))];
  const users = ids.length ? await ctx.tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const name = new Map(users.map((u) => [u.id, u.fullName]));
  const car = o.vehicleId ? await ctx.tx.vehicle.findFirst({ where: { id: o.vehicleId as number }, select: { status: true } }) : null;
  return {
    recorded: !!full?.pdiRecordedAt,
    done: full?.pdiDone ?? false,
    issue: full?.pdiIssue ?? false,
    notes: full?.pdiNotes ?? null,
    recordedAt: full?.pdiRecordedAt ?? null,
    recordedByName: full?.pdiRecordedById ? (name.get(full.pdiRecordedById) ?? null) : null,
    // The car is at the dealership: the PDI is due (or can be corrected).
    carStatus: car?.status ?? null,
    comments: comments.map((c) => ({ id: c.id, body: c.body, createdById: c.createdById, createdByName: name.get(c.createdById) ?? null, createdAt: c.createdAt })),
  };
}

/** Anyone who sees the order (Manager, Assistant Manager, salesperson, Sales Admin, Delivery Team) comments on the PDI. */
export async function commentOnPdi(ctx: EntityCtx, orderId: number, input: z.output<typeof PdiCommentBody>) {
  const o = await orders.findVisible(ctx, orderId);
  await ctx.tx.orderPdiComment.create({
    data: { dealershipId: o.dealershipId as number, salesOrderId: orderId, body: input.body, createdById: ctx.access.userId },
    select: { id: true },
  });
  await ctx.audit({ entityType: 'sales.order', entityId: orderId, action: 'pdi.comment', ...targetOf(o), changes: { comment: input.body } });
  return getPdi(ctx, orderId);
}
