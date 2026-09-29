import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { INVOICE_DUE_DAYS, TAX_RATES } from '../../config/accounting';
import { LineService } from '../../entity/lines';
import type { EntityCtx, Row } from '../../entity/types';
import { conflict, forbidden, validationError } from '../../lib/errors';
import { addMoney, cmpMoney, lineAmount, subMoney, taxOf, toPaisa } from '../../lib/money';
import type { z } from '../../lib/zod';
import { DocType, nextDocumentNumber } from '../core/documents';
import { branch, dealership } from '../core/models';
import { customer, vehicle, vehicleModel } from '../master/models';
import { supplier } from '../parts/models';
import { salesOrder } from '../sales/models';
import { jobCard, jobCardLine, visit } from '../service/models';
import { addDays, invoices, journals, payments, refreshInvoiceStatus } from './entities';
import { post, reverse } from './ledger';
import { account, invoice, invoiceLine, journalLine, payment, paymentAllocation } from './models';
import { AccountsPerm as P } from './permissions';
import {
  InvoiceLineCreate,
  InvoiceLineSchema,
  InvoiceLineUpdate,
  type InvoiceFromSource,
  type ManualJournalCreate,
  type PaymentCreate,
  type ReverseBody,
} from './schemas';

const today = () => new Date().toISOString().slice(0, 10);
type LineKind = keyof typeof TAX_RATES;

/** Amount, tax rate (from config, by line kind) and tax of an invoice line. */
export function priceLine(kind: LineKind, quantity: string, unitPrice: string) {
  const amount = lineAmount(unitPrice, quantity);
  const taxRate = TAX_RATES[kind];
  return { amount, taxRate, taxAmount: taxOf(amount, taxRate) };
}

async function recomputeInvoiceTotals(ctx: EntityCtx, inv: Row) {
  await ctx.tx.execute(sql`
    update ${invoice} set
      subtotal = t.subtotal, tax_amount = t.tax, total_amount = t.subtotal + t.tax
    from (select coalesce(sum(amount), 0) as subtotal, coalesce(sum(tax_amount), 0) as tax
          from ${invoiceLine} where invoice_id = ${inv.id}) t
    where ${invoice.id} = ${inv.id}`);
}

async function assertBranchOf(ctx: EntityCtx, branchId: number | null | undefined, dealershipId: number) {
  if (!branchId) return;
  const [b] = await ctx.tx.select({ dealershipId: branch.dealershipId }).from(branch).where(eq(branch.id, branchId));
  if (!b || b.dealershipId !== dealershipId) throw validationError([{ in: 'body', path: 'branchId', message: 'Choose a branch of this dealership' }]);
}

// =============================================================================
// Invoice lines (editable while draft: e.g. add registration or accessories)
// =============================================================================
export const invoiceLines = new LineService({
  parent: invoices,
  table: invoiceLine,
  parentKey: 'invoiceId',
  names: { singular: 'InvoiceLine', plural: 'InvoiceLines' },
  schemas: { read: InvoiceLineSchema, create: InvoiceLineCreate, update: InvoiceLineUpdate },
  editPermission: P.invoicesCreate,
  maxLines: 200,
  sortKey: 'createdAt',
  locked: (p) => (p.status !== 'draft' ? 'Only draft invoices can be changed' : null),
  prepare: (_ctx, _parent, data) => ({ ...data, ...priceLine(data.kind as LineKind, String(data.quantity), String(data.unitPrice)) }),
  afterChange: recomputeInvoiceTotals,
});

// =============================================================================
// Invoice from a business document
// =============================================================================
interface Draft {
  dealershipId: number;
  branchId: number | null;
  customerId: number;
  kind: 'vehicle_sale' | 'service';
  sourceNo: string;
  lines: { kind: LineKind; description: string; partNo?: string | null; quantity: string; unitPrice: string }[];
}

async function fromSalesOrder(ctx: EntityCtx, id: number): Promise<Draft> {
  const [o] = await ctx.tx.select().from(salesOrder).where(eq(salesOrder.id, id));
  if (!o) throw validationError([{ in: 'body', path: 'sourceId', message: 'Sales order not found' }]);
  if (!['approved', 'delivered'].includes(o.status)) throw conflict('Only approved or delivered sales orders can be invoiced');
  const [m] = await ctx.tx.select({ brand: vehicleModel.brand, name: vehicleModel.name }).from(vehicleModel).where(eq(vehicleModel.id, o.modelId));
  const [v] = o.vehicleId ? await ctx.tx.select({ vin: vehicle.vin }).from(vehicle).where(eq(vehicle.id, o.vehicleId)) : [];
  const description = [`${m?.brand ?? ''} ${m?.name ?? ''}`.trim(), o.variant, o.color, v?.vin ? `VIN ${v.vin}` : null].filter(Boolean).join(' · ');
  return {
    dealershipId: o.dealershipId,
    branchId: o.branchId,
    customerId: o.customerId,
    kind: 'vehicle_sale',
    sourceNo: o.orderNo,
    lines: [{ kind: 'vehicle', description, quantity: '1', unitPrice: o.totalAmount }],
  };
}

async function fromJobCard(ctx: EntityCtx, id: number): Promise<Draft> {
  const [j] = await ctx.tx.select().from(jobCard).where(eq(jobCard.id, id));
  if (!j) throw validationError([{ in: 'body', path: 'sourceId', message: 'Job card not found' }]);
  if (j.status !== 'completed') throw conflict('Only completed job cards can be invoiced');
  const [vis] = await ctx.tx.select({ customerId: visit.customerId }).from(visit).where(eq(visit.id, j.visitId));
  const lines = await ctx.tx
    .select()
    .from(jobCardLine)
    .where(and(eq(jobCardLine.jobCardId, id), eq(jobCardLine.billable, true)))
    .orderBy(asc(jobCardLine.createdAt), asc(jobCardLine.id));
  if (!lines.length) throw conflict('Nothing billable on this job card (free or warranty work only)');
  return {
    dealershipId: j.dealershipId,
    branchId: j.branchId,
    customerId: vis!.customerId,
    kind: 'service',
    sourceNo: j.jobCardNo,
    lines: lines.map((l) => ({ kind: l.kind, description: l.description, partNo: l.partNo, quantity: l.quantity, unitPrice: l.unitPrice })),
  };
}

export async function createInvoiceFromSource(ctx: EntityCtx, input: z.output<typeof InvoiceFromSource>) {
  // Authorised by the invoicing right in the source's dealership (accountants need not see sales/workshop).
  const draft = input.sourceType === 'sales_order' ? await fromSalesOrder(ctx, input.sourceId) : await fromJobCard(ctx, input.sourceId);
  if (!ctx.access.canIn(P.invoicesCreate, { dealershipId: draft.dealershipId })) throw forbidden();
  const [live] = await ctx.tx
    .select({ invoiceNo: invoice.invoiceNo })
    .from(invoice)
    .where(and(eq(invoice.sourceType, input.sourceType), eq(invoice.sourceId, input.sourceId), sql`${invoice.status} not in ('void', 'cancelled')`));
  if (live) throw conflict(`Already invoiced on ${live.invoiceNo}`);

  const [d] = await ctx.tx
    .select({ legalEntityId: dealership.legalEntityId, accountingEntityId: dealership.accountingEntityId })
    .from(dealership)
    .where(eq(dealership.id, draft.dealershipId));
  const date = today();
  const [inv] = await ctx.tx
    .insert(invoice)
    .values({
      dealershipId: draft.dealershipId,
      branchId: draft.branchId,
      legalEntityId: d?.legalEntityId ?? null,
      accountingEntityId: d?.accountingEntityId ?? null,
      invoiceNo: await nextDocumentNumber(ctx.tx, draft.dealershipId, DocType.invoice),
      kind: draft.kind,
      customerId: draft.customerId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceNo: draft.sourceNo,
      invoiceDate: date,
      dueDate: addDays(date, INVOICE_DUE_DAYS),
      subtotal: '0',
      taxAmount: '0',
      totalAmount: '0',
      notes: input.notes ?? null,
      createdById: ctx.access.userId,
      updatedById: ctx.access.userId,
    })
    .returning();
  await ctx.tx.insert(invoiceLine).values(
    draft.lines.map((l) => ({
      dealershipId: draft.dealershipId,
      invoiceId: inv!.id,
      kind: l.kind,
      description: l.description,
      partNo: l.partNo ?? null,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      ...priceLine(l.kind, l.quantity, l.unitPrice),
    })),
  );
  await recomputeInvoiceTotals(ctx, inv as unknown as Row);
  await ctx.audit({ entityType: 'accounts.invoice', entityId: inv!.id, action: 'create', dealershipId: draft.dealershipId, branchId: draft.branchId, changes: input });
  return invoices.get(ctx, inv!.id);
}

// =============================================================================
// Payments
// =============================================================================
const allocationColumns = {
  id: paymentAllocation.id,
  paymentId: paymentAllocation.paymentId,
  paymentNo: payment.paymentNo,
  paymentDate: payment.paymentDate,
  paymentStatus: payment.status,
  invoiceId: paymentAllocation.invoiceId,
  invoiceNo: invoice.invoiceNo,
  amount: paymentAllocation.amount,
};

function allocations(ctx: EntityCtx, where: ReturnType<typeof eq>) {
  return ctx.tx
    .select(allocationColumns)
    .from(paymentAllocation)
    .innerJoin(payment, eq(payment.id, paymentAllocation.paymentId))
    .innerJoin(invoice, eq(invoice.id, paymentAllocation.invoiceId))
    .where(where)
    .orderBy(asc(paymentAllocation.id))
    .limit(100);
}

export async function invoiceAllocations(ctx: EntityCtx, invoiceId: number) {
  await invoices.findVisible(ctx, invoiceId);
  return allocations(ctx, eq(paymentAllocation.invoiceId, invoiceId));
}

export async function paymentAllocations(ctx: EntityCtx, paymentId: number) {
  await payments.findVisible(ctx, paymentId);
  return allocations(ctx, eq(paymentAllocation.paymentId, paymentId));
}

/**
 * Receipt: Dr cash/bank, Cr receivables (customer), settling the listed invoices.
 * Disbursement: Dr payables (supplier), Cr cash/bank.
 */
export async function createPayment(ctx: EntityCtx, input: z.output<typeof PaymentCreate>) {
  const dealershipId = input.dealershipId;
  if (!ctx.access.canIn(P.paymentsCreate, { dealershipId })) throw forbidden('You cannot record payments in this dealership');
  await assertBranchOf(ctx, input.branchId, dealershipId);
  const receipt = input.direction === 'receipt';
  const paymentDate = input.paymentDate ?? today();
  if (paymentDate > today()) throw validationError([{ in: 'body', path: 'paymentDate', message: 'Cannot be in the future' }]);

  if (receipt) {
    if (!input.customerId || input.supplierId) throw validationError([{ in: 'body', path: 'customerId', message: 'A receipt is from a customer' }]);
    const [c] = await ctx.tx.select({ dealershipId: customer.dealershipId }).from(customer).where(eq(customer.id, input.customerId));
    if (!c || c.dealershipId !== dealershipId) throw validationError([{ in: 'body', path: 'customerId', message: 'Choose a customer of this dealership' }]);
  } else {
    if (!input.supplierId || input.customerId) throw validationError([{ in: 'body', path: 'supplierId', message: 'A disbursement is to a supplier' }]);
    if (input.allocations.length) throw validationError([{ in: 'body', path: 'allocations', message: 'Supplier payments are not allocated to invoices' }]);
    const [s] = await ctx.tx.select({ dealershipId: supplier.dealershipId }).from(supplier).where(eq(supplier.id, input.supplierId));
    if (!s || s.dealershipId !== dealershipId) throw validationError([{ in: 'body', path: 'supplierId', message: 'Choose a supplier of this dealership' }]);
  }

  // Allocations: open invoices of this customer, never more than is outstanding or received.
  const ids = input.allocations.map((a) => a.invoiceId);
  if (new Set(ids).size !== ids.length) throw validationError([{ in: 'body', path: 'allocations', message: 'Each invoice once' }]);
  const open = ids.length ? await ctx.tx.select().from(invoice).where(inArray(invoice.id, ids)).orderBy(asc(invoice.id)).for('update') : [];
  const byId = new Map(open.map((i) => [i.id, i]));
  for (const [i, a] of input.allocations.entries()) {
    const inv = byId.get(a.invoiceId);
    const path = `allocations.${i}`;
    if (!inv || inv.dealershipId !== dealershipId || inv.customerId !== input.customerId) {
      throw validationError([{ in: 'body', path: `${path}.invoiceId`, message: "Not one of this customer's invoices" }]);
    }
    if (!['issued', 'partially_paid'].includes(inv.status)) throw validationError([{ in: 'body', path: `${path}.invoiceId`, message: `Invoice ${inv.invoiceNo} is ${inv.status}` }]);
    const outstanding = subMoney(inv.totalAmount, inv.amountPaid);
    if (cmpMoney(a.amount, outstanding) > 0) throw validationError([{ in: 'body', path: `${path}.amount`, message: `Only ${outstanding} is outstanding on ${inv.invoiceNo}` }]);
  }
  if (input.allocations.length && cmpMoney(addMoney(...input.allocations.map((a) => a.amount)), input.amount) > 0) {
    throw validationError([{ in: 'body', path: 'allocations', message: 'Allocations exceed the amount received' }]);
  }

  const paymentNo = await nextDocumentNumber(ctx.tx, dealershipId, receipt ? DocType.receipt : DocType.disbursement);
  const [pay] = await ctx.tx
    .insert(payment)
    .values({
      dealershipId,
      branchId: input.branchId ?? null,
      paymentNo,
      direction: input.direction,
      customerId: input.customerId ?? null,
      supplierId: input.supplierId ?? null,
      method: input.method,
      reference: input.reference ?? null,
      paymentDate,
      amount: input.amount,
      notes: input.notes ?? null,
      createdById: ctx.access.userId,
      updatedById: ctx.access.userId,
    })
    .returning();
  const money = input.method === 'cash' ? 'cash' : 'bank';
  const entry = await post(ctx, {
    dealershipId,
    branchId: input.branchId ?? null,
    entryDate: paymentDate,
    source: 'payment',
    sourceType: 'payment',
    sourceId: pay!.id,
    memo: `${receipt ? 'Receipt' : 'Payment'} ${paymentNo}${input.reference ? ` (${input.reference})` : ''}`,
    lines: receipt
      ? [
          { role: money, debit: input.amount },
          { role: 'receivables', credit: input.amount, customerId: input.customerId },
        ]
      : [
          { role: 'payables', debit: input.amount, supplierId: input.supplierId },
          { role: money, credit: input.amount },
        ],
  });
  await ctx.tx.update(payment).set({ journalEntryId: entry.id }).where(eq(payment.id, pay!.id));

  for (const a of input.allocations) {
    await ctx.tx.insert(paymentAllocation).values({ dealershipId, paymentId: pay!.id, invoiceId: a.invoiceId, amount: a.amount });
    await ctx.tx.update(invoice).set({ amountPaid: sql`${invoice.amountPaid} + ${a.amount}::numeric` }).where(eq(invoice.id, a.invoiceId));
    await refreshInvoiceStatus(ctx, a.invoiceId, `Payment ${paymentNo}`);
  }
  await ctx.audit({ entityType: 'accounts.payment', entityId: pay!.id, action: 'create', dealershipId, branchId: input.branchId ?? null, changes: input });
  return payments.get(ctx, pay!.id);
}

/**
 * Applies the unallocated part of an earlier receipt (e.g. a booking deposit held as customer
 * credit) to one of the customer's open invoices. The ledger is unchanged: the receipt already
 * credited the customer's receivable; this only matches it to the invoice.
 */
export async function allocatePayment(ctx: EntityCtx, paymentId: number, input: { invoiceId: number; amount: string }) {
  const pay = await payments.findVisible(ctx, paymentId, { lock: true });
  if (!ctx.access.canIn(P.paymentsCreate, { dealershipId: pay.dealershipId as number })) throw forbidden();
  if (pay.status !== 'posted' || pay.direction !== 'receipt') throw conflict('Only posted customer receipts can be applied to invoices');

  const [{ used } = { used: '0' }] = await ctx.tx
    .select({ used: sql<string>`coalesce(sum(${paymentAllocation.amount}), 0)::text` })
    .from(paymentAllocation)
    .where(eq(paymentAllocation.paymentId, paymentId));
  const unallocated = subMoney(pay.amount as string, used);
  if (cmpMoney(input.amount, unallocated) > 0) {
    throw validationError([{ in: 'body', path: 'amount', message: `Only ${unallocated} of this receipt is unallocated` }]);
  }
  const [inv] = await ctx.tx.select().from(invoice).where(eq(invoice.id, input.invoiceId)).for('update');
  if (!inv || inv.dealershipId !== pay.dealershipId || inv.customerId !== pay.customerId) {
    throw validationError([{ in: 'body', path: 'invoiceId', message: "Not one of this customer's invoices" }]);
  }
  if (!['issued', 'partially_paid'].includes(inv.status)) throw validationError([{ in: 'body', path: 'invoiceId', message: `Invoice ${inv.invoiceNo} is ${inv.status}` }]);
  const outstanding = subMoney(inv.totalAmount, inv.amountPaid);
  if (cmpMoney(input.amount, outstanding) > 0) throw validationError([{ in: 'body', path: 'amount', message: `Only ${outstanding} is outstanding on ${inv.invoiceNo}` }]);

  await ctx.tx
    .insert(paymentAllocation)
    .values({ dealershipId: inv.dealershipId, paymentId, invoiceId: inv.id, amount: input.amount })
    .onConflictDoUpdate({ target: [paymentAllocation.paymentId, paymentAllocation.invoiceId], set: { amount: sql`${paymentAllocation.amount} + ${input.amount}::numeric` } });
  await ctx.tx.update(invoice).set({ amountPaid: sql`${invoice.amountPaid} + ${input.amount}::numeric` }).where(eq(invoice.id, inv.id));
  await refreshInvoiceStatus(ctx, inv.id, `Credit from ${pay.paymentNo as string}`);
  await ctx.audit({ entityType: 'accounts.payment', entityId: paymentId, action: 'allocate', dealershipId: inv.dealershipId, branchId: null, changes: input });
  return allocations(ctx, eq(paymentAllocation.paymentId, paymentId));
}

// =============================================================================
// Journal: lines, manual entries and their reversal
// =============================================================================
export async function journalLines(ctx: EntityCtx, entryId: number) {
  await journals.findVisible(ctx, entryId);
  return ctx.tx
    .select({
      id: journalLine.id,
      accountId: journalLine.accountId,
      accountCode: account.code,
      accountName: account.name,
      debit: journalLine.debit,
      credit: journalLine.credit,
      customerId: journalLine.customerId,
      customerName: customer.fullName,
      supplierId: journalLine.supplierId,
      supplierName: supplier.name,
      description: journalLine.description,
    })
    .from(journalLine)
    .innerJoin(account, eq(account.id, journalLine.accountId))
    .leftJoin(customer, eq(customer.id, journalLine.customerId))
    .leftJoin(supplier, eq(supplier.id, journalLine.supplierId))
    .where(eq(journalLine.journalEntryId, entryId))
    .orderBy(asc(journalLine.id))
    .limit(100);
}

export async function postManualJournal(ctx: EntityCtx, input: z.output<typeof ManualJournalCreate>) {
  if (!ctx.access.canIn(P.journalsPost, { dealershipId: input.dealershipId })) throw forbidden('You cannot post journals in this dealership');
  await assertBranchOf(ctx, input.branchId, input.dealershipId);
  const entryDate = input.entryDate ?? today();
  if (entryDate > today()) throw validationError([{ in: 'body', path: 'entryDate', message: 'Cannot be in the future' }]);
  for (const [i, l] of input.lines.entries()) {
    const d = toPaisa(l.debit ?? '0');
    const c = toPaisa(l.credit ?? '0');
    if ((d > 0n) === (c > 0n) || d < 0n || c < 0n) {
      throw validationError([{ in: 'body', path: `lines.${i}`, message: 'Enter either a debit or a credit' }]);
    }
    if (l.customerId) {
      const [cu] = await ctx.tx.select({ dealershipId: customer.dealershipId }).from(customer).where(eq(customer.id, l.customerId));
      if (!cu || cu.dealershipId !== input.dealershipId) throw validationError([{ in: 'body', path: `lines.${i}.customerId`, message: 'Choose a customer of this dealership' }]);
    }
    if (l.supplierId) {
      const [s] = await ctx.tx.select({ dealershipId: supplier.dealershipId }).from(supplier).where(eq(supplier.id, l.supplierId));
      if (!s || s.dealershipId !== input.dealershipId) throw validationError([{ in: 'body', path: `lines.${i}.supplierId`, message: 'Choose a supplier of this dealership' }]);
    }
  }
  const entry = await post(ctx, {
    dealershipId: input.dealershipId,
    branchId: input.branchId ?? null,
    entryDate,
    source: 'manual',
    memo: input.memo,
    lines: input.lines,
  });
  await ctx.audit({ entityType: 'accounts.journal_entry', entityId: entry.id, action: 'create', dealershipId: input.dealershipId, branchId: input.branchId ?? null, changes: input });
  return journals.get(ctx, entry.id);
}

/** Manual entries are corrected by reversal; automatic ones through their document (void the invoice/payment). */
export async function reverseJournal(ctx: EntityCtx, entryId: number, input: z.output<typeof ReverseBody>) {
  // No row lock (the journal grants no UPDATE); a unique index allows one reversal per entry.
  const entry = await journals.findVisible(ctx, entryId);
  if (!ctx.access.canIn(P.journalsPost, { dealershipId: entry.dealershipId as number })) throw forbidden();
  if (entry.source !== 'manual') throw conflict('Automatic entries are corrected through their document (void the invoice or payment)');
  const reversal = await reverse(ctx, entryId, input.memo);
  await ctx.audit({ entityType: 'accounts.journal_entry', entityId: entryId, action: 'reverse', dealershipId: entry.dealershipId as number, branchId: null, changes: { reversalId: reversal.id, memo: input.memo } });
  return journals.get(ctx, reversal.id);
}
