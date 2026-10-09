/**
 * Payments against a sales order, and the delivery clearance.
 *  - Payments: the booking amount (from the conversion, when the order is raised), part payments,
 *    and the final payment — entered by the Sales Admin. The order shows its total, what has been
 *    received and the balance.
 *  - Delivery clearance: once the car is at the dealership, the Delivery Team asks the Sales Admin
 *    to confirm that everything is clear (all payments received). The car is handed over only after
 *    the Admin approves (Hyundai, Jetour and CSM alike).
 */
import type { EntityCtx } from '../../../entity/types';
import { conflict, forbidden, notFound, validationError } from '../../../lib/errors';
import { addMoney, cmpMoney, subMoney } from '../../../lib/money';
import type { z } from '../../../lib/zod';
import { orders } from '../entities';
import { SalesPerm as P } from '../permissions';
import type { ClearanceDecisionBody, ClearanceRequestBody, OrderPaymentCreate } from '../schemas';
import { pakistanToday } from '../../../lib/dates';

const targetOf = (o: Record<string, unknown>) => ({ dealershipId: o.dealershipId as number, branchId: (o.branchId as number | null) ?? null });
const money = (v: unknown) => (v == null ? '0.00' : String(v));

/** The order's payments (oldest first) with its total, what has been received and the balance. */
export async function orderPayments(ctx: EntityCtx, orderId: number) {
  const o = await orders.findVisible(ctx, orderId);
  const rows = await ctx.tx.orderPayment.findMany({ where: { salesOrderId: orderId }, orderBy: [{ receivedOn: 'asc' }, { id: 'asc' }] });
  const users = await ctx.tx.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById).filter((x): x is number => x != null))] } }, select: { id: true, fullName: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.fullName]));
  const received = rows.reduce((sum, r) => addMoney(sum, money(r.amount)), '0.00');
  const total = money(o.totalAmount);
  return {
    total,
    received,
    balance: subMoney(total, received),
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind as 'booking',
      amount: money(r.amount),
      instrument: r.instrument as 'pay_order',
      reference: r.reference,
      bank: r.bank,
      // Dates come back as 'YYYY-MM-DD' text (see db/resultExtension).
      receivedOn: String(r.receivedOn).slice(0, 10),
      note: r.note,
      createdAt: r.createdAt,
      createdByName: r.createdById ? (nameOf.get(r.createdById) ?? null) : null,
    })),
  };
}

/** What has been received against an order (for the clearance check). */
async function receivedOn(ctx: EntityCtx, orderId: number) {
  const rows = await ctx.tx.orderPayment.findMany({ where: { salesOrderId: orderId }, select: { amount: true } });
  return rows.reduce((sum, r) => addMoney(sum, money(r.amount)), '0.00');
}

export async function addOrderPayment(ctx: EntityCtx, orderId: number, input: z.output<typeof OrderPaymentCreate>) {
  const o = await orders.findVisible(ctx, orderId, { lock: true });
  if (!ctx.access.canIn(P.paymentsManage, targetOf(o))) throw forbidden('Only the Sales Admin records payments');
  if (o.status === 'cancelled') throw conflict('This order is cancelled');
  if (input.receivedOn > pakistanToday()) throw validationError([{ in: 'body', path: 'receivedOn', message: 'The payment date cannot be in the future' }]);
  const after = addMoney(await receivedOn(ctx, orderId), input.amount);
  if (cmpMoney(after, money(o.totalAmount)) > 0) {
    throw validationError([{ in: 'body', path: 'amount', message: `More than the order total (${money(o.totalAmount)}): check the amount` }]);
  }
  const row = await ctx.tx.orderPayment.create({
    data: {
      dealershipId: o.dealershipId as number,
      salesOrderId: orderId,
      kind: input.kind,
      amount: input.amount,
      instrument: input.instrument,
      reference: input.reference ?? null,
      bank: input.bank ?? null,
      receivedOn: new Date(`${input.receivedOn}T00:00:00Z`),
      note: input.note ?? null,
      createdById: ctx.access.userId,
    },
    select: { id: true },
  });
  await ctx.audit({
    entityType: 'sales.order',
    entityId: orderId,
    action: 'payment.add',
    ...targetOf(o),
    changes: { paymentId: row.id, kind: input.kind, amount: input.amount, instrument: input.instrument, reference: input.reference ?? null },
  });
  return orderPayments(ctx, orderId);
}

export async function removeOrderPayment(ctx: EntityCtx, orderId: number, paymentId: number) {
  const o = await orders.findVisible(ctx, orderId, { lock: true });
  if (!ctx.access.canIn(P.paymentsManage, targetOf(o))) throw forbidden('Only the Sales Admin records payments');
  if (o.clearanceStatus === 'approved') throw conflict('The car is already cleared for delivery: payments can no longer be removed');
  const p = await ctx.tx.orderPayment.findFirst({ where: { id: paymentId, salesOrderId: orderId } });
  if (!p) throw notFound('Payment');
  await ctx.tx.orderPayment.delete({ where: { id: paymentId } });
  await ctx.audit({
    entityType: 'sales.order',
    entityId: orderId,
    action: 'payment.remove',
    ...targetOf(o),
    changes: { paymentId, kind: p.kind, amount: money(p.amount) },
  });
  return orderPayments(ctx, orderId);
}

/** The booking amount taken at conversion becomes the order's first payment when the order is raised. */
export async function recordBookingPayment(
  ctx: EntityCtx,
  order: { id: number; dealershipId: number },
  booking: { amount: string; instrument: string | null; reference: string | null; bank: string | null; full?: boolean },
) {
  if (cmpMoney(booking.amount, '0') <= 0) return;
  await ctx.tx.orderPayment.create({
    data: {
      dealershipId: order.dealershipId,
      salesOrderId: order.id,
      // Paid in full at conversion: the final payment; otherwise the booking amount.
      kind: booking.full ? 'final' : 'booking',
      amount: booking.amount,
      instrument: booking.instrument ?? 'pay_order',
      reference: booking.reference,
      bank: booking.bank,
      receivedOn: new Date(`${pakistanToday()}T00:00:00Z`),
      note: booking.full ? 'Full payment (at conversion)' : 'Booking amount (at conversion)',
      createdById: ctx.access.userId,
    },
  });
}

// ---- Delivery clearance ---------------------------------------------------------------------
/** Delivery Team: ask the Sales Admin to confirm everything is clear for this car (payments). */
export async function requestClearance(ctx: EntityCtx, orderId: number, input: z.output<typeof ClearanceRequestBody>) {
  const o = await orders.findVisible(ctx, orderId, { lock: true });
  if (!ctx.access.canIn(P.deliveriesComplete, targetOf(o)) && !ctx.access.canIn(P.deliveriesSchedule, targetOf(o))) throw forbidden();
  if (o.status !== 'approved') throw conflict('The Manager has to approve the order first');
  if (o.clearanceStatus === 'requested') throw conflict('Clearance is already requested; the Sales Admin will check it');
  if (o.clearanceStatus === 'approved') throw conflict('This car is already cleared for delivery');
  const car = o.vehicleId ? await ctx.tx.vehicle.findFirst({ where: { id: o.vehicleId as number }, select: { status: true } }) : null;
  if (!car || !['received', 'ready_for_delivery'].includes(car.status)) throw conflict('The car has to be received at the dealership first');
  await ctx.tx.salesOrder.update({
    where: { id: orderId },
    data: {
      clearanceStatus: 'requested',
      clearanceRequestedAt: new Date(),
      clearanceRequestedById: ctx.access.userId,
      clearanceRequestNote: input.note ?? null,
      clearanceDecidedAt: null,
      clearanceDecidedById: null,
      clearanceDecisionNote: null,
    },
  });
  await ctx.audit({ entityType: 'sales.order', entityId: orderId, action: 'clearance.request', ...targetOf(o), changes: { note: input.note ?? null } });
  return orders.get(ctx, orderId);
}

/** Sales Admin: approve (everything is clear: the full amount received) or reject with a reason. */
export async function decideClearance(ctx: EntityCtx, orderId: number, input: z.output<typeof ClearanceDecisionBody>) {
  const o = await orders.findVisible(ctx, orderId, { lock: true });
  if (!ctx.access.canIn(P.ordersClear, targetOf(o))) throw forbidden('Only the Sales Admin clears cars for delivery');
  if (o.clearanceStatus !== 'requested') throw conflict('There is no clearance request to decide');
  if (input.approve) {
    const balance = subMoney(money(o.totalAmount), await receivedOn(ctx, orderId));
    if (cmpMoney(balance, '0') > 0) throw conflict(`Payment is not clear: balance Rs ${balance} is still due. Record the payments first, or reject the request.`);
  } else if (!input.note) {
    throw validationError([{ in: 'body', path: 'note', message: 'Say what is not clear (e.g. balance payment pending)' }]);
  }
  await ctx.tx.salesOrder.update({
    where: { id: orderId },
    data: {
      clearanceStatus: input.approve ? 'approved' : 'rejected',
      clearanceDecidedAt: new Date(),
      clearanceDecidedById: ctx.access.userId,
      clearanceDecisionNote: input.note ?? null,
    },
  });
  await ctx.audit({
    entityType: 'sales.order',
    entityId: orderId,
    action: input.approve ? 'clearance.approve' : 'clearance.reject',
    ...targetOf(o),
    changes: { note: input.note ?? null },
  });
  return orders.get(ctx, orderId);
}

/** Handing over needs the Sales Admin's clearance (all payments clear). */
export function assertCleared(o: Record<string, unknown>) {
  if (o.clearanceStatus !== 'approved') {
    throw conflict(
      o.clearanceStatus === 'requested'
        ? 'Waiting for the Sales Admin to clear this car for delivery (payments)'
        : 'Request delivery clearance from the Sales Admin first: the car is handed over only once all payments are clear',
    );
  }
}
