/**
 * The vehicle invoice received for a delivered car: the manufacturer's / head office's invoice for the car of a
 * sales order. The Sales Admin, Assistant Manager or Manager records its number and the day it arrived; the
 * order, the lead (so the salesperson sees it), the manager's list and the dashboards show it.
 */
import type { EntityCtx } from '../../../entity/types';
import { conflict, forbidden, validationError } from '../../../lib/errors';
import { pakistanToday } from '../../../lib/dates';
import type { z } from '../../../lib/zod';
import { normalizeCnic, normalizeMobile } from '../../master/normalize';
import { orders } from '../entities';
import { SalesPerm as P } from '../permissions';
import type { InvoiceDeliveredBody, VehicleInvoiceBody } from '../schemas';

const targetOf = (o: Record<string, unknown>) => ({ dealershipId: o.dealershipId as number, branchId: (o.branchId as number | null) ?? null });

/** Records (or corrects) the invoice received for the car on an order. */
export async function recordVehicleInvoice(ctx: EntityCtx, orderId: number, input: z.output<typeof VehicleInvoiceBody>) {
  const o = await orders.findVisible(ctx, orderId, { lock: true });
  if (!orders.canOnRow(ctx.access, o, P.ordersInvoice)) throw forbidden('Only the Sales Admin, Assistant Manager or Manager record the vehicle invoice');
  if (!o.vehicleId) throw conflict('There is no car on this order yet');
  if (!['approved', 'delivered'].includes(o.status as string)) throw conflict('The vehicle invoice is recorded for an approved or delivered order');
  const receivedOn = input.receivedOn ?? pakistanToday();
  if (input.invoiceDate && input.invoiceDate > pakistanToday()) throw validationError([{ in: 'body', path: 'invoiceDate', message: 'The invoice date cannot be in the future' }]);
  if (receivedOn > pakistanToday()) throw validationError([{ in: 'body', path: 'receivedOn', message: 'The day cannot be in the future' }]);
  // One invoice belongs to one car.
  const dup = await ctx.tx.salesOrder.findFirst({
    where: { dealershipId: o.dealershipId as number, invoiceNo: input.invoiceNo, id: { not: orderId }, status: { not: 'cancelled' } },
    select: { orderNo: true },
  });
  if (dup) throw conflict(`Invoice ${input.invoiceNo} is already recorded for order ${dup.orderNo}`);
  const notes = input.notes?.trim() || null;
  await ctx.tx.salesOrder.update({
    where: { id: orderId },
    data: { invoiceNo: input.invoiceNo, invoiceDate: input.invoiceDate ?? null, invoiceReceivedOn: receivedOn, invoiceNotes: notes, invoiceReceivedById: ctx.access.userId, updatedById: ctx.access.userId },
    select: { id: true },
  });
  await ctx.audit({
    entityType: 'sales.order',
    entityId: orderId,
    action: 'invoice.record',
    ...targetOf(o),
    changes: { invoiceNo: input.invoiceNo, invoiceDate: input.invoiceDate ?? null, receivedOn, notes, previousInvoiceNo: (o.invoiceNo as string | null) ?? null },
  });
  return orders.get(ctx, orderId);
}

/** The customer has come for the invoice: records that it was handed over, with the date and time (or undoes it). */
export async function setInvoiceDelivered(ctx: EntityCtx, orderId: number, input: z.output<typeof InvoiceDeliveredBody>) {
  const o = await orders.findVisible(ctx, orderId, { lock: true });
  if (!orders.canOnRow(ctx.access, o, P.ordersInvoice)) throw forbidden('Only the Sales Admin, Assistant Manager or Manager hand over the vehicle invoice');
  if (!o.invoiceNo) throw conflict('Record the vehicle invoice first');
  // The customer takes it himself, or someone else does: then who (name, contact, CNIC) is required.
  const other = input.delivered && input.takenBy === 'other';
  const name = input.receiverName?.trim() || null;
  const contact = input.receiverContact?.trim() || null;
  const cnic = input.receiverCnic ? normalizeCnic(input.receiverCnic) : null;
  if (other) {
    const bad = [
      !name && { in: 'body' as const, path: 'receiverName', message: "Enter the receiver's name" },
      (!contact || !normalizeMobile(contact)) && { in: 'body' as const, path: 'receiverContact', message: "Enter the receiver's contact number" },
      !cnic && { in: 'body' as const, path: 'receiverCnic', message: "Enter the receiver's CNIC (13 digits, e.g. 35202-1234567-1)" },
    ].filter((x) => !!x);
    if (bad.length) throw validationError(bad);
  }
  await ctx.tx.salesOrder.update({
    where: { id: orderId },
    data: {
      invoiceDeliveredAt: input.delivered ? new Date() : null,
      invoiceDeliveredById: input.delivered ? ctx.access.userId : null,
      invoiceTakenByName: other ? name : null,
      invoiceTakenByContact: other ? contact : null,
      invoiceTakenByCnic: other ? cnic : null,
      updatedById: ctx.access.userId,
    },
    select: { id: true },
  });
  await ctx.audit({ entityType: 'sales.order', entityId: orderId, action: input.delivered ? 'invoice.deliver' : 'invoice.undeliver', ...targetOf(o), changes: { invoiceNo: o.invoiceNo, ...(other ? { takenBy: name } : {}) } });
  return orders.get(ctx, orderId);
}

/** Removes a wrongly recorded invoice. */
export async function clearVehicleInvoice(ctx: EntityCtx, orderId: number) {
  const o = await orders.findVisible(ctx, orderId, { lock: true });
  if (!orders.canOnRow(ctx.access, o, P.ordersInvoice)) throw forbidden();
  if (!o.invoiceNo) throw conflict('No invoice is recorded for this order');
  await ctx.tx.salesOrder.update({
    where: { id: orderId },
    data: { invoiceNo: null, invoiceDeliveredAt: null, invoiceDeliveredById: null, invoiceTakenByName: null, invoiceTakenByContact: null, invoiceTakenByCnic: null, invoiceDate: null, invoiceReceivedOn: null, invoiceNotes: null, invoiceReceivedById: null, updatedById: ctx.access.userId },
    select: { id: true },
  });
  await ctx.audit({ entityType: 'sales.order', entityId: orderId, action: 'invoice.clear', ...targetOf(o), changes: { invoiceNo: o.invoiceNo } });
  return orders.get(ctx, orderId);
}
