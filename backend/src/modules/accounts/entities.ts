import { sql } from '../../db/sql';
import { INVOICE_DUE_DAYS, REVENUE_ROLE, type AccountRole } from '../../config/accounting';
import { EntityService } from '../../entity/entityService';
import { type NameSource, withNames } from '../../entity/names';
import type { EntityConfig, EntityCtx, Row } from '../../entity/types';
import { conflict } from '../../lib/errors';
import { fromPaisa, toPaisa } from '../../lib/money';
import { BoolQuery, IdQuery, z } from '../../lib/zod';
import { CUSTOMER_NAME, USER_NAME } from '../master/nameSources';
import { SUPPLIER_NAME } from '../parts/entities';
import { ensureChart, post, reverse } from './ledger';
import { account, invoice, journalEntry, payment } from './models';
import { AccountsPerm as P } from './permissions';
import { AccountCreate, AccountSchema, AccountUpdate, InvoiceSchema, InvoiceUpdate, JournalEntrySchema, PaymentSchema } from './schemas';

const statusFilter = (states: readonly string[]) => ({ key: 'status', schema: z.enum(states as [string, ...string[]]) });
const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (isoDate: string, days: number) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export const ACCOUNT_LABEL: NameSource = { table: account, id: account.id, label: sql`${account.code} || ' ' || ${account.name}` };
export const INVOICE_NO: NameSource = { table: invoice, id: invoice.id, label: invoice.invoiceNo };

// =============================================================================
// Chart of accounts
// =============================================================================
export const accountEntity: EntityConfig = {
  entityType: 'accounts.account',
  module: 'accounts',
  path: 'chart',
  names: { singular: 'Account', plural: 'Accounts' },
  table: account,
  schemas: { read: AccountSchema, create: AccountCreate, update: AccountUpdate },
  permissions: { view: P.chartView, create: P.chartManage, update: P.chartManage },
  tenant: { dealershipKey: 'dealershipId' },
  search: ['code', 'name'],
  filters: {
    dealershipId: { key: 'dealershipId', schema: IdQuery },
    type: { key: 'type', schema: z.enum(['asset', 'liability', 'equity', 'income', 'expense']) },
    isActive: { key: 'isActive', schema: BoolQuery },
  },
  sort: { default: 'code', keys: ['code', 'name', 'type', 'createdAt'] },
  hooks: {
    // The standard accounts come first, so a custom account never takes a template code.
    beforeCreate: async (ctx, data) => {
      await ensureChart(ctx, data.dealershipId as number);
      return data;
    },
    beforeUpdate: async (_ctx, row, patch) => {
      if (row.role && patch.isActive === false) throw conflict('This account receives automatic postings and cannot be deactivated');
      return patch;
    },
  },
};

// =============================================================================
// Journal (read-only here; posted by the ledger engine)
// =============================================================================
export const journalEntity: EntityConfig = {
  entityType: 'accounts.journal_entry',
  module: 'accounts',
  path: 'journals',
  names: { singular: 'JournalEntry', plural: 'JournalEntries' },
  table: journalEntry,
  schemas: { read: JournalEntrySchema },
  permissions: { view: P.journalsView },
  tenant: { dealershipKey: 'dealershipId' },
  tracked: false,
  search: ['entryNo', 'memo'],
  filters: {
    dealershipId: { key: 'dealershipId', schema: IdQuery },
    source: { key: 'source', schema: z.enum(['manual', 'reversal', 'invoice', 'payment', 'goods_receipt', 'stock']) },
    sourceType: { key: 'sourceType', schema: z.string().max(40) },
    sourceId: { key: 'sourceId', schema: IdQuery },
  },
  sort: { default: '-postedAt', keys: ['postedAt', 'entryDate', 'entryNo', 'totalAmount'] },
  hooks: {
    decorate: async (ctx, rows) => {
      const named = await withNames(ctx.tx, rows, { postedByName: { key: 'postedById', source: USER_NAME } });
      if (!rows.length) return named;
      const reversals = await ctx.tx.journalEntry.findMany({
        where: { reversalOfId: { in: rows.map((r) => r.id) } },
        select: { id: true, reversalOfId: true },
      });
      const by = new Map(reversals.map((r) => [r.reversalOfId, r.id]));
      return named.map((r) => ({ ...r, reversedById: by.get(r.id) ?? null }));
    },
  },
};

// =============================================================================
// Invoices: one engine for vehicle sales and service
// =============================================================================
/** Why an invoice's source document can no longer be invoiced, or null. */
async function sourceProblem(ctx: EntityCtx, row: Row): Promise<string | null> {
  if (row.sourceType === 'sales_order') {
    const o = await ctx.tx.salesOrder.findFirst({ where: { id: row.sourceId as number }, select: { status: true } });
    return o && ['approved', 'delivered'].includes(o.status) ? null : 'The sales order is no longer approved';
  }
  if (row.sourceType === 'job_card') {
    const j = await ctx.tx.jobCard.findFirst({ where: { id: row.sourceId as number }, select: { status: true } });
    return j?.status === 'completed' ? null : 'The job card is not completed';
  }
  return null;
}

async function canIssue(ctx: EntityCtx, row: Row) {
  const n = await ctx.tx.invoiceLine.count({ where: { invoiceId: row.id } });
  if (!n) return 'Add at least one line';
  if (toPaisa(row.totalAmount as string) <= 0n) return 'The invoice total must be greater than zero';
  return sourceProblem(ctx, row);
}

/** Issue: Dr receivables (customer) / Cr revenue by line kind / Cr sales tax. */
async function postInvoice(ctx: EntityCtx, row: Row) {
  const lines = await ctx.tx.invoiceLine.findMany({ where: { invoiceId: row.id } });
  const revenue = new Map<AccountRole, bigint>();
  let tax = 0n;
  for (const l of lines) {
    const role = REVENUE_ROLE[l.kind as keyof typeof REVENUE_ROLE];
    revenue.set(role, (revenue.get(role) ?? 0n) + toPaisa(l.amount));
    tax += toPaisa(l.taxAmount);
  }
  const invoiceDate = today();
  const entry = await post(ctx, {
    dealershipId: row.dealershipId as number,
    branchId: row.branchId as number | null,
    entryDate: invoiceDate,
    source: 'invoice',
    sourceType: 'invoice',
    sourceId: row.id,
    memo: `Invoice ${row.invoiceNo as string}${row.sourceNo ? ` for ${row.sourceNo as string}` : ''}`,
    lines: [
      { role: 'receivables', debit: row.totalAmount as string, customerId: row.customerId as number },
      ...[...revenue].map(([role, v]) => ({ role, credit: fromPaisa(v) })),
      { role: 'output_tax', credit: fromPaisa(tax) },
    ],
  });
  const due = addDays(invoiceDate, INVOICE_DUE_DAYS);
  await ctx.tx.invoice.update({
    where: { id: row.id },
    data: { journalEntryId: entry.id, invoiceDate, dueDate: (row.dueDate as string) > due ? (row.dueDate as string) : due },
  });
}

async function voidInvoice(ctx: EntityCtx, row: Row) {
  if (row.journalEntryId) await reverse(ctx, row.journalEntryId as number, `Void invoice ${row.invoiceNo as string}`);
}

export const invoiceEntity: EntityConfig = {
  entityType: 'accounts.invoice',
  module: 'accounts',
  path: 'invoices',
  names: { singular: 'Invoice', plural: 'Invoices' },
  table: invoice,
  // Created from a sales order or job card (see service); header edits while draft.
  schemas: { read: InvoiceSchema, update: InvoiceUpdate },
  permissions: { view: P.invoicesView, update: P.invoicesCreate },
  tenant: { dealershipKey: 'dealershipId' },
  search: ['invoiceNo', 'sourceNo'],
  filters: {
    dealershipId: { key: 'dealershipId', schema: IdQuery },
    status: statusFilter(['draft', 'issued', 'partially_paid', 'paid', 'void', 'cancelled']),
    kind: { key: 'kind', schema: z.enum(['vehicle_sale', 'service']) },
    customerId: { key: 'customerId', schema: IdQuery },
    sourceType: { key: 'sourceType', schema: z.string().max(40) },
    sourceId: { key: 'sourceId', schema: IdQuery },
  },
  sort: { default: '-createdAt', keys: ['createdAt', 'invoiceNo', 'invoiceDate', 'dueDate', 'totalAmount', 'status'] },
  workflow: {
    stateKey: 'status',
    initial: 'draft',
    states: [
      { key: 'draft', label: 'Draft' },
      { key: 'issued', label: 'Issued' },
      { key: 'partially_paid', label: 'Partly paid' },
      { key: 'paid', label: 'Paid', terminal: true },
      { key: 'void', label: 'Void', terminal: true },
      { key: 'cancelled', label: 'Cancelled', terminal: true },
    ],
    transitions: [
      { action: 'issue', label: 'Issue invoice', from: ['draft'], to: 'issued', permission: P.invoicesIssue, guard: canIssue, effect: postInvoice },
      { action: 'cancel', label: 'Cancel draft', from: ['draft'], to: 'cancelled', permission: P.invoicesCreate, requiresComment: true },
      {
        action: 'void',
        label: 'Void invoice',
        from: ['issued'],
        to: 'void',
        permission: P.invoicesVoid,
        requiresComment: true,
        guard: (_ctx, row) => (toPaisa(row.amountPaid as string) > 0n ? 'Void the payments against this invoice first' : null),
        effect: voidInvoice,
      },
      // Set by payments.
      { action: 'pay_partial', label: 'Partly paid', from: ['issued', 'paid'], to: 'partially_paid', permission: P.paymentsCreate, system: true },
      { action: 'pay_full', label: 'Paid', from: ['issued', 'partially_paid'], to: 'paid', permission: P.paymentsCreate, system: true },
      { action: 'unpay', label: 'Payment voided', from: ['partially_paid', 'paid'], to: 'issued', permission: P.paymentsVoid, system: true },
    ],
  },
  hooks: {
    beforeUpdate: async (_ctx, row, patch) => {
      if (row.status !== 'draft') throw conflict('Only draft invoices can be edited');
      return patch;
    },
    decorate: (ctx, rows) => withNames(ctx.tx, rows, { customerName: { key: 'customerId', source: CUSTOMER_NAME } }),
  },
};

// =============================================================================
// Payments: posted on creation; voiding posts a reversal
// =============================================================================
async function voidPayment(ctx: EntityCtx, row: Row) {
  if (row.journalEntryId) await reverse(ctx, row.journalEntryId as number, `Void payment ${row.paymentNo as string}`);
  const allocations = await ctx.tx.paymentAllocation.findMany({ where: { paymentId: row.id } });
  for (const a of allocations) {
    await ctx.tx.invoice.update({ where: { id: a.invoiceId }, data: { amountPaid: { decrement: a.amount } } });
    await refreshInvoiceStatus(ctx, a.invoiceId, `Payment ${row.paymentNo as string} voided`);
  }
}

export const paymentEntity: EntityConfig = {
  entityType: 'accounts.payment',
  module: 'accounts',
  path: 'payments',
  names: { singular: 'Payment', plural: 'Payments' },
  table: payment,
  schemas: { read: PaymentSchema },
  permissions: { view: P.paymentsView },
  tenant: { dealershipKey: 'dealershipId' },
  search: ['paymentNo', 'reference'],
  filters: {
    dealershipId: { key: 'dealershipId', schema: IdQuery },
    direction: { key: 'direction', schema: z.enum(['receipt', 'disbursement']) },
    method: { key: 'method', schema: z.enum(['cash', 'bank_transfer', 'cheque', 'card']) },
    status: statusFilter(['posted', 'void']),
    customerId: { key: 'customerId', schema: IdQuery },
    supplierId: { key: 'supplierId', schema: IdQuery },
  },
  sort: { default: '-createdAt', keys: ['createdAt', 'paymentNo', 'paymentDate', 'amount'] },
  workflow: {
    stateKey: 'status',
    initial: 'posted',
    states: [
      { key: 'posted', label: 'Posted' },
      { key: 'void', label: 'Void', terminal: true },
    ],
    transitions: [{ action: 'void', label: 'Void payment', from: ['posted'], to: 'void', permission: P.paymentsVoid, requiresComment: true, effect: voidPayment }],
  },
  hooks: {
    decorate: (ctx, rows) =>
      withNames(ctx.tx, rows, {
        customerName: { key: 'customerId', source: CUSTOMER_NAME },
        supplierName: { key: 'supplierId', source: SUPPLIER_NAME },
      }),
  },
};

export const accounts = new EntityService(accountEntity);
export const journals = new EntityService(journalEntity);
export const invoices = new EntityService(invoiceEntity);
export const payments = new EntityService(paymentEntity);

/** Moves an invoice to issued / partly paid / paid to match its amount paid. */
export async function refreshInvoiceStatus(ctx: EntityCtx, invoiceId: number, comment: string) {
  const inv = await ctx.tx.invoice.findFirst({ where: { id: invoiceId }, select: { status: true, totalAmount: true, amountPaid: true } });
  const paid = toPaisa(inv!.amountPaid);
  const want = paid === 0n ? 'issued' : paid >= toPaisa(inv!.totalAmount) ? 'paid' : 'partially_paid';
  if (want === inv!.status) return;
  const action = want === 'issued' ? 'unpay' : want === 'paid' ? 'pay_full' : 'pay_partial';
  await invoices.transition(ctx, invoiceId, action, comment, { system: true });
}
